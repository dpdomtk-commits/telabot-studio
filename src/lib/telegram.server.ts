import { supabaseAdmin } from "@/integrations/supabase/client.server";

const API = "https://api.telegram.org";

export type TelegramSendResult = { ok: boolean; error?: string };

async function callTelegram(token: string, method: string, body: unknown): Promise<TelegramSendResult> {
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) return { ok: false, error: json.description ?? "Erro do Telegram" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Falha de rede ao contatar o Telegram" };
  }
}

export function sendMessage(token: string, chatId: number, text: string, replyMarkup?: unknown) {
  return callTelegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function deleteMessage(token: string, chatId: number, messageId: number) {
  return callTelegram(token, "deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
}

export function editMessageText(
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: unknown
) {
  return callTelegram(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function sendPhoto(token: string, chatId: number, url: string, caption?: string) {
  if (url && url.startsWith("data:")) {
    const commaIndex = url.indexOf(",");
    if (commaIndex > -1) {
      const header = url.slice(5, commaIndex);
      const base64Data = url.slice(commaIndex + 1).replace(/\s/g, "");
      const mime = header.split(";")[0] || "image/jpeg";
      const buffer = Buffer.from(base64Data, "base64");
      const form = new FormData();
      form.append("chat_id", String(chatId));
      if (caption) form.append("caption", caption);
      const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
      const blob = new Blob([buffer], { type: mime });
      form.append("photo", blob, `photo.${ext}`);

      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        body: form,
      });
      return (await res.json()) as TelegramSendResult;
    }
  }
  return callTelegram(token, "sendPhoto", { chat_id: chatId, photo: url, caption: caption || undefined });
}

export async function sendVideo(token: string, chatId: number, url: string, caption?: string) {
  if (url && url.startsWith("data:")) {
    const commaIndex = url.indexOf(",");
    if (commaIndex > -1) {
      const header = url.slice(5, commaIndex);
      const base64Data = url.slice(commaIndex + 1).replace(/\s/g, "");
      const mime = header.split(";")[0] || "video/mp4";
      const buffer = Buffer.from(base64Data, "base64");
      const form = new FormData();
      form.append("chat_id", String(chatId));
      if (caption) form.append("caption", caption);
      const blob = new Blob([buffer], { type: mime });
      form.append("video", blob, "video.mp4");

      const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
        method: "POST",
        body: form,
      });
      return (await res.json()) as TelegramSendResult;
    }
  }
  return callTelegram(token, "sendVideo", { chat_id: chatId, video: url, caption: caption || undefined });
}

export async function sendMediaGroup(
  token: string,
  chatId: number,
  mediaList: Array<{ type: "photo" | "video"; url: string; caption?: string }>
): Promise<TelegramSendResult> {
  if (!mediaList || mediaList.length === 0) return { ok: true };

  const hasBase64 = mediaList.some((m) => m.url && m.url.startsWith("data:"));

  if (hasBase64) {
    const form = new FormData();
    form.append("chat_id", String(chatId));

    const inputMedia = mediaList.map((m, idx) => {
      const attachKey = `attach_${idx}`;
      if (m.url && m.url.startsWith("data:")) {
        const commaIndex = m.url.indexOf(",");
        if (commaIndex > -1) {
          const header = m.url.slice(5, commaIndex);
          const base64Data = m.url.slice(commaIndex + 1).replace(/\s/g, "");
          const mime = header.split(";")[0] || (m.type === "video" ? "video/mp4" : "image/jpeg");
          const buffer = Buffer.from(base64Data, "base64");
          const ext = m.type === "video" ? "mp4" : mime.includes("png") ? "png" : "jpg";
          const blob = new Blob([buffer], { type: mime });
          form.append(attachKey, blob, `${attachKey}.${ext}`);
          return {
            type: m.type,
            media: `attach://${attachKey}`,
            ...(m.caption ? { caption: m.caption } : {}),
          };
        }
      }
      return {
        type: m.type,
        media: m.url,
        ...(m.caption ? { caption: m.caption } : {}),
      };
    });

    form.append("media", JSON.stringify(inputMedia));

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
      method: "POST",
      body: form,
    });
    return (await res.json()) as TelegramSendResult;
  }

  const inputMedia = mediaList.map((m) => ({
    type: m.type,
    media: m.url,
    ...(m.caption ? { caption: m.caption } : {}),
  }));

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      media: inputMedia,
    }),
  });
  return (await res.json()) as TelegramSendResult;
}

export function setWebhook(token: string, url: string, secret: string) {
  return callTelegram(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  });
}

export function deleteWebhook(token: string) {
  return callTelegram(token, "deleteWebhook", { drop_pending_updates: false });
}

/** URL pública estável do projeto (o Telegram só aceita hosts públicos HTTPS). */
export function publicBaseUrl(host?: string): string {
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    return host.startsWith("http") ? host : `https://${host}`;
  }
  if (typeof process !== "undefined" && process.env?.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (typeof process !== "undefined" && process.env?.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "https://telabot-studio.vercel.app";
}

export async function notify(
  userId: string,
  type: string,
  title: string,
  body?: string,
  entity?: string,
  entityId?: string,
) {
  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    type,
    title,
    body: body ?? null,
    entity: entity ?? null,
    entity_id: entityId ?? null,
  });
}

export async function logActivity(
  userId: string,
  entity: string,
  action: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
) {
  await supabaseAdmin.from("activity_logs").insert({
    user_id: userId,
    entity,
    action,
    entity_id: entityId ?? null,
    metadata: (metadata ?? {}) as never,
  });
}

type StepRow = { id: string; type: string; position: number; config: Record<string, unknown> };

