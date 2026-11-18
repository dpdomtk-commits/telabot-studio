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
  plans: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1),
        price: z.number().nonnegative(),
      }),
    )
    .optional(),
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

    const fetchRows = async <T>(
      queryFn: (client: any) => Promise<{ data: T[] | null }>,
    ): Promise<T[]> => {
      const authRes = await queryFn(context.supabase);
      if (authRes?.data && authRes.data.length > 0) return authRes.data;
      const adminRes = await queryFn(supabaseAdmin);
      return adminRes?.data ?? authRes?.data ?? [];
    };

    const flows = await fetchRows<{ id: string; bot_id: string | null; name: string }>((c) => {
      let q = c.from("flows").select("id,bot_id,name").eq("user_id", context.userId);
      if (data.flowIds.length > 0) q = q.in("id", data.flowIds);
      return q;
    });
    const botIds = Array.from(new Set(flows.map((f) => f.bot_id).filter(Boolean))) as string[];

    const bots = await fetchRows<{ id: string; token: string; name: string }>((c) => {
      const q = c.from("bots").select("id,token,name").eq("user_id", context.userId);
      return botIds.length > 0 ? q.in("id", botIds) : q;
    });

    if (bots.length === 0) {
      return {
        ok: false,
        sent: 0,
        failed: 0,
        totalTargets: 0,
        message: "Nenhum bot encontrado para os fluxos selecionados.",
      };
    }

    const activeBotIds = bots.map((b) => b.id);
    const botTokenMap = new Map<string, string>(bots.map((b) => [b.id, b.token]));

    const [leads, payments] = await Promise.all([
      fetchRows<{
        id: string;
        bot_id: string | null;
        telegram_id: number | null;
        name: string | null;
        telegram_username: string | null;
        status: string;
      }>((c) =>
        c
          .from("leads")
          .select("id,bot_id,telegram_id,name,telegram_username,status")
          .eq("user_id", context.userId)
          .in("bot_id", activeBotIds)
          .order("created_at", { ascending: false })
          .limit(400),
      ),
      fetchRows<{
        lead_id: string | null;
        status: string;
        pix_code: string | null;
        product_name: string | null;
        amount_cents: number;
      }>((c) =>
        c
          .from("payments")
          .select("lead_id,status,pix_code,product_name,amount_cents,created_at")
          .eq("user_id", context.userId)
          .order("created_at", { ascending: false })
          .limit(400),
      ),
    ]);

    const approvedLeadIds = new Set<string>();
    const pendingByLead = new Map<string, { pix_code: string | null; product_name: string | null }>();
    for (const p of payments) {
      if (!p.lead_id) continue;
      if (p.status === "approved") approvedLeadIds.add(p.lead_id);
      if (p.status === "pending" && !pendingByLead.has(p.lead_id)) {
        pendingByLead.set(p.lead_id, { pix_code: p.pix_code, product_name: p.product_name });
      }
    }

    const targetLeads = leads.filter((lead) => {
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
    if (data.plans && data.plans.length > 0) {
      replyMarkup = {
        inline_keyboard: data.plans.map((p) => {
          const cents = Math.max(100, Math.round(p.price * 100));
          const shortTitle = (p.name || "Oferta VIP").slice(0, 22);
          const priceLabel = (cents / 100).toFixed(2).replace(".", ",");
          return [
            {
              text: `🔥 ${p.name.slice(0, 24)} — R$ ${priceLabel}`,
              callback_data: `rmk_pix:${cents}:${shortTitle}`,
            },
          ];
        }),
      };
    } else if (data.discountPrice && data.discountPrice > 0) {
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

export type LeadChatMessageRow = {
  id: string;
  conversation_id: string;
  direction: string;
  kind: string;
  body: string | null;
  file_id: string | null;
  file_name: string | null;
  telegram_message_id: number | null;
  created_at: string;
};

export type LeadChatPaymentRow = {
  id: string;
  amount_cents: number;
  status: string;
  product_name: string | null;
  pix_code: string | null;
  created_at: string;
  paid_at: string | null;
};

export type LeadChatFlowPlan = {
  id: string;
  name: string;
  price: number;
  duration: string;
};

type ResolvedBotRow = {
  id: string;
  user_id: string;
  name: string;
  token: string;
  telegram_username: string | null;
  status: string;
};

type ResolvedLeadRow = {
  id: string;
  user_id: string;
  bot_id: string | null;
  name: string | null;
  telegram_id: number | null;
  telegram_username: string | null;
  status: string;
  created_at: string;
};

async function resolveLeadAndBot(
  context: { supabase: any; userId: string },
  supabaseAdmin: any,
  opts: {
    leadId: string;
    botId?: string | undefined;
    telegramId?: number | undefined;
    leadName?: string | undefined;
  },
): Promise<{ lead: ResolvedLeadRow | null; bot: ResolvedBotRow | null }> {
  let lead: ResolvedLeadRow | null = null;

  const authLeadRes = await context.supabase
    .from("leads")
    .select("id,user_id,bot_id,name,telegram_id,telegram_username,status,created_at")
    .eq("id", opts.leadId)
    .maybeSingle();
  if (authLeadRes?.data) {
    lead = authLeadRes.data as ResolvedLeadRow;
  } else {
    const adminLeadRes = await supabaseAdmin
      .from("leads")
      .select("id,user_id,bot_id,name,telegram_id,telegram_username,status,created_at")
      .eq("id", opts.leadId)
      .maybeSingle();
    if (adminLeadRes?.data) {
      lead = adminLeadRes.data as ResolvedLeadRow;
    } else if (opts.telegramId) {
      lead = {
        id: opts.leadId,
        user_id: context.userId,
        bot_id: opts.botId ?? null,
        name: opts.leadName ?? null,
        telegram_id: opts.telegramId,
        telegram_username: null,
        status: "engaged",
        created_at: new Date().toISOString(),
      };
    }
  }

  const findBotById = async (targetBotId: string | null | undefined): Promise<ResolvedBotRow | null> => {
    if (!targetBotId) return null;
    const authBot = await context.supabase
      .from("bots")
      .select("id,user_id,name,token,telegram_username,status")
      .eq("id", targetBotId)
      .maybeSingle();
    if (authBot?.data?.token) return authBot.data as ResolvedBotRow;
    const adminBot = await supabaseAdmin
      .from("bots")
      .select("id,user_id,name,token,telegram_username,status")
      .eq("id", targetBotId)
      .maybeSingle();
    if (adminBot?.data?.token) return adminBot.data as ResolvedBotRow;
    return null;
  };

  let bot = await findBotById(opts.botId);
  if (!bot) bot = await findBotById(lead?.bot_id);

  if (!bot) {
    const activeAuth = await context.supabase
      .from("bots")
      .select("id,user_id,name,token,telegram_username,status")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeAuth?.data?.token) {
      bot = activeAuth.data as ResolvedBotRow;
    } else {
      const anyAuth = await context.supabase
        .from("bots")
        .select("id,user_id,name,token,telegram_username,status")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (anyAuth?.data?.token) bot = anyAuth.data as ResolvedBotRow;
    }
  }

  if (!bot) {
    const ownerId = lead?.user_id || context.userId;
    const activeAdmin = await supabaseAdmin
      .from("bots")
      .select("id,user_id,name,token,telegram_username,status")
      .eq("user_id", ownerId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeAdmin?.data?.token) {
      bot = activeAdmin.data as ResolvedBotRow;
    } else {
      const anyAdmin = await supabaseAdmin
        .from("bots")
        .select("id,user_id,name,token,telegram_username,status")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (anyAdmin?.data?.token) bot = anyAdmin.data as ResolvedBotRow;
    }
  }

  if (lead && bot && !lead.id.startsWith("lead-") && lead.bot_id !== bot.id) {
    lead = { ...lead, bot_id: bot.id };
    Promise.allSettled([
      context.supabase.from("leads").update({ bot_id: bot.id }).eq("id", lead.id),
      supabaseAdmin.from("leads").update({ bot_id: bot.id }).eq("id", lead.id),
    ]).catch(() => undefined);
  }

  return { lead, bot };
}

async function ensureLeadConversation(
  context: { supabase: any; userId: string },
  supabaseAdmin: any,
  params: {
    userId: string;
    botId: string | null;
    leadId: string;
    preview: string;
    lastMessageAt: string;
    resetUnread?: boolean;
  },
): Promise<string | null> {
  if (params.leadId.startsWith("lead-")) return null;

  const findExisting = async (client: any) => {
    const res = await client
      .from("conversations")
      .select("id,unread_count")
      .eq("lead_id", params.leadId)
      .maybeSingle();
    return (res?.data as { id: string; unread_count: number } | null) ?? null;
  };

  let existing = (await findExisting(context.supabase)) ?? (await findExisting(supabaseAdmin));
  if (existing?.id) {
    if (params.resetUnread) {
      if ((existing.unread_count ?? 0) > 0) {
        await Promise.allSettled([
          context.supabase.from("conversations").update({ unread_count: 0 }).eq("id", existing.id),
          supabaseAdmin.from("conversations").update({ unread_count: 0 }).eq("id", existing.id),
        ]);
      }
    }
    return existing.id;
  }

  const insertPayload = {
    user_id: params.userId,
    bot_id: params.botId,
    lead_id: params.leadId,
    status: "open",
    last_message_at: params.lastMessageAt,
    last_message_preview: params.preview.slice(0, 160),
    unread_count: 0,
  };

  const authCreated = await context.supabase
    .from("conversations")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();
  if (authCreated?.data?.id) return authCreated.data.id as string;

  const adminCreated = await supabaseAdmin
    .from("conversations")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();
  return (adminCreated?.data?.id as string | undefined) ?? null;
}

const leadChatContextSchema = z.object({
  leadId: z.string().min(1),
  botId: z.string().optional(),
  telegramId: z.number().optional(),
  leadName: z.string().optional(),
});

export const getLeadChatContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => leadChatContextSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [{ supabaseAdmin }, { normalizeAdvancedConfig }, { leadChatMemoryCache }] =
      await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("@/lib/flow-advanced"),
        import("@/lib/telegram.server"),
      ]);

    const { lead, bot } = await resolveLeadAndBot(context, supabaseAdmin, {
      leadId: data.leadId,
      botId: data.botId,
      telegramId: data.telegramId,
      leadName: data.leadName,
    });

    if (!lead) {
      return {
        ok: false as const,
        error: "Lead não encontrado.",
        conversationId: null,
        messages: [] as LeadChatMessageRow[],
        payments: [] as LeadChatPaymentRow[],
        flowPlans: [] as LeadChatFlowPlan[],
        botInfo: null as { id: string; name: string; telegram_username: string | null; status: string } | null,
      };
    }

    const ownerId = lead.user_id || context.userId;
    const conversationId = await ensureLeadConversation(context, supabaseAdmin, {
      userId: ownerId,
      botId: bot?.id ?? lead.bot_id,
      leadId: lead.id,
      preview: "Conversa iniciada",
      lastMessageAt: lead.created_at,
      resetUnread: true,
    });

    const fetchWithFallback = async <T>(
      queryFn: (client: any) => Promise<{ data: T[] | null }>,
    ): Promise<T[]> => {
      const r1 = await queryFn(context.supabase);
      if (r1?.data && r1.data.length > 0) return r1.data;
      const r2 = await queryFn(supabaseAdmin);
      return r2?.data ?? r1?.data ?? [];
    };

    const [dbMessages, activityMsgLogs, payments, flowRows] = await Promise.all([
      conversationId
        ? fetchWithFallback<LeadChatMessageRow>((c) =>
            c
              .from("messages")
              .select("id,conversation_id,direction,kind,body,file_id,file_name,telegram_message_id,created_at")
              .eq("conversation_id", conversationId)
              .order("created_at", { ascending: true })
              .limit(200),
          )
        : Promise.resolve([] as LeadChatMessageRow[]),
      fetchWithFallback<{ id: string; action: string; metadata: any; created_at: string }>((c) =>
        c
          .from("activity_logs")
          .select("id,action,metadata,created_at")
          .eq("entity", "lead_chat_msg")
          .eq("entity_id", lead.id)
          .order("created_at", { ascending: true })
          .limit(200),
      ),
      fetchWithFallback<LeadChatPaymentRow>((c) =>
        c
          .from("payments")
          .select("id,amount_cents,status,product_name,pix_code,created_at,paid_at")
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ),
      fetchWithFallback<{ id: string; bot_id: string; name: string; simple_config: unknown; status: string; is_active: boolean }>(
        (c) =>
          (bot?.id
            ? c
                .from("flows")
                .select("id,bot_id,name,simple_config,status,is_active")
                .eq("bot_id", bot.id)
            : c.from("flows").select("id,bot_id,name,simple_config,status,is_active")
          )
            .order("is_active", { ascending: false })
            .order("updated_at", { ascending: false })
            .limit(1),
      ),
    ]);

    let flowPlans: LeadChatFlowPlan[] = [];
    let welcomeCopy = "";
    const activeFlow = flowRows[0];
    if (activeFlow?.simple_config) {
      try {
        const cfg = normalizeAdvancedConfig(activeFlow.simple_config as Record<string, unknown>);
        flowPlans = (cfg.plans?.items ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price) || 0,
          duration: p.duration || "Acesso",
        }));
        welcomeCopy = (
          cfg.welcome?.messagePt ||
          cfg.welcome?.message ||
          cfg.gate?.messagePt ||
          cfg.gate?.message ||
          ""
        ).trim();
      } catch {
        flowPlans = [];
      }
    }

    const fromActivityLogs: LeadChatMessageRow[] = activityMsgLogs
      .map((row) => {
        const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<
          string,
          unknown
        >;
        const body = typeof meta["body"] === "string" ? meta["body"] : "";
        if (!body) return null;
        return {
          id: typeof meta["id"] === "string" ? meta["id"] : `log-${row.id}`,
          conversation_id: conversationId ?? lead.id,
          direction: meta["direction"] === "out" || row.action === "out" ? "out" : "in",
          kind: typeof meta["kind"] === "string" ? meta["kind"] : "text",
          body,
          file_id: typeof meta["file_id"] === "string" ? meta["file_id"] : null,
          file_name: typeof meta["file_name"] === "string" ? meta["file_name"] : null,
          telegram_message_id:
            typeof meta["telegram_message_id"] === "number" ? meta["telegram_message_id"] : null,
          created_at: typeof meta["created_at"] === "string" ? meta["created_at"] : row.created_at,
        };
      })
      .filter((x): x is LeadChatMessageRow => x !== null);

    const memoryKeys = [
      lead.id,
      lead.telegram_id ? String(lead.telegram_id) : null,
      bot?.id && lead.telegram_id ? `${bot.id}:${lead.telegram_id}` : null,
    ].filter((k): k is string => Boolean(k));

    const fromMemory: LeadChatMessageRow[] = [];
    for (const key of memoryKeys) {
      for (const m of leadChatMemoryCache.get(key) ?? []) {
        fromMemory.push({
          id: m.id,
          conversation_id: conversationId ?? lead.id,
          direction: m.direction,
          kind: m.kind,
          body: m.body,
          file_id: m.file_id,
          file_name: m.file_name,
          telegram_message_id: m.telegram_message_id,
          created_at: m.created_at,
        });
      }
    }

    const realMessagesRaw = [...dbMessages, ...fromActivityLogs, ...fromMemory];
    const hasRealStart = realMessagesRaw.some(
      (m) => m.direction === "in" && (m.body ?? "").trim().startsWith("/start"),
    );

    const leadStartMs = new Date(lead.created_at).getTime();
    const leadDisplayName =
      lead.name || (lead.telegram_username ? `@${lead.telegram_username}` : "Cliente");
    const synthesized: LeadChatMessageRow[] = [];

    if (!hasRealStart) {
      synthesized.push({
        id: `synth-start-${lead.id}`,
        conversation_id: conversationId ?? lead.id,
        direction: "in",
        kind: "command",
        body: "/start",
        file_id: null,
        file_name: null,
        telegram_message_id: null,
        created_at: lead.created_at,
      });

      const resolvedWelcome = (
        welcomeCopy ||
        `Olá ${leadDisplayName}! Bem-vindo ao atendimento automático. Veja nossos planos e escolha a melhor opção abaixo.`
      ).replace(/\{nome\}/gi, leadDisplayName);

      synthesized.push({
        id: `synth-welcome-${lead.id}`,
        conversation_id: conversationId ?? lead.id,
        direction: "out",
        kind: "flow_welcome",
        body: resolvedWelcome,
        file_id: null,
        file_name: null,
        telegram_message_id: null,
        created_at: new Date(leadStartMs + 1000).toISOString(),
      });
    }

    const chronologicalPayments = [...payments].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    for (const p of chronologicalPayments) {
      const pMs = new Date(p.created_at).getTime();
      const planTitle = p.product_name || "Plano VIP";
      const priceFormatted = ((p.amount_cents || 0) / 100).toFixed(2).replace(".", ",");

      synthesized.push({
        id: `synth-pay-select-${p.id}`,
        conversation_id: conversationId ?? lead.id,
        direction: "in",
        kind: "plan_select",
        body: `🛍️ Selecionou o plano: ${planTitle} (R$ ${priceFormatted})`,
        file_id: null,
        file_name: null,
        telegram_message_id: null,
        created_at: new Date(pMs).toISOString(),
      });

      synthesized.push({
        id: `synth-pay-pix-${p.id}`,
        conversation_id: conversationId ?? lead.id,
        direction: "out",
        kind: "pix_generated",
        body: p.pix_code
          ? `💠 Cobrança PIX gerada: ${planTitle} — R$ ${priceFormatted}\n\n${p.pix_code}`
          : `💠 Cobrança gerada: ${planTitle} — R$ ${priceFormatted}`,
        file_id: null,
        file_name: null,
        telegram_message_id: null,
        created_at: new Date(pMs + 1000).toISOString(),
      });

      if (p.status === "approved") {
        const paidAt = p.paid_at || new Date(pMs + 5000).toISOString();
        synthesized.push({
          id: `synth-pay-approved-${p.id}`,
          conversation_id: conversationId ?? lead.id,
          direction: "out",
          kind: "payment_approved",
          body: `✅ Pagamento confirmado (${planTitle} — R$ ${priceFormatted}) e entrega VIP liberada para o cliente.`,
          file_id: null,
          file_name: null,
          telegram_message_id: null,
          created_at: paidAt,
        });
      }
    }

    const combined = [...synthesized, ...realMessagesRaw].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    const deduped: LeadChatMessageRow[] = [];
    const seenIds = new Set<string>();
    for (const msg of combined) {
      if (seenIds.has(msg.id)) continue;
      const msgTime = new Date(msg.created_at).getTime();
      const duplicateByContent = deduped.some(
        (existing) =>
          existing.direction === msg.direction &&
          (existing.body ?? "").trim() === (msg.body ?? "").trim() &&
          Math.abs(new Date(existing.created_at).getTime() - msgTime) < 10_000,
      );
      if (duplicateByContent) continue;
      seenIds.add(msg.id);
      deduped.push(msg);
    }

    return {
      ok: true as const,
      conversationId,
      messages: deduped,
      payments,
      flowPlans,
      botInfo: bot
        ? {
            id: bot.id,
            name: bot.name,
            telegram_username: bot.telegram_username,
            status: bot.status,
          }
        : null,
    };
  });

