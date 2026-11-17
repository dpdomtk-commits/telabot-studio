import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({ token: z.string().trim().min(20).max(200) });

export type TelegramValidation =
  | { ok: true; username: string | null; botId: number; firstName: string | null }
  | { ok: false; error: string };

export const validateTelegramToken = createServerFn({ method: "POST" })
  .validator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<TelegramValidation> => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${data.token}/getMe`);
      const json = (await res.json()) as {
        ok: boolean;
        description?: string;
        result?: { id: number; username?: string; first_name?: string };
      };
      if (!json.ok || !json.result) {
        return { ok: false, error: json.description ?? "Token inválido" };
      }
      return {
        ok: true,
        username: json.result.username ?? null,
        botId: json.result.id,
        firstName: json.result.first_name ?? null,
      };
    } catch {
      return { ok: false, error: "Não foi possível contatar o Telegram" };
    }
  });

const broadcastSchema = z.object({
  target: z.enum(["pix_pending", "abandoned", "all_leads"]),
  flowIds: z.array(z.string()).default([]),
  message: z.string().trim().min(1).max(4000),
  mediaUrl: z.string().trim().optional(),
  mediaKind: z.enum(["image", "video"]).optional(),
  offerName: z.string().trim().optional(),
  discountPrice: z.number().nonnegative().optional(),
});

export type RemarketingBroadcastResult = {
  ok: boolean;
  sent: number;
  failed: number;
  totalTargets: number;
  message: string;
};

/** Dispara campanha/broadcast real via Telegram Bot API para os leads segmentados dos fluxos escolhidos. */
export const sendRemarketingBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => broadcastSchema.parse(data))
  .handler(async ({ data, context }): Promise<RemarketingBroadcastResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMessage, sendPhoto, sendVideo, logActivity } = await import("@/lib/telegram.server");

    let flowQuery = supabaseAdmin
      .from("flows")
      .select("id,bot_id,name")
      .eq("user_id", context.userId);
    if (data.flowIds.length > 0) {
      flowQuery = flowQuery.in("id", data.flowIds);
    }
    const { data: flows } = await flowQuery;
    const botIds = Array.from(new Set((flows ?? []).map((f) => f.bot_id).filter(Boolean)));

    const botQuery = supabaseAdmin
      .from("bots")
      .select("id,token,name")
      .eq("user_id", context.userId)
      .eq("status", "active");
    const { data: bots } = botIds.length > 0 ? await botQuery.in("id", botIds) : await botQuery;

    if (!bots || bots.length === 0) {
      return {
        ok: false,
        sent: 0,
        failed: 0,
        totalTargets: 0,
        message: "Nenhum bot ativo encontrado para os fluxos selecionados.",
      };
    }

    const activeBotIds = bots.map((b) => b.id);
    const botTokenMap = new Map<string, string>(bots.map((b) => [b.id, b.token]));

    const [{ data: leads }, { data: payments }] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("id,bot_id,telegram_id,name,telegram_username,status")
        .eq("user_id", context.userId)
        .in("bot_id", activeBotIds)
        .order("created_at", { ascending: false })
        .limit(400),
      supabaseAdmin
        .from("payments")
        .select("lead_id,status,pix_code,product_name,amount_cents,created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(400),
    ]);

    const approvedLeadIds = new Set<string>();
    const pendingByLead = new Map<string, { pix_code: string | null; product_name: string | null }>();
    for (const p of payments ?? []) {
      if (!p.lead_id) continue;
      if (p.status === "approved") approvedLeadIds.add(p.lead_id);
      if (p.status === "pending" && !pendingByLead.has(p.lead_id)) {
        pendingByLead.set(p.lead_id, { pix_code: p.pix_code, product_name: p.product_name });
      }
    }

    const targetLeads = (leads ?? []).filter((lead) => {
      if (!lead.telegram_id) return false;
      if (data.target === "pix_pending") {
        return pendingByLead.has(lead.id) && !approvedLeadIds.has(lead.id);
      }
      if (data.target === "abandoned") {
        return !approvedLeadIds.has(lead.id);
      }
      return true;
    });

    if (targetLeads.length === 0) {
      return {
        ok: true,
        sent: 0,
        failed: 0,
        totalTargets: 0,
        message: "Nenhum lead elegível encontrado neste segmento no momento.",
      };
    }

    let replyMarkup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } | undefined;
    if (data.discountPrice && data.discountPrice > 0) {
      const cents = Math.round(data.discountPrice * 100);
      const shortTitle = (data.offerName || "Oferta VIP").slice(0, 22);
      const priceLabel = (cents / 100).toFixed(2).replace(".", ",");
      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: `🔥 ${data.offerName || "Aproveitar Oferta"} — R$ ${priceLabel}`,
              callback_data: `rmk_pix:${cents}:${shortTitle}`,
            },
          ],
        ],
      };
    }

    let sent = 0;
    let failed = 0;

    for (const lead of targetLeads) {
      const token = lead.bot_id ? botTokenMap.get(lead.bot_id) : undefined;
      if (!token || !lead.telegram_id) continue;

      const pendingInfo = pendingByLead.get(lead.id);
      const leadName = lead.name || (lead.telegram_username ? `@${lead.telegram_username}` : "Cliente");
      const planLabel = pendingInfo?.product_name || data.offerName || "Plano VIP";
      const pixCode = pendingInfo?.pix_code || "";

      const rendered = data.message
        .replace(/\{nome\}/gi, leadName)
        .replace(/\{plano\}/gi, planLabel)
        .replace(/\{pix_copia_cola\}/gi, pixCode);

      let res: { ok: boolean } = { ok: false };
      if (data.mediaUrl) {
        res =
          data.mediaKind === "video"
            ? await sendVideo(token, Number(lead.telegram_id), data.mediaUrl, rendered, replyMarkup)
            : await sendPhoto(token, Number(lead.telegram_id), data.mediaUrl, rendered, replyMarkup);
      } else {
        res = await sendMessage(token, Number(lead.telegram_id), rendered, replyMarkup);
      }

      if (res.ok) sent++;
      else failed++;
    }

    await logActivity(
      context.userId,
      "remarketing",
      `disparo manual (${data.target}): ${sent} enviado(s)`,
      undefined,
      { target: data.target, sent, failed, totalTargets: targetLeads.length },
    ).catch(() => undefined);

    return {
      ok: true,
      sent,
      failed,
      totalTargets: targetLeads.length,
      message: `Disparo concluído: ${sent} enviado(s) de ${targetLeads.length} lead(s) elegível(is).`,
    };
  });

/** Processa imediatamente a fila pendente de downsells agendados do usuário. */
export const triggerDownsellQueueNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { processScheduledDownsells } = await import("@/lib/downsell.server");
    return processScheduledDownsells();
  });