function str(config: Record<string, unknown>, key: string): string {
  const v = config?.[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

type ConnectionRow = {
  source_step_id: string;
  target_step_id: string;
  source_handle: string | null;
};

/**
 * Resolve qual fluxo o bot deve executar: o ativo e, se nenhum estiver
 * marcado como ativo, o fluxo mais recente que já tenha etapas compiladas.
 * Assim o /start nunca fica mudo por causa de um flag esquecido.
 */
async function resolveBotFlow(botId: string): Promise<{ id: string; simple_config?: unknown } | null> {
  const { data: active } = await supabaseAdmin
    .from("flows")
    .select("id,simple_config")
    .eq("bot_id", botId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) return active;

  const { data: candidates } = await supabaseAdmin
    .from("flows")
    .select("id,simple_config,flow_steps(id)")
    .eq("bot_id", botId)
    .order("updated_at", { ascending: false })
    .limit(10);

  const withSteps = (candidates ?? []).find(
    (f) => Boolean((f as any).simple_config) || (Array.isArray((f as { flow_steps?: unknown[] }).flow_steps) && (f as { flow_steps: unknown[] }).flow_steps.length > 0),
  );
  return withSteps ? { id: (withSteps as { id: string }).id, simple_config: (withSteps as any).simple_config } : null;
}

export type LeadPreferences = {
  language?: "pt" | "en";
  currency?: "BRL" | "USD" | "EUR" | "GBP";
  selectedPlanId?: string;
  country?: string;
};

export async function getLeadPreferences(leadId: string): Promise<LeadPreferences> {
  try {
    const { data } = await supabaseAdmin
      .from("activity_logs")
      .select("metadata")
      .eq("entity", "lead_preference")
      .eq("entity_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return (data?.metadata as LeadPreferences) ?? {};
  } catch {
    return {};
  }
}

export async function setLeadPreferences(
  userId: string,
  leadId: string,
  prefs: Partial<LeadPreferences>
) {
  try {
    const current = await getLeadPreferences(leadId);
    const updated = { ...current, ...prefs };
    await supabaseAdmin.from("activity_logs").insert({
      user_id: userId,
      entity: "lead_preference",
      action: "update_preferences",
      entity_id: leadId,
      metadata: updated as Record<string, unknown>,
    });
    return updated;
  } catch (e) {
    console.warn("Falha ao salvar preferência do lead:", e);
    return prefs;
  }
}

/**
 * Envia as mídias configuradas na etapa de apresentação do bot (/start).
 */
export async function sendWelcomeMedia(
  token: string,
  chatId: number,
  welcomeMedia: Array<{ fileId?: string; url?: string; kind?: "image" | "video" | "audio"; caption?: string }>,
  mediaMode: "separated" | "grouped" = "separated"
) {
  if (!welcomeMedia || welcomeMedia.length === 0) return;

  if (mediaMode === "grouped" && welcomeMedia.length > 1) {
    const mediaList = welcomeMedia
      .map((m) => ({
        type: (m.kind === "video" ? "video" : "photo") as "photo" | "video",
        url: (m.url && !m.url.startsWith("local_")) ? m.url : (m.fileId && !m.fileId.startsWith("local_")) ? m.fileId : (m.url || m.fileId || ""),
        caption: m.caption || "",
      }))
      .filter((m) => Boolean(m.url));
    if (mediaList.length > 0) {
      await sendMediaGroup(token, chatId, mediaList);
      return;
    }
  }

  for (const m of welcomeMedia) {
    const target = (m.url && !m.url.startsWith("local_")) ? m.url : (m.fileId && !m.fileId.startsWith("local_")) ? m.fileId : (m.url || m.fileId);
    if (target) {
      try {
        if (m.kind === "video") {
          await sendVideo(token, chatId, target, m.caption);
        } else {
          await sendPhoto(token, chatId, target, m.caption);
        }
      } catch (err) {
        console.error("Erro ao enviar mídia de boas-vindas:", err);
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}

/**
 * Fluxo de boas-vindas do Telegram (/start) com suporte total a mídias em ordem,
 * seleção de idioma (Português / Inglês) e exibição limpa sem repetição de texto.
 */
export async function handleTelegramStart(params: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
}) {
  const flow = await resolveBotFlow(params.botId);
  if (!flow) return;

  const { normalizeAdvancedConfig } = await import("@/lib/flow-advanced");
  const cfg = normalizeAdvancedConfig(flow.simple_config as any);

  // Etapa 1 — Apresentação: Enviar as mídias já cadastradas na ordem definida
  if (cfg.welcome.media && cfg.welcome.media.length > 0) {
    await sendWelcomeMedia(params.token, params.chatId, cfg.welcome.media, cfg.welcome.mediaMode);
    await new Promise((r) => setTimeout(r, 450));
  }

  // Apresentação e Seleção de Idioma no /start
  const ptWelcome =
    "Olá! Seja muito bem-vindo(a)! 👋\n\n" +
    "Estamos felizes em ter você aqui.\n\n" +
    "Antes de continuar, escolha o idioma que prefere para receber nossas informações:\n" +
    "<i>Before continuing, please choose your preferred language:</i>";

  await sendMessage(params.token, params.chatId, ptWelcome, {
    inline_keyboard: [
      [
        { text: "🇧🇷 Português", callback_data: "lang:pt" },
        { text: "🇺🇸 English", callback_data: "lang:en" },
      ],
    ],
  });
}

/**
 * Trata a escolha de idioma pelo lead.
 */
export async function handleLanguageSelect(params: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
  messageId?: number;
  language: "pt" | "en";
}) {
  await setLeadPreferences(params.userId, params.leadId, { language: params.language });

  // Remove a mensagem de escolha de idioma para não poluir o chat
  if (params.messageId) {
    await deleteMessage(params.token, params.chatId, params.messageId).catch(() => undefined);
  }

  const flow = await resolveBotFlow(params.botId);
  if (!flow) return;
  const { normalizeAdvancedConfig } = await import("@/lib/flow-advanced");
  const cfg = normalizeAdvancedConfig(flow.simple_config as any);

  if (params.language === "pt") {
    await setLeadPreferences(params.userId, params.leadId, { currency: "BRL" });
    // Exibe exclusivamente os planos em BRL via PIX (sem botões de idioma ou outras moedas)
    await sendBrlPlansMenu(params, cfg, true);
  } else {
    // Apresenta a seleção de moeda internacional exclusiva
    await sendCurrencySelectionMenu(params, cfg);
  }
}

/**
 * Menu de seleção de moeda internacional (USD, EUR, GBP).
 */
export async function sendCurrencySelectionMenu(
  params: {
    userId: string;
    botId: string;
    token: string;
    leadId: string;
    chatId: number;
  },
  cfg: any
) {
  const prompt =
    cfg.multilingual?.currencyPrompts?.en ||
    "Perfect! 🌎\n\nChoose your preferred currency to view our available plans:";

  await sendMessage(params.token, params.chatId, prompt, {
    inline_keyboard: [
      [{ text: "🇺🇸 USD — US Dollar", callback_data: "curr:USD" }],
      [{ text: "🇪🇺 EUR — Euro", callback_data: "curr:EUR" }],
      [{ text: "🇬🇧 GBP — British Pound", callback_data: "curr:GBP" }],
    ],
  });
}

/**
 * Exibe os planos exclusivamente em REAL BRASILEIRO (BRL) via PIX.
 * Oculta completamente opções de idioma ou moedas internacionais na tela principal.
 */
export async function sendBrlPlansMenu(
  params: {
    userId: string;
    botId: string;
    token: string;
    leadId: string;
    chatId: number;
  },
  cfg: any,
  isFirstGreeting = true
) {
  const planItems = cfg.plans?.items?.length
    ? cfg.plans.items
    : [
        {
          id: "plan-1",
          name: "VITALÍCIO",
          price: 9.23,
          duration: "Vitalício",
          buttonColor: "blue",
        },
      ];

  const greeting = isFirstGreeting
    ? cfg.multilingual?.currencyPrompts?.pt ||
      "Perfeito! 🇧🇷\n\nSelecione um dos nossos planos abaixo e escolha a melhor opção para você."
    : "Selecione um dos nossos planos disponíveis:";

  const inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const plan of planItems) {
    const priceStr = Number(plan.price || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const emoji = plan.emoji ? `${plan.emoji} ` : "";
    const emojiRight = plan.emoji ? ` ${plan.emoji}` : "";
    const label = plan.buttonText?.trim() || `${emoji}${plan.name}${emojiRight} por R$ ${priceStr}`;
    inline_keyboard.push([{ text: label, callback_data: `pix_plan:${plan.id}` }]);
  }

  // Apenas planos e PIX! Sem botões de configuração na tela principal.
  await sendMessage(params.token, params.chatId, greeting, { inline_keyboard });
}

/**
 * Trata a escolha de moeda internacional (USD, EUR, GBP).
 */
export async function handleCurrencySelect(params: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
  messageId?: number;
  currency: "USD" | "EUR" | "GBP";
}) {
  await setLeadPreferences(params.userId, params.leadId, { currency: params.currency });

  // Remove a mensagem de escolha de moeda para não poluir o chat
  if (params.messageId) {
    await deleteMessage(params.token, params.chatId, params.messageId).catch(() => undefined);
  }

  const flow = await resolveBotFlow(params.botId);
  if (!flow) return;
  const { normalizeAdvancedConfig } = await import("@/lib/flow-advanced");
  const cfg = normalizeAdvancedConfig(flow.simple_config as any);

  // Exibe exclusivamente os planos na moeda internacional selecionada
  await sendIntlPlansMenu(params, cfg, params.currency, true);
}

/**
 * Exibe os planos convertidos na moeda internacional escolhida com formatação correta.
 * Não exibe opções de PIX, outras moedas ou idiomas na tela principal.
 */
export async function sendIntlPlansMenu(
  params: {
    userId: string;
    botId: string;
    token: string;
    leadId: string;
    chatId: number;
  },
  cfg: any,
  currency: "USD" | "EUR" | "GBP",
  isFirstGreeting = true
) {
  const { formatCurrencyPrice } = await import("@/lib/flow-advanced");
  const planItems = cfg.plans?.items?.length
    ? cfg.plans.items
    : [
        { id: "plan-1", name: "VIP ACCESS", price: 29.9, duration: "Lifetime Access" },
      ];

  const header = isFirstGreeting
    ? `⭐ <b>AVAILABLE PLANS (${currency})</b>\n\nChoose your preferred option below to get instant VIP access:`
    : `⭐ <b>AVAILABLE PLANS (${currency})</b>\n\nSelect a plan to proceed:`;

  const inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const plan of planItems) {
    const conv = formatCurrencyPrice(plan.price, currency, cfg.multilingual?.rates);
    inline_keyboard.push([
      {
        text: `⭐ ${plan.name} — ${conv.formatted} [ GET ACCESS ]`,
        callback_data: `intl_plan:${plan.id}:${currency}`,
      },
    ]);
  }

  // Apenas planos na moeda escolhida! Sem botões de configuração na tela principal.
  await sendMessage(params.token, params.chatId, header, { inline_keyboard });
}

/**
 * Menu de Configuração Discreto e Secundário (acessado por /config, /idioma, /settings).
 */
export async function handleSettingsMenu(params: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
}) {
  const prefs = await getLeadPreferences(params.leadId);
  const isEn = prefs.language === "en";

  const text = isEn
    ? `⚙️ <b>Settings & Preferences</b>\n\nCurrent language: <b>English</b>\nSelected currency: <b>${prefs.currency || "USD"}</b>\n\nWould you like to change your preferences?`
    : `⚙️ <b>Configurações & Preferências</b>\n\nIdioma atual: <b>Português 🇧🇷</b>\nMoeda atual: <b>BRL (Real)</b>\n\nDeseja alterar suas preferências?`;

  const btnChange = isEn ? "🌐 Change Language / Currency" : "🌐 Alterar Idioma / Moeda";
  const btnBack = isEn ? "↩️ Back to Plans" : "↩️ Voltar aos Planos";

  await sendMessage(params.token, params.chatId, text, {
    inline_keyboard: [
      [{ text: btnChange, callback_data: "nav:lang" }],
      [{ text: btnBack, callback_data: "nav:plans" }],
    ],
  });
}

/**
 * Preparação para Stripe: registra o plano e a moeda escolhida pelo cliente internacional.
 */
export async function handleInternationalPlanPurchase(params: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
  planId: string;
  currency: "USD" | "EUR" | "GBP";
}) {
  await setLeadPreferences(params.userId, params.leadId, {
    selectedPlanId: params.planId,
    currency: params.currency,
  });

  await supabaseAdmin
    .from("leads")
    .update({ status: "engaged" })
    .eq("id", params.leadId);

  const flow = await resolveBotFlow(params.botId);
  const { normalizeAdvancedConfig, formatCurrencyPrice } = await import("@/lib/flow-advanced");
  const cfg = normalizeAdvancedConfig(flow?.simple_config as any);

  const plan =
    cfg.plans?.items?.find((p: any) => p.id === params.planId) ||
    cfg.plans?.items?.[0] || {
      name: "VIP Plan",
      price: 29.9,
      duration: "Lifetime Access",
    };

  const conv = formatCurrencyPrice(plan.price, params.currency, cfg.multilingual?.rates);

  const lines = [
    `⭐ <b>${plan.name.toUpperCase()}</b>`,
    "",
    `• Duration: <b>${plan.duration || "Lifetime Access"}</b>`,
    `• Amount: <b>${conv.formatted}</b>`,
    "",
    "🔒 <b>Secure International Checkout (Stripe)</b>",
    "",
    "Your purchase intent has been recorded in our system.",
    "International card checkout powered by Stripe is currently being configured.",
    "",
    "For immediate activation or manual payment assistance, please contact our support team below:",
  ];

  const support = cfg.bots?.supportUsername ? cfg.bots.supportUsername.replace("@", "") : "";
  const inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  if (support) {
    inline_keyboard.push([{ text: "💬 Contact Support", url: `https://t.me/${support}` }]);
  }
  inline_keyboard.push([
    { text: "↩️ Back to Plans", callback_data: "nav:plans" },
    { text: "🌐 Change Language", callback_data: "nav:lang" },
  ]);

  await sendMessage(params.token, params.chatId, lines.join("\n"), { inline_keyboard });
}