const leadChatSendSchema = z.object({
  leadId: z.string().min(1),
  botId: z.string().optional(),
  telegramId: z.number().optional(),
  leadName: z.string().optional(),
  message: z.string().trim().max(4000).default(""),
  mediaUrl: z.string().trim().optional(),
  mediaKind: z.enum(["image", "video"]).optional(),
  guidedMode: z
    .enum([
      "text",
      "view_plans_button",
      "trigger_plans_menu",
      "specific_plan",
      "resend_pending_pix",
      "custom_pix_offer",
      "vip_link",
    ])
    .default("text"),
  planId: z.string().optional(),
  planName: z.string().optional(),
  planPriceBRL: z.number().nonnegative().optional(),
  paymentId: z.string().optional(),
  offerTitle: z.string().trim().optional(),
  offerPriceBRL: z.number().nonnegative().optional(),
  buttonLabel: z.string().trim().optional(),
  buttonUrl: z.string().trim().optional(),
});

async function recordOutboundLeadMessage(params: {
  contextSupabase: any;
  supabaseAdmin: any;
  userId: string;
  botId: string;
  leadId: string;
  telegramId: number | null;
  leadStatus: string;
  kind: string;
  body: string;
  fileId?: string | null;
  telegramMessageId?: number | null;
}): Promise<LeadChatMessageRow> {
  const nowIso = new Date().toISOString();
  const msgId = `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const convId = await ensureLeadConversation(
    { supabase: params.contextSupabase, userId: params.userId },
    params.supabaseAdmin,
    {
      userId: params.userId,
      botId: params.botId,
      leadId: params.leadId,
      preview: params.body,
      lastMessageAt: nowIso,
    },
  );

  if (convId) {
    await Promise.allSettled([
      params.contextSupabase
        .from("conversations")
        .update({
          bot_id: params.botId,
          status: "open",
          last_message_at: nowIso,
          last_message_preview: params.body.slice(0, 160),
          unread_count: 0,
        })
        .eq("id", convId),
      params.supabaseAdmin
        .from("conversations")
        .update({
          bot_id: params.botId,
          status: "open",
          last_message_at: nowIso,
          last_message_preview: params.body.slice(0, 160),
          unread_count: 0,
        })
        .eq("id", convId),
    ]);
  }

  const chatMsg = {
    id: msgId,
    direction: "out" as const,
    kind: params.kind,
    body: params.body,
    file_id: params.fileId ?? null,
    file_name: null,
    telegram_message_id: params.telegramMessageId ?? null,
    created_at: nowIso,
  };

  const { appendLeadChatMemory } = await import("@/lib/telegram.server");
  appendLeadChatMemory(
    [params.leadId, params.telegramId, `${params.botId}:${params.telegramId ?? ""}`],
    chatMsg,
  );

  await Promise.allSettled([
    params.contextSupabase.from("activity_logs").insert({
      user_id: params.userId,
      entity: "lead_chat_msg",
      entity_id: params.leadId,
      action: "out",
      metadata: chatMsg as never,
    }),
    convId
      ? params.supabaseAdmin.from("messages").insert({
          conversation_id: convId,
          user_id: params.userId,
          direction: "out",
          kind: params.kind,
          body: params.body,
          file_id: params.fileId ?? null,
          telegram_message_id: params.telegramMessageId ?? null,
        })
      : Promise.resolve(),
  ]);

  if (params.leadStatus === "new" && !params.leadId.startsWith("lead-")) {
    await Promise.allSettled([
      params.contextSupabase.from("leads").update({ status: "engaged" }).eq("id", params.leadId),
      params.supabaseAdmin.from("leads").update({ status: "engaged" }).eq("id", params.leadId),
    ]);
  }

  return {
    id: msgId,
    conversation_id: convId ?? params.leadId,
    direction: "out",
    kind: params.kind,
    body: params.body,
    file_id: params.fileId ?? null,
    file_name: null,
    telegram_message_id: params.telegramMessageId ?? null,
    created_at: nowIso,
  };
}

export const sendLeadGuidedMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => leadChatSendSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [{ supabaseAdmin }, telegramMod] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/telegram.server"),
    ]);
    const {
      sendMessage,
      sendPhoto,
      sendVideo,
      getCachedBotConfig,
      sendBrlPlansMenu,
      logActivity,
    } = telegramMod;

    const { lead, bot } = await resolveLeadAndBot(context, supabaseAdmin, {
      leadId: data.leadId,
      botId: data.botId,
      telegramId: data.telegramId,
      leadName: data.leadName,
    });

    const targetTelegramId = lead?.telegram_id ?? data.telegramId ?? null;
    if (!lead || !targetTelegramId) {
      return {
        ok: false as const,
        error: "Este lead ainda não possui um Telegram ID válido para receber mensagens.",
        messageRow: null,
      };
    }

    if (!bot || !bot.token) {
      return {
        ok: false as const,
        error: "Nenhum bot com token configurado foi encontrado na sua conta.",
        messageRow: null,
      };
    }

    const ownerId = lead.user_id || context.userId;

    const pendingAuth = await context.supabase
      .from("payments")
      .select("id,pix_code,product_name,amount_cents")
      .eq("lead_id", lead.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const latestPending =
      pendingAuth?.data ??
      (
        await supabaseAdmin
          .from("payments")
          .select("id,pix_code,product_name,amount_cents")
          .eq("lead_id", lead.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      )?.data ??
      null;

    const targetPayment =
      data.paymentId && latestPending?.id !== data.paymentId
        ? (
            await context.supabase
              .from("payments")
              .select("id,pix_code,product_name,amount_cents")
              .eq("id", data.paymentId)
              .eq("lead_id", lead.id)
              .maybeSingle()
          )?.data ?? latestPending
        : latestPending;

    const leadName =
      lead.name || (lead.telegram_username ? `@${lead.telegram_username}` : data.leadName || "Cliente");
    const planLabel = data.planName || data.offerTitle || targetPayment?.product_name || "Plano VIP";
    const pixCode = targetPayment?.pix_code || "";

    const renderVars = (raw: string) =>
      raw
        .replace(/\{nome\}/gi, leadName)
        .replace(/\{plano\}/gi, planLabel)
        .replace(/\{pix_copia_cola\}/gi, pixCode);

    let textToSend = renderVars(data.message || "");
    const chatId = Number(targetTelegramId);
    let replyMarkup:
      | {
          inline_keyboard: Array<
            Array<{ text: string; callback_data?: string; url?: string }>
          >;
        }
      | undefined;
    let actionSummary = "";

    if (data.guidedMode === "view_plans_button") {
      if (!textToSend) {
        textToSend = `Olá ${leadName}! Clique no botão abaixo para escolher seu plano com acesso imediato:`;
      }
      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: (data.buttonLabel || "📋 Ver Planos VIP").slice(0, 48),
              callback_data: "nav:plans",
            },
          ],
        ],
      };
      actionSummary = "📋 [Botão: Ver Planos]";
    } else if (data.guidedMode === "specific_plan") {
      if (!data.planId) {
        return { ok: false as const, error: "Selecione um plano do fluxo antes de enviar.", messageRow: null };
      }
      const priceStr = (data.planPriceBRL ?? 0).toFixed(2).replace(".", ",");
      if (!textToSend) {
        textToSend = `🔥 Separei o plano <b>${planLabel}</b> especialmente para você finalizar agora com liberação imediata:`;
      }
      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: `🔥 ${planLabel.slice(0, 26)} — R$ ${priceStr}`,
              callback_data: `pix_plan:${data.planId}`,
            },
          ],
        ],
      };
      actionSummary = `🎯 [Plano: ${planLabel} · R$ ${priceStr}]`;
    } else if (data.guidedMode === "resend_pending_pix") {
      if (!targetPayment || !targetPayment.pix_code) {
        return {
          ok: false as const,
          error: "Este cliente não possui nenhum PIX pendente com código salvo.",
          messageRow: null,
        };
      }
      if (!textToSend) {
        textToSend = `⚡ ${leadName}, aqui está o seu código PIX para liberar <b>${targetPayment.product_name || "seu acesso VIP"}</b> agora mesmo:`;
      }
      if (!textToSend.includes(targetPayment.pix_code)) {
        textToSend = `${textToSend}\n\n<code>${targetPayment.pix_code}</code>`;
      }
      replyMarkup = {
        inline_keyboard: [
          [{ text: "📋 Copiar Código PIX", callback_data: `copy_pix:${targetPayment.id}` }],
          [{ text: "✅ Já Paguei", callback_data: `check_payment:${targetPayment.id}` }],
        ],
      };
      actionSummary = `💠 [PIX Reenviado: R$ ${((targetPayment.amount_cents || 0) / 100).toFixed(2).replace(".", ",")}]`;
    } else if (data.guidedMode === "custom_pix_offer") {
      const priceBRL = data.offerPriceBRL && data.offerPriceBRL > 0 ? data.offerPriceBRL : 19.9;
      const cents = Math.max(100, Math.round(priceBRL * 100));
      const shortTitle = (data.offerTitle || "Oferta Especial VIP").slice(0, 22);
      const priceStr = (cents / 100).toFixed(2).replace(".", ",");
      if (!textToSend) {
        textToSend = `🎁 ${leadName}, liberei uma condição especial exclusiva para você agora: <b>${shortTitle}</b> por apenas <b>R$ ${priceStr}</b>!`;
      }
      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: `🔥 ${shortTitle} — R$ ${priceStr}`,
              callback_data: `rmk_pix:${cents}:${shortTitle}`,
            },
          ],
        ],
      };
      actionSummary = `🏷️ [Oferta PIX: ${shortTitle} · R$ ${priceStr}]`;
    } else if (data.guidedMode === "vip_link") {
      const targetUrl = (data.buttonUrl || "").trim();
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return {
          ok: false as const,
          error: "Informe uma URL válida (https://...) para o botão de acesso VIP.",
          messageRow: null,
        };
      }
      if (!textToSend) {
        textToSend = `🔓 Aqui está o seu link de acesso exclusivo:`;
      }
      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: (data.buttonLabel || "🔓 Acessar Área VIP").slice(0, 48),
              url: targetUrl,
            },
          ],
        ],
      };
      actionSummary = `🔗 [Link VIP: ${data.buttonLabel || "Acessar"}]`;
    }

    if (data.guidedMode === "trigger_plans_menu") {
      let introMsgId: number | null = null;
      if (textToSend) {
        const introRes = await sendMessage(bot.token, chatId, textToSend);
        if (!introRes.ok) {
          return {
            ok: false as const,
            error: introRes.error ?? "Falha ao enviar mensagem pelo bot.",
            messageRow: null,
          };
        }
        introMsgId = introRes.result?.message_id ?? null;
      }

      const { cfg } = await getCachedBotConfig(bot.id);
      await sendBrlPlansMenu(
        {
          userId: ownerId,
          botId: bot.id,
          token: bot.token,
          leadId: lead.id,
          chatId,
        },
        cfg,
        false,
      );

      const loggedBody = textToSend
        ? `${textToSend}\n\n🚀 [Cardápio oficial de Planos exibido no Telegram]`
        : "🚀 [Cardápio oficial de Planos exibido no Telegram]";

      const messageRow = await recordOutboundLeadMessage({
        contextSupabase: context.supabase,
        supabaseAdmin,
        userId: ownerId,
        botId: bot.id,
        leadId: lead.id,
        telegramId: targetTelegramId,
        leadStatus: lead.status,
        kind: "trigger_plans_menu",
        body: loggedBody,
        telegramMessageId: introMsgId,
      });

      await logActivity(
        ownerId,
        "lead_chat",
        `cardápio de planos enviado para ${leadName}`,
        lead.id,
        { botId: bot.id, guidedMode: data.guidedMode },
      ).catch(() => undefined);

      return { ok: true as const, error: null, messageRow };
    }

    if (!textToSend && !data.mediaUrl) {
      return { ok: false as const, error: "Digite uma mensagem ou informe uma mídia para enviar.", messageRow: null };
    }

    let sendRes: { ok: boolean; error?: string; result?: any };
    if (data.mediaUrl) {
      sendRes =
        data.mediaKind === "video"
          ? await sendVideo(bot.token, chatId, data.mediaUrl, textToSend || undefined, replyMarkup)
          : await sendPhoto(bot.token, chatId, data.mediaUrl, textToSend || undefined, replyMarkup);
    } else {
      sendRes = await sendMessage(bot.token, chatId, textToSend, replyMarkup);
    }

    if (!sendRes.ok) {
      return {
        ok: false as const,
        error: sendRes.error ?? "O Telegram recusou o envio (o cliente pode ter bloqueado o bot).",
        messageRow: null,
      };
    }

    const loggedBody = actionSummary
      ? textToSend
        ? `${textToSend}\n\n${actionSummary}`
        : actionSummary
      : textToSend || (data.mediaKind === "video" ? "🎬 Vídeo enviado" : "📷 Foto enviada");

    const msgKind =
      data.guidedMode === "text"
        ? data.mediaUrl
          ? data.mediaKind ?? "photo"
          : "text"
        : data.guidedMode;

    const messageRow = await recordOutboundLeadMessage({
      contextSupabase: context.supabase,
      supabaseAdmin,
      userId: ownerId,
      botId: bot.id,
      leadId: lead.id,
      telegramId: targetTelegramId,
      leadStatus: lead.status,
      kind: msgKind,
      body: loggedBody,
      fileId: data.mediaUrl ?? null,
      telegramMessageId: sendRes.result?.message_id ?? null,
    });

    await logActivity(
      ownerId,
      "lead_chat",
      `mensagem guiada (${data.guidedMode}) enviada para ${leadName}`,
      lead.id,
      { botId: bot.id, guidedMode: data.guidedMode },
    ).catch(() => undefined);

    return { ok: true as const, error: null, messageRow };
  });
