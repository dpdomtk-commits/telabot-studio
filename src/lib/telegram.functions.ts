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

const leadChatContextSchema = z.object({
  leadId: z.string().min(1),
});

export const getLeadChatContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => leadChatContextSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [{ supabaseAdmin }, { normalizeAdvancedConfig }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/flow-advanced"),
    ]);

    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id,user_id,bot_id,name,telegram_id,telegram_username,status,created_at,bots(id,name,telegram_username,status)")
      .eq("id", data.leadId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (leadErr || !lead) {
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

    const { data: existingConv } = await supabaseAdmin
      .from("conversations")
      .select("id,unread_count")
      .eq("lead_id", lead.id)
      .maybeSingle();

    let conversationId = existingConv?.id ?? null;
    if (conversationId) {
      if ((existingConv?.unread_count ?? 0) > 0) {
        await supabaseAdmin
          .from("conversations")
          .update({ unread_count: 0 })
          .eq("id", conversationId);
      }
    } else {
      const { data: createdConv } = await supabaseAdmin
        .from("conversations")
        .insert({
          user_id: context.userId,
          bot_id: lead.bot_id,
          lead_id: lead.id,
          status: "open",
          last_message_at: lead.created_at,
          last_message_preview: "Conversa iniciada",
          unread_count: 0,
        })
        .select("id")
        .maybeSingle();
      conversationId = createdConv?.id ?? null;
    }

    const [messagesRes, paymentsRes, flowRes] = await Promise.all([
      conversationId
        ? supabaseAdmin
            .from("messages")
            .select("id,conversation_id,direction,kind,body,file_id,file_name,telegram_message_id,created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true })
            .limit(200)
        : Promise.resolve({ data: [] as LeadChatMessageRow[] }),
      supabaseAdmin
        .from("payments")
        .select("id,amount_cents,status,product_name,pix_code,created_at,paid_at")
        .eq("lead_id", lead.id)
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(20),
      lead.bot_id
        ? supabaseAdmin
            .from("flows")
            .select("id,name,simple_config,status,is_active")
            .eq("bot_id", lead.bot_id)
            .eq("user_id", context.userId)
            .order("is_active", { ascending: false })
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    let flowPlans: LeadChatFlowPlan[] = [];
    if (flowRes?.data?.simple_config) {
      try {
        const cfg = normalizeAdvancedConfig(flowRes.data.simple_config as Record<string, unknown>);
        flowPlans = (cfg.plans?.items ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price) || 0,
          duration: p.duration || "Acesso",
        }));
      } catch {
        flowPlans = [];
      }
    }

    const botRel = lead.bots as unknown as {
      id: string;
      name: string;
      telegram_username: string | null;
      status: string;
    } | null;

    return {
      ok: true as const,
      conversationId,
      messages: (messagesRes.data ?? []) as LeadChatMessageRow[],
      payments: (paymentsRes.data ?? []) as LeadChatPaymentRow[],
      flowPlans,
      botInfo: botRel,
    };
  });

const leadChatSendSchema = z.object({
  leadId: z.string().min(1),
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
  supabaseAdmin: any;
  userId: string;
  botId: string;
  leadId: string;
  leadStatus: string;
  kind: string;
  body: string;
  fileId?: string | null;
  telegramMessageId?: number | null;
}): Promise<LeadChatMessageRow | null> {
  const nowIso = new Date().toISOString();
  const { data: existingConv } = await params.supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("lead_id", params.leadId)
    .maybeSingle();

  let convId = existingConv?.id ?? null;
  if (convId) {
    await params.supabaseAdmin
      .from("conversations")
      .update({
        bot_id: params.botId,
        status: "open",
        last_message_at: nowIso,
        last_message_preview: params.body.slice(0, 160),
        unread_count: 0,
      })
      .eq("id", convId);
  } else {
    const { data: createdConv } = await params.supabaseAdmin
      .from("conversations")
      .insert({
        user_id: params.userId,
        bot_id: params.botId,
        lead_id: params.leadId,
        status: "open",
        last_message_at: nowIso,
        last_message_preview: params.body.slice(0, 160),
        unread_count: 0,
      })
      .select("id")
      .maybeSingle();
    convId = createdConv?.id ?? null;
  }

  let messageRow: LeadChatMessageRow | null = null;
  if (convId) {
    const { data: insertedMsg } = await params.supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: convId,
        user_id: params.userId,
        direction: "out",
        kind: params.kind,
        body: params.body,
        file_id: params.fileId ?? null,
        telegram_message_id: params.telegramMessageId ?? null,
      })
      .select("id,conversation_id,direction,kind,body,file_id,file_name,telegram_message_id,created_at")
      .maybeSingle();
    messageRow = (insertedMsg as LeadChatMessageRow | null) ?? null;
  }

  if (params.leadStatus === "new") {
    await params.supabaseAdmin.from("leads").update({ status: "engaged" }).eq("id", params.leadId);
  }

  return messageRow;
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

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id,user_id,bot_id,name,telegram_id,telegram_username,status")
      .eq("id", data.leadId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!lead || !lead.telegram_id || !lead.bot_id) {
      return { ok: false as const, error: "Lead sem Telegram ID ou sem bot vinculado.", messageRow: null };
    }

    const { data: bot } = await supabaseAdmin
      .from("bots")
      .select("id,name,token,status")
      .eq("id", lead.bot_id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!bot || !bot.token) {
      return { ok: false as const, error: "Bot vinculado não encontrado.", messageRow: null };
    }

    const { data: latestPending } = await supabaseAdmin
      .from("payments")
      .select("id,pix_code,product_name,amount_cents")
      .eq("lead_id", lead.id)
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const targetPayment =
      data.paymentId && latestPending?.id !== data.paymentId
        ? (
            await supabaseAdmin
              .from("payments")
              .select("id,pix_code,product_name,amount_cents")
              .eq("id", data.paymentId)
              .eq("lead_id", lead.id)
              .eq("user_id", context.userId)
              .maybeSingle()
          ).data ?? latestPending
        : latestPending;

    const leadName = lead.name || (lead.telegram_username ? `@${lead.telegram_username}` : "Cliente");
    const planLabel = data.planName || data.offerTitle || targetPayment?.product_name || "Plano VIP";
    const pixCode = targetPayment?.pix_code || "";

    const renderVars = (raw: string) =>
      raw
        .replace(/\{nome\}/gi, leadName)
        .replace(/\{plano\}/gi, planLabel)
        .replace(/\{pix_copia_cola\}/gi, pixCode);

    let textToSend = renderVars(data.message || "");
    const chatId = Number(lead.telegram_id);
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
          userId: context.userId,
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
        supabaseAdmin,
        userId: context.userId,
        botId: bot.id,
        leadId: lead.id,
        leadStatus: lead.status,
        kind: "trigger_plans_menu",
        body: loggedBody,
        telegramMessageId: introMsgId,
      });

      await logActivity(
        context.userId,
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
      supabaseAdmin,
      userId: context.userId,
      botId: bot.id,
      leadId: lead.id,
      leadStatus: lead.status,
      kind: msgKind,
      body: loggedBody,
      fileId: data.mediaUrl ?? null,
      telegramMessageId: sendRes.result?.message_id ?? null,
    });

    await logActivity(
      context.userId,
      "lead_chat",
      `mensagem guiada (${data.guidedMode}) enviada para ${leadName}`,
      lead.id,
      { botId: bot.id, guidedMode: data.guidedMode },
    ).catch(() => undefined);

    return { ok: true as const, error: null, messageRow };
  });