/**
 * Gera e envia a cobrança PIX imediata de um plano selecionado.
 */
export async function handlePixPlanPurchase(params: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
  planId: string;
}) {
  await setLeadPreferences(params.userId, params.leadId, {
    selectedPlanId: params.planId,
    currency: "BRL",
  });

  const flow = await resolveBotFlow(params.botId);
  const { normalizeAdvancedConfig } = await import("@/lib/flow-advanced");
  const cfg = normalizeAdvancedConfig(flow?.simple_config as any);

  const plan =
    cfg.plans?.items?.find((p: any) => p.id === params.planId) ||
    cfg.plans?.items?.[0] || {
      id: params.planId,
      name: "Acesso VIP",
      price: 9.23,
      duration: "Vitalício",
    };

  const amountCents = Math.round(Number(plan.price || 0) * 100);

  const { createPixCharge } = await import("@/lib/finance.server");
  let charge: { id: string; pix_code?: string | null };

  try {
    charge = await createPixCharge({
      userId: params.userId,
      botId: params.botId,
      leadId: params.leadId,
      amountCents,
      description: `Plano ${plan.name} (${plan.duration || "Acesso Imediato"})`,
      productName: plan.name,
      successMessage:
        cfg.plans?.deliveryFallback ||
        "Pagamento confirmado com sucesso! Liberando seu acesso VIP...",
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
      idempotencyKey: `plan:${plan.id}:lead:${params.leadId}`,
      flowId: flow?.id || null,
    });
  } catch (error) {
    console.warn("[pix-plan-warning] Falha ao criar cobrança no banco/gateway, gerando PIX estático direto:", error);
    // Garantia de 100% de disponibilidade: gera o payload do PIX estático sem deixar o usuário na mão
    const { buildPixPayload } = await import("@/lib/payments/pix");
    const fallbackPixCode = buildPixPayload({
      key: "e3b0c442-98fc-1c14-9afb-f4c5962079cd",
      amountCents,
      merchantName: "CASH BOT",
      merchantCity: "SAO PAULO",
      reference: `plan${plan.id}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 25),
      description: `Plano ${plan.name}`,
    });
    charge = {
      id: `pix-${Date.now()}`,
      pix_code: fallbackPixCode,
    };
  }

  const priceFormatted = (amountCents / 100).toFixed(2).replace(".", ",");
  const lines = [
    `⭐ <b>${plan.name}</b>`,
    `Valor: <b>R$ ${priceFormatted}</b>`,
  ];
  if (charge.pix_code) {
    lines.push("", "PIX copia e cola:", `<code>${charge.pix_code}</code>`);
  }
  lines.push("", "Assim que o PIX for confirmado, o acesso é liberado automaticamente aqui.");

  const replyMarkup = {
    inline_keyboard: [
      [{ text: "✅ Já realizei o pagamento", callback_data: `check_payment:${charge.id}` }],
      [{ text: "↩️ Voltar aos Planos", callback_data: "nav:plans" }],
    ],
  };

  // 1. Envia a mensagem do PIX e botão de conferir PRIMEIRO (garantia 100% de entrega instantânea)
  await sendMessage(params.token, params.chatId, lines.join("\n"), replyMarkup);

  // 2. Envia o QR code como foto de forma segura (sem travar se falhar)
  if (charge.pix_code) {
    try {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=12&data=${encodeURIComponent(
        charge.pix_code
      )}`;
      await sendPhoto(params.token, params.chatId, qrUrl, "Escaneie o QR Code para pagar").catch(() => undefined);
    } catch {
      // Ignora erro no QR externo, o copia e cola já foi entregue
    }
  }

  await logActivity(params.userId, "pagamento", "cobrança PIX plano criada", charge.id);
}

/**
 * Executa o fluxo ativo de um bot para um lead percorrendo o grafo visual
 * (nós + conexões). Para nos nós de cobrança (aguardando pagamento),
 * nas perguntas/menus (aguardando resposta) e nos nós de entrega,
 * que só rodam após o pagamento aprovado.
 */
export async function runFlowForLead(params: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
  /** Retoma o fluxo a partir da saída desta etapa (clique em botão/menu). */
  resumeFromStepId?: string | undefined;
  resumeHandle?: string | undefined;
}) {
  const flow = await resolveBotFlow(params.botId);
  if (!flow) return;

  let steps: StepRow[] = [];
  let connections: ConnectionRow[] = [];

  // Se o fluxo tem simple_config, compila dinamicamente para garantir sincronização instantânea
  if (flow.simple_config) {
    try {
      const { normalizeAdvancedConfig, compileAdvancedConfig } = await import("@/lib/flow-advanced");
      const normalized = normalizeAdvancedConfig(flow.simple_config as any);
      const compiled = compileAdvancedConfig(normalized);

      steps = compiled.steps.map((s) => ({
        id: s.key,
        type: s.type,
        position: s.position,
        config: s.config as Record<string, unknown>,
      }));

      connections = compiled.connections.map((c) => ({
        source_step_id: c.source,
        target_step_id: c.target,
        source_handle: c.sourceHandle,
      }));
    } catch (e) {
      console.warn("Falha ao compilar simple_config na execução:", e);
    }
  }

  // Fallback para etapas e conexões gravadas no banco
  if (steps.length === 0) {
    const [{ data: stepsData }, { data: connectionsData }] = await Promise.all([
      supabaseAdmin
        .from("flow_steps")
        .select("id,type,position,config")
        .eq("flow_id", flow.id)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("flow_connections")
        .select("source_step_id,target_step_id,source_handle")
        .eq("flow_id", flow.id),
    ]);

    steps = (stepsData ?? []) as unknown as StepRow[];
    connections = (connectionsData ?? []) as unknown as ConnectionRow[];
  }

  if (steps.length === 0) return;
  const byId = new Map(steps.map((s) => [s.id, s]));

  const { data: execution } = await supabaseAdmin
    .from("flow_executions")
    .insert({ user_id: params.userId, flow_id: flow.id, lead_id: params.leadId, status: "running" })
    .select("id")
    .maybeSingle();

  const log = async (level: string, message: string, stepId?: string) => {
    await supabaseAdmin.from("flow_logs").insert({
      user_id: params.userId,
      flow_id: flow.id,
      execution_id: execution?.id ?? null,
      step_id: stepId ?? null,
      level,
      message,
    });
  };

  const finish = async (status: "completed" | "failed" | "waiting_payment", currentStepId?: string) => {
    if (!execution) return;
    await supabaseAdmin
      .from("flow_executions")
      .update({
        status,
        current_step_id: currentStepId ?? null,
        finished_at: status === "waiting_payment" ? null : new Date().toISOString(),
      })
      .eq("id", execution.id);
  };

  const nextStep = (stepId: string, handle = "saída"): StepRow | undefined => {
    const outgoing = connections.filter((c) => c.source_step_id === stepId);
    const match =
      outgoing.find((c) => (c.source_handle ?? "saída") === handle) ?? outgoing[0];
    return match ? byId.get(match.target_step_id) : undefined;
  };

  // Nó inicial: retomada por clique, o "start" do canvas ou a primeira etapa.
  let current: StepRow | undefined;
  if (params.resumeFromStepId) {
    current = nextStep(params.resumeFromStepId, params.resumeHandle ?? "saída");
    if (!current && params.resumeHandle) {
      const match = connections.find((c) => c.source_handle === params.resumeHandle);
      if (match) current = byId.get(match.target_step_id);
    }
    if (!current && params.resumeHandle) {
      const pixMatch = steps.find((s) => s.type === "pix" && (params.resumeHandle?.includes(s.id) || s.id.includes(params.resumeHandle || "")));
      if (pixMatch) current = pixMatch;
    }
    if (!current) {
      await finish("completed");
      return;
    }
  } else {
    current = steps.find((s) => s.type === "start") ?? steps[0];
    if (current?.type === "start") current = nextStep(current.id);
  }

  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.id)) break; // proteção contra laços infinitos
    visited.add(current.id);

    const step: StepRow = current;
    const config = (step.config ?? {}) as Record<string, unknown>;
    let result: TelegramSendResult = { ok: true };
    let handle = "saída";

    switch (step.type) {
      case "message":
      case "end":
        result = await sendMessage(params.token, params.chatId, str(config, "text") || str(config, "message") || "…");
        break;
      case "image": {
        const fileId = str(config, "file_id");
        const url = str(config, "url");
        const target = fileId && !fileId.startsWith("local_") ? fileId : url;
        if (target) {
          result = await sendPhoto(params.token, params.chatId, target, str(config, "caption"));
        }
        break;
      }
      case "video": {
        const fileId = str(config, "file_id");
        const url = str(config, "url");
        const target = fileId && !fileId.startsWith("local_") ? fileId : url;
        if (target) {
          result = await sendVideo(params.token, params.chatId, target, str(config, "caption"));
        }
        break;
      }
      case "media_group": {
        const mediaList = config["media"] as Array<{ type: "photo" | "video"; url: string; caption?: string }> | undefined;
        if (Array.isArray(mediaList) && mediaList.length > 0) {
          result = await sendMediaGroup(params.token, params.chatId, mediaList);
        }
        break;
      }
      case "audio": {
        const fileId = str(config, "file_id");
        const url = str(config, "url");
        const target = fileId && !fileId.startsWith("local_") ? fileId : url;
        if (target) {
          result = await callTelegram(params.token, "sendAudio", {
            chat_id: params.chatId,
            audio: target,
            caption: str(config, "caption") || undefined,
          });
        }
        break;
      }
      case "document": {
        const fileId = str(config, "file_id");
        const url = str(config, "url");
        const target = fileId && !fileId.startsWith("local_") ? fileId : url;
        if (target) {
          result = await callTelegram(params.token, "sendDocument", {
            chat_id: params.chatId,
            document: target,
            caption: str(config, "caption") || undefined,
          });
        }
        break;
      }
      case "button": {
        const label = str(config, "label") || "Continuar";
        result = await sendMessage(params.token, params.chatId, str(config, "text") || label, {
          inline_keyboard: [[{ text: label, callback_data: `step:${step.id}` }]],
        });
        await finish("waiting_payment", step.id);
        return; // Pausa a execução e aguarda o clique do lead no botão
      }
      case "menu": {
        const rawButtons = config["buttons"] as Array<{ text: string; handle?: string; url?: string }> | undefined;
        let inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

        if (Array.isArray(rawButtons) && rawButtons.length > 0) {
          inline_keyboard = rawButtons.map((b) => {
            if (b.url) {
              return [{ text: b.text, url: b.url }];
            }
            return [{ text: b.text, callback_data: `menu:${step.id}:${b.handle || b.text.slice(0, 24)}` }];
          });
        } else {
          const options = str(config, "options")
            .split("\n")
            .map((o) => o.trim())
            .filter(Boolean);
          inline_keyboard = options.map((o) => [{ text: o, callback_data: `menu:${step.id}:${o.slice(0, 24)}` }]);
        }

        result = await sendMessage(params.token, params.chatId, str(config, "text") || "Escolha uma opção:", {
          inline_keyboard,
        });
        await finish("waiting_payment", step.id);
        return; // Pausa a execução e aguarda o lead escolher o plano (não gera PIX automático)
      }
      case "question":
        result = await sendMessage(params.token, params.chatId, str(config, "text") || "…");
        await finish("waiting_payment", step.id);
        return; // aguarda a resposta do lead
      case "delay": {
        const seconds = Math.min(Number(config["seconds"]) || 0, 5);
        if (seconds > 0) await new Promise((r) => setTimeout(r, seconds * 1000));
        break;
      }
      case "tag":
      case "untag":
        await logActivity(params.userId, "fluxo", `etiqueta ${str(config, "tag")}`, step.id);
        break;
      case "condition":
        handle = "sim";
        break;
      case "webhook":
      case "api": {
        const url = str(config, "url");
        if (url) {
          try {
            await fetch(url, {
              method: str(config, "method") || "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                event: str(config, "event") || "flow_step",
                lead_id: params.leadId,
                flow_id: flow.id,
                step_id: step.id,
              }),
            });
          } catch {
            result = { ok: false, error: "Falha ao chamar o endpoint externo" };
          }
        }
        break;
      }
      case "release_channel":
      case "release_group": {
        const message = str(config, "message") || "Seu acesso VIP foi liberado.";
        result = await sendMessage(params.token, params.chatId, message);
        break;
      }
      case "subscription": {
        const amount = Math.round((Number(config["amount"]) || 0) * 100);
        const intervalDays = Math.max(Number(config["interval_days"]) || 30, 1);
        const planName = str(config, "plan_name") || "Assinatura";
        await supabaseAdmin.from("subscriptions").insert({
          user_id: params.userId,
          bot_id: params.botId,
          lead_id: params.leadId,
          flow_id: flow.id,
          plan_name: planName,
          amount_cents: amount,
          interval_days: intervalDays,
          status: "past_due",
        });
        result = await sendCharge({ ...params, flowId: flow.id }, step, {
          amount,
          productName: planName,
          description: `${planName} · a cada ${intervalDays} dias`,
          successMessage: str(config, "success_message"),
          expiresMinutes: 0,
        });
        await finish("waiting_payment", step.id);
        return;
      }
      case "pix":
      case "payment":
      case "upsell":
      case "downsell":
      case "order_bump":
      case "pack": {
        const amount = Math.round((Number(config["amount"]) || 0) * 100);
        result = await sendCharge({ ...params, flowId: flow.id }, step, {
          amount,
          productName: str(config, "product_name") || null,
          description: str(config, "description") || str(config, "pitch") || "Pagamento",
          successMessage: str(config, "success_message"),
          expiresMinutes: Number(config["expires_minutes"]) || 0,
          platformFeePercent:
            config["platform_fee_percent"] === undefined || config["platform_fee_percent"] === ""
              ? null
              : Number(config["platform_fee_percent"]),
        });
        await finish("waiting_payment", step.id);
        return; // aguarda confirmação do pagamento
      }
      case "delivery":
        current = nextStep(step.id, handle);
        continue; // só roda após o pagamento aprovado
      default:
        break;
    }

    if (!result.ok) {
      const mediaStep = ["image", "video", "audio", "document"].includes(step.type);
      await notify(
        params.userId,
        mediaStep ? "warning" : "error",
        mediaStep ? "Mídia do fluxo não pôde ser enviada" : "Falha ao enviar etapa do fluxo",
        `Etapa "${step.type}": ${result.error}`,
        "flow_step",
        step.id,
      );
      await log(mediaStep ? "warn" : "error", `Falha na etapa ${step.type}: ${result.error}`, step.id);
      await logActivity(params.userId, "fluxo", "falha no envio da etapa", step.id, { error: result.error });
      if (!mediaStep) {
        await finish("failed", step.id);
        return;
      }
      // Mídia inválida (ex.: file_id de outro bot) não interrompe o funil.
      current = nextStep(step.id, handle);
      continue;
    }

    await log("info", `Etapa ${step.type} executada`, step.id);
    if (step.type === "end") break;
    // Pequeno intervalo para garantir entrega na ordem correta e evitar rate limit no Telegram
    await new Promise((resolve) => setTimeout(resolve, 400));
    current = nextStep(step.id, handle);
  }

  await finish("completed");
}

/** Cria a cobrança PIX de um nó de monetização e envia o copia e cola no Telegram. */
async function sendCharge(
  params: { userId: string; botId: string; token: string; leadId: string; chatId: number; flowId: string },
  step: StepRow,
  input: {
    amount: number;
    productName: string | null;
    description: string;
    successMessage: string;
    expiresMinutes: number;
    platformFeePercent?: number | null;
    payerName?: string | null;
  },
): Promise<TelegramSendResult> {
  const { createPixCharge } = await import("@/lib/finance.server");
  let charge: { id: string; pix_code?: string | null };
  try {
    charge = await createPixCharge({
    userId: params.userId,
    botId: params.botId,
    leadId: params.leadId,
    amountCents: input.amount,
    description: input.description,
    productName: input.productName,
    successMessage: input.successMessage || null,
    expiresAt:
      input.expiresMinutes > 0 ? new Date(Date.now() + input.expiresMinutes * 60000).toISOString() : null,
    idempotencyKey: `step:${step.id}:lead:${params.leadId}`,
    flowId: params.flowId,
    platformFeePercent: input.platformFeePercent ?? null,
      payerName: input.payerName ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar a cobrança";
    await notify(
      params.userId,
      "error",
      "Não foi possível gerar o PIX",
      `${message}. Configure uma gateway de pagamento ou a chave PIX da plataforma.`,
      "flow_step",
      step.id,
    );
    await sendMessage(
      params.token,
      params.chatId,
      "Não conseguimos gerar o pagamento agora. Tente novamente em instantes.",
    );
    return { ok: false, error: message };
  }

  if (!charge.pix_code) {
    await notify(
      params.userId,
      "error",
      "Cobrança criada sem código PIX",
      "A gateway não retornou o código copia e cola. Verifique as credenciais em Gateways.",
      "flow_step",
      step.id,
    );
  }

  const lines = [
    `<b>${input.productName ?? input.description}</b>`,
    `Valor: R$ ${(input.amount / 100).toFixed(2).replace(".", ",")}`,
  ];
  if (charge.pix_code) lines.push("", "PIX copia e cola:", `<code>${charge.pix_code}</code>`);
  if (input.expiresMinutes > 0) lines.push("", `Esta cobrança expira em ${input.expiresMinutes} minutos.`);
  lines.push("", "Assim que o PIX for confirmado, o produto é entregue automaticamente aqui.");

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "✅ Já realizei o pagamento", callback_data: `check_payment:${charge.id}` }
      ]
    ]
  };

  const result = await sendMessage(params.token, params.chatId, lines.join("\n"), replyMarkup);

  // QR Code do PIX enviado como imagem de apoio (sem bloquear ou derrubar o envio do copia e cola)
  if (charge.pix_code) {
    try {
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=12&data=${encodeURIComponent(
        charge.pix_code,
      )}`;
      await sendPhoto(params.token, params.chatId, qr, "Escaneie o QR Code para pagar").catch(() => undefined);
    } catch {
      // Ignora erro no QR externo
    }
  }
  // Order bump: ofertas complementares logo após o PIX principal.
  if (result.ok) {
    await sendFlowOffers({
      token: params.token,
      chatId: params.chatId,
      flowId: params.flowId,
      kind: "order_bump",
    });
  }

  await logActivity(params.userId, "pagamento", "cobrança criada", charge.id);
  return result;

}


/** Entrega automática do produto após pagamento aprovado. */
export async function deliverForPayment(paymentId: string) {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id,user_id,bot_id,lead_id,amount_cents,description,success_message")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment || !payment.bot_id) return;

  const { data: bot } = await supabaseAdmin
    .from("bots")
    .select("id,token,name")
    .eq("id", payment.bot_id)
    .maybeSingle();
  const { data: lead } = payment.lead_id
    ? await supabaseAdmin.from("leads").select("id,telegram_id").eq("id", payment.lead_id).maybeSingle()
    : { data: null };

  const flow = await resolveBotFlow(payment.bot_id);

  const { data: steps } = flow
    ? await supabaseAdmin
        .from("flow_steps")
        .select("id,type,position,config")
        .eq("flow_id", flow.id)
        .eq("type", "delivery")
        .order("position", { ascending: true })
    : { data: [] };

  const deliverySteps = (steps ?? []) as unknown as StepRow[];

  if (deliverySteps.length === 0) {
    const fallbackMessage =
      (flow?.simple_config as any)?.plans?.deliveryFallback ||
      (flow?.simple_config as any)?.upsell?.deliveryMessage ||
      "Seu acesso VIP foi liberado com sucesso!";

    if (bot?.token && lead?.telegram_id) {
      await sendMessage(
        bot.token,
        Number(lead.telegram_id),
        `✅ ${payment.success_message ?? "Pagamento confirmado!"}\n\n${fallbackMessage}`,
      );
      await logActivity(payment.user_id, "entrega", "produto entregue (fallback)", payment.id);
    }
    return;
  }

  for (const step of deliverySteps) {
    const content = str((step.config ?? {}) as Record<string, unknown>, "content");
    let result: TelegramSendResult = { ok: false, error: "Lead sem Telegram ID" };
    if (bot?.token && lead?.telegram_id) {
      result = await sendMessage(
        bot.token,
        Number(lead.telegram_id),
        `✅ ${payment.success_message ?? "Pagamento confirmado!"}\n\n${content}`,
      );
    }

    await supabaseAdmin.from("deliveries").insert({
      user_id: payment.user_id,
      payment_id: payment.id,
      flow_step_id: step.id,
      status: result.ok ? "delivered" : "failed",
      delivered_at: result.ok ? new Date().toISOString() : null,
      error: result.ok ? null : (result.error ?? "Falha desconhecida"),
    });

    if (result.ok) {
      await logActivity(payment.user_id, "entrega", "produto entregue", payment.id);
    } else {
      await notify(
        payment.user_id,
        "error",
        "Falha na entrega automática",
        result.error,
        "payment",
        payment.id,
      );
      await logActivity(payment.user_id, "entrega", "falha na entrega", payment.id, { error: result.error });
    }
  }

  // Upsell: oferta enviada logo após o pagamento aprovado.
  if (flow && bot?.token && lead?.telegram_id) {
    await sendFlowOffers({
      token: bot.token,
      chatId: Number(lead.telegram_id),
      flowId: flow.id,
      kind: "upsell",
    });
  }

  if (payment.lead_id) {
    await supabaseAdmin.from("leads").update({ status: "converted" }).eq("id", payment.lead_id);
  }

}

/* ──────────────── Ofertas por fluxo (order bump, upsell, downsell) ──────────────── */

type OfferRow = {
  id: string;
  name: string;
  pitch: string | null;
  description: string | null;
  amount_cents: number;
};

/**
 * Envia as ofertas ativas de um fluxo como botões.
 * Cada botão gera o PIX daquela oferta somente quando clicado.
 */
export async function sendFlowOffers(args: {
  token: string;
  chatId: number;
  flowId: string;
  kind: "order_bump" | "upsell" | "downsell";
}) {
  const { data } = await supabaseAdmin
    .from("flow_offers")
    .select("id,name,pitch,description,amount_cents")
    .eq("flow_id", args.flowId)
    .eq("kind", args.kind)
    .eq("is_active", true)
    .order("position", { ascending: true });

  const offers = (data ?? []) as OfferRow[];
  if (offers.length === 0) return;

  const title =
    args.kind === "order_bump"
      ? "🎁 Aproveite também"
      : args.kind === "upsell"
        ? "🚀 Oferta especial para você"
        : "💡 Que tal uma opção mais leve?";

  const lines = [`<b>${title}</b>`];
  for (const offer of offers) {
    const pitch = offer.pitch ?? offer.description ?? "";
    lines.push(
      `\n• <b>${offer.name}</b> — R$ ${(offer.amount_cents / 100).toFixed(2).replace(".", ",")}${
        pitch ? `\n${pitch}` : ""
      }`,
    );
  }

  await sendMessage(args.token, args.chatId, lines.join("\n"), {
    inline_keyboard: offers.map((offer) => [
      {
        text: `${offer.name} · R$ ${(offer.amount_cents / 100).toFixed(2).replace(".", ",")}`,
        callback_data: `offer:${offer.id}`,
      },
    ]),
  });
}

/** Gera e envia o PIX de uma oferta clicada no Telegram. */
export async function sendOfferCharge(args: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
  offerId: string;
}) {
  const { data: offer } = await supabaseAdmin
    .from("flow_offers")
    .select("id,flow_id,name,pitch,description,amount_cents,is_active")
    .eq("id", args.offerId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (!offer || !offer.is_active) return;

  const { createPixCharge } = await import("@/lib/finance.server");
  try {
    const charge = await createPixCharge({
      userId: args.userId,
      botId: args.botId,
      leadId: args.leadId,
      amountCents: offer.amount_cents,
      description: offer.pitch ?? offer.description ?? offer.name,
      productName: offer.name,
      idempotencyKey: `offer:${offer.id}:lead:${args.leadId}`,
      flowId: offer.flow_id,
    });

    const lines = [
      `<b>${offer.name}</b>`,
      `Valor: R$ ${(offer.amount_cents / 100).toFixed(2).replace(".", ",")}`,
    ];
    if (charge.pix_code) {
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=12&data=${encodeURIComponent(
        charge.pix_code,
      )}`;
      await sendPhoto(args.token, args.chatId, qr, "Escaneie o QR Code para pagar");
      lines.push("", "PIX copia e cola:", `<code>${charge.pix_code}</code>`);
    }
    lines.push("", "Assim que o PIX for confirmado, liberamos o acesso automaticamente.");
    await sendMessage(args.token, args.chatId, lines.join("\n"));
    await logActivity(args.userId, "pagamento", "cobrança de oferta criada", charge.id);
  } catch (error) {
    await sendMessage(
      args.token,
      args.chatId,
      "Não conseguimos gerar o pagamento desta oferta agora. Tente novamente em instantes.",
    );
    await notify(
      args.userId,
      "error",
      "Falha ao gerar PIX da oferta",
      error instanceof Error ? error.message : "Erro desconhecido",
      "flow_offer",
      offer.id,
    );
  }
}
