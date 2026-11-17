import { supabaseAdmin } from "@/integrations/supabase/client.server";

const API = "https://api.telegram.org";

export type TelegramSendResult = { ok: boolean; error?: string; result?: any };

// Cache em memória de file_id do Telegram para evitar downloads/uploads repetidos
export const telegramFileIdCache = new Map<string, string>();

// Cache curto em memória de fluxo e configurações ativas do bot (TTL 2s para refletir edições imediatamente)
const BOT_CONFIG_TTL_MS = 2_000;
interface BotConfigCacheEntry {
  flow: any;
  cfg: any;
  expiresAt: number;
  refreshing?: boolean;
}
export const botConfigCache = new Map<string, BotConfigCacheEntry>();
const botConfigInFlight = new Map<string, Promise<BotConfigCacheEntry>>();

// Cache temporário em memória de códigos PIX gerados (garante fallback de cópia mesmo se DB falhar)
export const pixCodeCache = new Map<string, { code: string; expiresAt: number }>();

export interface CachedChatMessage {
  id: string;
  direction: "in" | "out";
  kind: string;
  body: string;
  file_id: string | null;
  file_name: string | null;
  telegram_message_id: number | null;
  created_at: string;
}

export const leadChatMemoryCache = new Map<string, CachedChatMessage[]>();

export function appendLeadChatMemory(
  keys: Array<string | number | null | undefined>,
  msg: CachedChatMessage,
) {
  for (const rawKey of keys) {
    if (rawKey === null || rawKey === undefined || rawKey === "") continue;
    const k = String(rawKey);
    const list = leadChatMemoryCache.get(k) ?? [];
    if (!list.some((m) => m.id === msg.id)) {
      list.push(msg);
      if (list.length > 200) list.shift();
      leadChatMemoryCache.set(k, list);
    }
  }
}

export function invalidateBotCache(botId: string) {
  botConfigCache.delete(botId);
}

export function setCachedBotConfig(botId: string, flow: any, cfg: any) {
  botConfigCache.set(botId, {
    flow,
    cfg,
    expiresAt: Date.now() + BOT_CONFIG_TTL_MS,
    refreshing: false,
  });
}

async function fetchBotConfigEntry(botId: string): Promise<BotConfigCacheEntry> {
  const existing = botConfigInFlight.get(botId);
  if (existing) return existing;

  const task = (async () => {
    const flow = await resolveBotFlow(botId);
    const { normalizeAdvancedConfig } = await import("@/lib/flow-advanced");
    const cfg = normalizeAdvancedConfig(flow?.simple_config as any);
    const entry: BotConfigCacheEntry = {
      flow,
      cfg,
      expiresAt: Date.now() + BOT_CONFIG_TTL_MS,
      refreshing: false,
    };
    botConfigCache.set(botId, entry);
    return entry;
  })().finally(() => {
    botConfigInFlight.delete(botId);
  });

  botConfigInFlight.set(botId, task);
  return task;
}

export async function getCachedBotConfig(botId: string): Promise<BotConfigCacheEntry> {
  const now = Date.now();
  const cached = botConfigCache.get(botId);
  if (cached && cached.expiresAt > now) {
    return cached;
  }
  return fetchBotConfigEntry(botId);
}

export const userCredsCache = new Map<string, { pk?: string; expiresAt: number }>();

export async function sendChatAction(
  token: string,
  chatId: number,
  action: "typing" | "upload_photo" | "record_video" | "upload_video" | "choose_sticker" = "typing"
) {
  try {
    return await fetch(`${API}/bot${token}/sendChatAction`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Connection: "keep-alive",
      },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch (err) {
    console.warn("[sendChatAction-err]", err);
  }
}

async function callTelegram(token: string, method: string, body: unknown): Promise<TelegramSendResult> {
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Connection: "keep-alive",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; description?: string; result?: any };
    if (!json.ok) return { ok: false, error: json.description ?? "Erro do Telegram" };
    return { ok: true, result: json.result };
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

export function editMessageCaption(
  token: string,
  chatId: number,
  messageId: number,
  caption: string,
  replyMarkup?: unknown,
) {
  return callTelegram(token, "editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function editMessageReplyMarkup(
  token: string,
  chatId: number,
  messageId: number,
  replyMarkup: unknown
) {
  return callTelegram(token, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

function resolveMediaTarget(m: { fileId?: string; url?: string }): string {
  if (m.fileId && !m.fileId.startsWith("data:") && !m.fileId.startsWith("local_")) {
    return m.fileId;
  }
  if (m.url && !m.url.startsWith("local_")) {
    return m.url;
  }
  if (m.fileId && !m.fileId.startsWith("local_")) {
    return m.fileId;
  }
  return "";
}

export async function sendPhoto(
  token: string,
  chatId: number,
  urlOrFileId: string,
  caption?: string,
  replyMarkup?: unknown
) {
  const cachedFileId = telegramFileIdCache.get(urlOrFileId) || urlOrFileId;

  if (cachedFileId && cachedFileId.startsWith("data:")) {
    const commaIndex = cachedFileId.indexOf(",");
    if (commaIndex > -1) {
      const header = cachedFileId.slice(5, commaIndex);
      const base64Data = cachedFileId.slice(commaIndex + 1).replace(/\s/g, "");
      const mime = header.split(";")[0] || "image/jpeg";
      const buffer = Buffer.from(base64Data, "base64");
      const form = new FormData();
      form.append("chat_id", String(chatId));
      if (caption) {
        form.append("caption", caption);
        form.append("parse_mode", "HTML");
      }
      if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));
      const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
      const blob = new Blob([buffer], { type: mime });
      form.append("photo", blob, `photo.${ext}`);

      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        headers: { Connection: "keep-alive" },
        body: form,
      });
      const data = (await res.json()) as { ok: boolean; result?: any };
      if (data.ok && data.result?.photo?.length) {
        const fileId = data.result.photo[data.result.photo.length - 1].file_id;
        telegramFileIdCache.set(urlOrFileId, fileId);
      }
      return data as TelegramSendResult;
    }
  }

  const result = await callTelegram(token, "sendPhoto", {
    chat_id: chatId,
    photo: cachedFileId,
    caption: caption || undefined,
    parse_mode: caption ? "HTML" : undefined,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });

  if (result.ok && result.result?.photo?.length) {
    const fileId = result.result.photo[result.result.photo.length - 1].file_id;
    telegramFileIdCache.set(urlOrFileId, fileId);
  }

  return result;
}

export async function sendVideo(
  token: string,
  chatId: number,
  urlOrFileId: string,
  caption?: string,
  replyMarkup?: unknown
) {
  const cachedFileId = telegramFileIdCache.get(urlOrFileId) || urlOrFileId;

  if (cachedFileId && cachedFileId.startsWith("data:")) {
    const commaIndex = cachedFileId.indexOf(",");
    if (commaIndex > -1) {
      const header = cachedFileId.slice(5, commaIndex);
      const base64Data = cachedFileId.slice(commaIndex + 1).replace(/\s/g, "");
      const mime = header.split(";")[0] || "video/mp4";
      const buffer = Buffer.from(base64Data, "base64");
      const form = new FormData();
      form.append("chat_id", String(chatId));
      if (caption) {
        form.append("caption", caption);
        form.append("parse_mode", "HTML");
      }
      if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));
      const blob = new Blob([buffer], { type: mime });
      form.append("video", blob, "video.mp4");

      const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
        method: "POST",
        headers: { Connection: "keep-alive" },
        body: form,
      });
      const data = (await res.json()) as { ok: boolean; result?: any };
      if (data.ok && data.result?.video?.file_id) {
        telegramFileIdCache.set(urlOrFileId, data.result.video.file_id);
      }
      return data as TelegramSendResult;
    }
  }

  const result = await callTelegram(token, "sendVideo", {
    chat_id: chatId,
    video: cachedFileId,
    caption: caption || undefined,
    parse_mode: caption ? "HTML" : undefined,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });

  if (result.ok && result.result?.video?.file_id) {
    telegramFileIdCache.set(urlOrFileId, result.result.video.file_id);
  }

  return result;
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(val?: string | null): val is string {
  return typeof val === "string" && UUID_REGEX.test(val);
}

export async function notify(
  userId: string,
  type: string,
  title: string,
  body?: string,
  entity?: string,
  entityId?: string,
) {
  await Promise.allSettled([
    supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type,
      title,
      body: body ?? null,
      entity: entity ?? null,
      entity_id: isUuid(entityId) ? entityId : null,
    }),
    import("@/lib/webpush.server").then(({ sendWebPushToUser }) =>
      sendWebPushToUser(userId, {
        title,
        body: body ?? title,
        tag: `${entityId || "sale"}-${Date.now()}`,
        url: entity === "payment" ? "/app/payments" : "/app",
      }),
    ),
  ]);
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
    entity_id: isUuid(entityId) ? entityId : null,
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
 * Resolve qual fluxo o bot deve executar em uma única query rápida:
 * prioriza o fluxo ativo e, caso não exista, o mais recente com configuração/etapas.
 */
export async function resolveBotFlow(botId: string): Promise<{ id: string; simple_config?: unknown } | null> {
  const { data: flows } = await supabaseAdmin
    .from("flows")
    .select("id,is_active,simple_config")
    .eq("bot_id", botId)
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(5);

  if (!flows || flows.length === 0) return null;
  const chosen = flows.find((f) => f.is_active || Boolean(f.simple_config)) ?? flows[0];
  return chosen ? { id: chosen.id, simple_config: chosen.simple_config } : null;
}

export type LeadPreferences = {
  language?: "pt" | "en";
  currency?: "BRL" | "USD" | "EUR" | "GBP";
  selectedPlanId?: string;
  country?: string;
};

export const leadPrefsCache = new Map<string, LeadPreferences>();

export async function getLeadPreferences(leadId: string): Promise<LeadPreferences> {
  const cached = leadPrefsCache.get(leadId);
  if (cached) return cached;
  if (!isUuid(leadId)) return {};
  try {
    const { data } = await supabaseAdmin
      .from("activity_logs")
      .select("metadata")
      .eq("entity", "lead_preference")
      .eq("entity_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const result = (data?.metadata as LeadPreferences) ?? {};
    leadPrefsCache.set(leadId, result);
    return result;
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
    const current = leadPrefsCache.get(leadId) ?? {};
    const updated = { ...current, ...prefs };
    leadPrefsCache.set(leadId, updated);

    if (isUuid(leadId)) {
      // Gravação assíncrona em background sem bloquear o envio de mensagens para o lead
      supabaseAdmin
        .from("activity_logs")
        .insert({
          user_id: userId,
          entity: "lead_preference",
          action: "update_preferences",
          entity_id: leadId,
          metadata: updated as Record<string, unknown>,
        })
        .then(
          () => undefined,
          (e) => console.warn("Falha ao salvar preferência do lead:", e),
        );
    }

    return updated;
  } catch (e) {
    console.warn("Falha ao salvar preferência do lead:", e);
    return prefs;
  }
}

/**
 * Envia as mídias configuradas na etapa de apresentação do bot (/start) sem atrasos artificiais.
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
        url: resolveMediaTarget(m),
        caption: m.caption || "",
      }))
      .filter((m) => Boolean(m.url));
    if (mediaList.length > 0) {
      await sendMediaGroup(token, chatId, mediaList);
      return;
    }
  }

  for (const m of welcomeMedia) {
    const target = resolveMediaTarget(m);
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
    }
  }
}

async function persistUpgradedMediaFileIds(
  flow: { id?: string; simple_config?: unknown } | null,
  cfg: any,
  mediaTargets: Array<{ item: any; target: string }>,
) {
  if (!flow?.id || !Array.isArray(cfg?.welcome?.media)) return;
  let changed = false;

  for (const { item, target } of mediaTargets) {
    if (!target.startsWith("data:")) continue;
    const cachedId = telegramFileIdCache.get(target);
    if (cachedId && !cachedId.startsWith("data:")) {
      item.fileId = cachedId;
      item.url = cachedId;
      changed = true;
    }
  }

  if (!changed || !flow.simple_config || typeof flow.simple_config !== "object") return;

  try {
    const sc = flow.simple_config as Record<string, any>;
    const nextConfig = {
      ...sc,
      welcome: {
        ...(sc["welcome"] || {}),
        media: cfg.welcome.media,
      },
    };
    flow.simple_config = nextConfig;
    await Promise.race([
      supabaseAdmin.from("flows").update({ simple_config: nextConfig as never }).eq("id", flow.id),
      new Promise((resolve) => setTimeout(resolve, 900)),
    ]);
  } catch (err) {
    console.warn("[persist-media-fileid-warn]", err);
  }
}

/**
 * Fluxo de boas-vindas do Telegram (/start) ultra-otimizado (< 1s):
 * - Resolução instantânea via cache em memória (TTL 5min com stale-while-revalidate)
 * - Prioridade absoluta para Telegram file_id e gravação automática no fluxo
 * - Disparo unificado (Foto/Vídeo + Copy + Botões de Idioma em 1 única requisição HTTP)
 */
export async function handleTelegramStart(params: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
}) {
  const { cfg, flow } = await getCachedBotConfig(params.botId);

  const welcomeText =
    cfg.welcome?.startMessage?.trim() ||
    cfg.gate?.welcomeMessagePt?.trim() ||
    "Olá! Seja muito bem-vindo(a)! 👋\n\nEstamos felizes em ter você aqui.\n\nAntes de continuar, escolha o seu idioma de preferência abaixo / Before continuing, please choose your preferred language below:";

  const languageMarkup = {
    inline_keyboard: [
      [
        { text: "🇧🇷 Português", callback_data: "lang:pt" },
        { text: "🇺🇸 English", callback_data: "lang:en" },
      ],
    ],
  };

  const mediaList = (cfg.welcome?.media ?? []).filter((m: any) => Boolean(m.fileId || m.url));
  const usedTargets: Array<{ item: any; target: string }> = [];

  // Otimização Máxima: 1 mídia + legenda <= 1024 caracteres em 1 ÚNICA chamada HTTP ao Telegram
  if (mediaList.length === 1) {
    const m = mediaList[0];
    const target = resolveMediaTarget(m);
    if (target) usedTargets.push({ item: m, target });

    if (target && welcomeText.length <= 1024) {
      const res =
        m.kind === "video"
          ? await sendVideo(params.token, params.chatId, target, welcomeText, languageMarkup)
          : await sendPhoto(params.token, params.chatId, target, welcomeText, languageMarkup);
      if (res.ok) {
        await persistUpgradedMediaFileIds(flow, cfg, usedTargets);
        return;
      }
      await sendMessage(params.token, params.chatId, welcomeText, languageMarkup);
      return;
    }

    if (target) {
      if (m.kind === "video") {
        await sendVideo(params.token, params.chatId, target, m.caption || undefined).catch(() => undefined);
      } else {
        await sendPhoto(params.token, params.chatId, target, m.caption || undefined).catch(() => undefined);
      }
      await sendMessage(params.token, params.chatId, welcomeText, languageMarkup);
      await persistUpgradedMediaFileIds(flow, cfg, usedTargets);
      return;
    }
  }

  if (mediaList.length > 1) {
    for (const m of mediaList) {
      const target = resolveMediaTarget(m);
      if (target) usedTargets.push({ item: m, target });
    }
    await sendWelcomeMedia(params.token, params.chatId, mediaList, cfg.welcome?.mediaMode);
  }

  await sendMessage(params.token, params.chatId, welcomeText, languageMarkup);
  if (usedTargets.length > 0) {
    await persistUpgradedMediaFileIds(flow, cfg, usedTargets);
  }
}

export function buildBrlPlansPayload(cfg: any) {
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

  const text =
    cfg.welcome?.messagePt?.trim() ||
    cfg.welcome?.message?.trim() ||
    "Olá! Seja muito bem-vindo(a) ao nosso atendimento VIP! 👋\n\nEscolha um dos nossos planos exclusivos abaixo para ter acesso imediato:";

  const inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const plan of planItems) {
    const priceStr = Number(plan.price || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const emoji = plan.emoji ? `${plan.emoji} ` : "";
    const emojiRight = plan.emoji ? ` ${plan.emoji}` : "";
    const rawBtn = plan.buttonText?.trim();
    const label = rawBtn
      ? rawBtn.replace(/\{nome\}/gi, plan.name).replace(/\{preco\}/gi, `R$ ${priceStr}`)
      : `${emoji}${plan.name}${emojiRight} por R$ ${priceStr}`;
    inline_keyboard.push([{ text: label, callback_data: `pix_plan:${plan.id}` }]);
  }

  return { text, replyMarkup: { inline_keyboard } };
}

/**
 * Trata a escolha de idioma pelo lead PRESERVANDO o vídeo/foto da mensagem inicial:
 * - Edita a legenda + botões no mesmo post de mídia (editMessageCaption) quando possível,
 *   ou remove apenas os botões e envia o novo texto abaixo sem apagar a mídia.
 */
export async function handleLanguageSelect(params: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
  messageId?: number | undefined;
  language: "pt" | "en";
}) {
  setLeadPreferences(params.userId, params.leadId, {
    language: params.language,
    ...(params.language === "pt" ? { currency: "BRL" } : {}),
  });

  const { cfg } = await getCachedBotConfig(params.botId);

  const payload =
    params.language === "pt"
      ? buildBrlPlansPayload(cfg)
      : {
          text:
            cfg.welcome?.messageEn?.trim() ||
            "Hello! Welcome to our VIP service. 👋\n\nPlease choose your preferred currency below to view our exclusive plans:",
          replyMarkup: {
            inline_keyboard: [
              [
                { text: "💵 USD ($)", callback_data: "curr:USD" },
                { text: "💶 EUR (€)", callback_data: "curr:EUR" },
                { text: "💷 GBP (£)", callback_data: "curr:GBP" },
              ],
            ],
          },
        };

  if (params.messageId && payload.text.length <= 1024) {
    const capRes = await editMessageCaption(
      params.token,
      params.chatId,
      params.messageId,
      payload.text,
      payload.replyMarkup,
    );
    if (capRes.ok) return;

    const txtRes = await editMessageText(
      params.token,
      params.chatId,
      params.messageId,
      payload.text,
      payload.replyMarkup,
    );
    if (txtRes.ok) return;
  }

  if (params.messageId) {
    editMessageReplyMarkup(params.token, params.chatId, params.messageId, {
      inline_keyboard: [],
    }).catch(() => undefined);
  }

  await sendMessage(params.token, params.chatId, payload.text, payload.replyMarkup);
}

/**
 * Trata a escolha de moeda no fluxo em inglês (USD, EUR, GBP):
 * Realiza a substituição in-place dos botões via editMessageReplyMarkup:
 * NÃO envia nova mensagem nem altera o texto/caption atual,
 * apenas substitui instantaneamente os botões de moedas pelos botões dos Planos na moeda escolhida.
 */
export async function handleCurrencySelect(params: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
  messageId?: number | undefined;
  currency: "BRL" | "USD" | "EUR" | "GBP";
}) {
  // Mostra digitando imediatamente pro lead
  sendChatAction(params.token, params.chatId, "typing").catch(() => undefined);
  setLeadPreferences(params.userId, params.leadId, { currency: params.currency });

  const { cfg } = await getCachedBotConfig(params.botId);
  const { formatCurrencyPrice } = await import("@/lib/flow-advanced");

  const planItems = cfg.plans?.items?.length
    ? cfg.plans.items
    : [
        { id: "plan-1", name: "VIP ACCESS", price: 29.9, duration: "Lifetime Access" },
      ];

  const inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const plan of planItems) {
    const customPrice =
      params.currency === "USD"
        ? plan.priceUsd
        : params.currency === "EUR"
        ? plan.priceEur
        : params.currency === "GBP"
        ? plan.priceGbp
        : undefined;
    const conv = formatCurrencyPrice(plan.price, params.currency, customPrice);
    const emoji = plan.emoji ? `${plan.emoji} ` : "";
    const emojiRight = plan.emoji ? ` ${plan.emoji}` : "";
    const rawBtn = plan.buttonText?.trim();
    const label =
      rawBtn && !rawBtn.includes("R$")
        ? rawBtn.replace(/\{nome\}/gi, plan.name).replace(/\{preco\}/gi, conv.formatted)
        : `${emoji}${plan.name}${emojiRight} — ${conv.formatted}`;
    inline_keyboard.push([
      {
        text: label,
        callback_data: `intl_plan:${plan.id}:${params.currency}`,
      },
    ]);
  }

  // Opção para trocar a moeda mantendo o chat limpo
  inline_keyboard.push([
    { text: "🌐 Change Currency", callback_data: "nav:curr" },
  ]);

  // Substituição in-place dos botões sem enviar nova mensagem e sem alterar texto/mídia
  if (params.messageId) {
    const editRes = await editMessageReplyMarkup(params.token, params.chatId, params.messageId, {
      inline_keyboard,
    });
    if (editRes.ok) return;
  }

  // Fallback caso a mensagem não suporte edição de botões ou não tenha messageId
  await sendIntlPlansMenu(params, cfg, params.currency, false);
}

/**
 * Exibe a mensagem de apresentação com o botão CTA para ver os planos.
 */
export async function sendPresentationMessageWithCta(
  params: {
    userId: string;
    botId: string;
    token: string;
    leadId: string;
    chatId: number;
  },
  cfg: any,
  language: "pt" | "en" = "pt"
) {
  const text =
    language === "en"
      ? (cfg.welcome?.messageEn || "Hello! Welcome to our VIP service.\nTap the button below to view our exclusive plans:")
      : (cfg.welcome?.messagePt || cfg.welcome?.message || "Olá! Bem-vindo(a) ao nosso atendimento VIP.\nToque no botão abaixo para ver nossos planos exclusivos:");

  const ctaLabel =
    language === "en"
      ? (cfg.welcome?.ctaEn || "💎 View Plans")
      : (cfg.welcome?.ctaPt || "💎 Ver Planos");

  await sendMessage(params.token, params.chatId, text, {
    inline_keyboard: [
      [
        { text: ctaLabel, callback_data: "view_plans" },
      ],
    ],
  });
}

/**
 * Passo 4 — Exibição dos Planos após clicar no botão CTA "Ver Planos".
 */
export async function handleViewPlans(params: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
  messageId?: number | undefined;
}) {
  if (params.messageId) {
    deleteMessage(params.token, params.chatId, params.messageId).catch(() => undefined);
  }

  const [{ cfg }, prefs] = await Promise.all([
    getCachedBotConfig(params.botId),
    getLeadPreferences(params.leadId),
  ]);
  const currency = (prefs.currency || "BRL") as "BRL" | "USD" | "EUR" | "GBP";

  if (currency === "BRL") {
    await sendBrlPlansMenu(params, cfg, false);
  } else {
    await sendIntlPlansMenu(params, cfg, currency, false);
  }
}

/**
 * Exibe os planos exclusivamente em REAL BRASILEIRO (BRL) via PIX.
 * Acrescenta o texto de apresentação em português junto com os planos.
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
  _isFirstGreeting = true
) {
  const { text, replyMarkup } = buildBrlPlansPayload(cfg);
  await sendMessage(params.token, params.chatId, text, replyMarkup);
}


/**
 * Exibe os planos convertidos na moeda internacional escolhida (1:1 sem cálculo de câmbio).
 * Acrescenta o texto em inglês junto com os planos.
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

  const text =
    `Hello! Welcome! 👋\n\n` +
    `Select one of our exclusive VIP plans below in ${currency} to get instant access:`;

  const inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const plan of planItems) {
    const customPrice =
      currency === "USD"
        ? plan.priceUsd
        : currency === "EUR"
        ? plan.priceEur
        : currency === "GBP"
        ? plan.priceGbp
        : undefined;
    const conv = formatCurrencyPrice(plan.price, currency, customPrice);
    const emoji = plan.emoji ? `${plan.emoji} ` : "⭐ ";
    const emojiRight = plan.emoji ? ` ${plan.emoji}` : "";
    const rawBtn = plan.buttonText?.trim();
    const label =
      rawBtn && !rawBtn.includes("R$")
        ? rawBtn.replace(/\{nome\}/gi, plan.name).replace(/\{preco\}/gi, conv.formatted)
        : `${emoji}${plan.name}${emojiRight} — ${conv.formatted}`;
    inline_keyboard.push([
      {
        text: label,
        callback_data: `intl_plan:${plan.id}:${currency}`,
      },
    ]);
  }

  // Uma única mensagem adicionada após as mídias: texto em inglês + botões de planos convertidos 1:1
  await sendMessage(params.token, params.chatId, text, { inline_keyboard });
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
  // Mostra digitando imediatamente pro lead
  sendChatAction(params.token, params.chatId, "typing").catch(() => undefined);

  // Background updates sem bloquear o envio da mensagem
  setLeadPreferences(params.userId, params.leadId, {
    selectedPlanId: params.planId,
    currency: params.currency,
  });

  supabaseAdmin
    .from("leads")
    .update({ status: "engaged" })
    .eq("id", params.leadId)
    .then(() => undefined)
    .catch(() => undefined);

  const { cfg, flow } = await getCachedBotConfig(params.botId);
  const { formatCurrencyPrice } = await import("@/lib/flow-advanced");

  const plan =
    cfg.plans?.items?.find((p: any) => p.id === params.planId) ||
    cfg.plans?.items?.[0] || {
      name: "VIP Plan",
      price: 29.9,
      duration: "Lifetime Access",
    };

  const customPrice =
    params.currency === "USD"
      ? plan.priceUsd
      : params.currency === "EUR"
      ? plan.priceEur
      : params.currency === "GBP"
      ? plan.priceGbp
      : undefined;

  const conv = formatCurrencyPrice(plan.price, params.currency, customPrice);
  const amountCents = Math.round(conv.amount * 100);

  // Busca o nome do lead para salvar explicitamente no log de atividades e notificações
  let leadName = "Lead";
  if (isUuid(params.leadId)) {
    try {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("name,telegram_username")
        .eq("id", params.leadId)
        .maybeSingle();
      if (lead) {
        leadName =
          lead.name ||
          (lead.telegram_username ? `@${lead.telegram_username}` : "Lead");
      }
    } catch {
      // fallback
    }
  }

  // Registra IMEDIATAMENTE o pedido pendente em `payments` (dispara Realtime push notification + som de caixa registradora no celular)
  let orderId = `stripe-${Date.now()}`;
  try {
    const { data: pendingPayment, error: payErr } = await supabaseAdmin
      .from("payments")
      .insert({
        user_id: params.userId,
        bot_id: params.botId,
        lead_id: isUuid(params.leadId) ? params.leadId : null,
        amount_cents: amountCents,
        currency: params.currency,
        method: "card",
        provider: "stripe",
        status: "pending",
        product_name: plan.name,
        description: `Plano Internacional ${plan.name} (${conv.formatted})`,
        flow_id: flow?.id || null,
      })
      .select("id")
      .maybeSingle();

    if (pendingPayment?.id) {
      orderId = pendingPayment.id;
    }
    if (payErr) {
      console.warn("[intl-payment-insert-err]", payErr);
    }
  } catch (err) {
    console.warn("[intl-payment-insert-catch]", err);
  }

  // Log de atividades imediato no feed do painel
  await logActivity(
    params.userId,
    "pagamento",
    `Pedido Internacional (${params.currency}) gerado por ${leadName} - ${plan.name} (${conv.formatted})`,
    orderId,
    {
      lead_name: leadName,
      lead_id: params.leadId,
      plan_name: plan.name,
      amount_cents: amountCents,
      currency: params.currency,
      provider: "stripe",
    }
  );

  // Notificação interna
  await notify(
    params.userId,
    "info",
    `🛒 Pedido Internacional Gerado (${params.currency})`,
    `Pedido de ${conv.formatted} gerado por ${leadName} (${plan.name}) via Stripe.`,
    "payment",
    orderId
  ).catch(() => undefined);

  // Gatilho 2: Agenda o downsell automático de pedido internacional abandonado
  import("@/lib/downsell.server").then(({ schedulePixDownsells }) => {
    schedulePixDownsells({
      userId: params.userId,
      botId: params.botId,
      leadId: params.leadId,
      chatId: params.chatId,
      orderId: orderId,
      flowId: flow?.id,
    });
  }).catch((e) => console.warn("[downsell-intl-schedule-bg]", e));

  const domain = process.env.DOMAIN || "https://telabot-studio.vercel.app";
  const checkoutParams = new URLSearchParams({
    plan_name: plan.name,
    price: conv.amount.toFixed(2),
    currency: params.currency,
    lead_id: params.leadId,
    bot_id: params.botId,
    plan_id: params.planId,
    payment_id: orderId,
  });

  if (cfg.bots?.username) {
    checkoutParams.set("bot_user", cfg.bots.username.replace("@", ""));
  }

  if (plan.stripePriceId) {
    checkoutParams.set("price_id", plan.stripePriceId);
  }
  if (plan.stripeMode) {
    checkoutParams.set("mode", plan.stripeMode);
  }

  // Tenta recuperar a publishable key do usuário em memória
  const creds = userCredsCache.get(params.userId);
  if (creds?.pk) {
    checkoutParams.set("pk", creds.pk);
  } else {
    // Busca do banco e armazena em cache
    let foundPk = "";
    const { data: dbCreds } = await supabaseAdmin
      .from("user_gateway_credentials")
      .select("client_id")
      .eq("user_id", params.userId)
      .eq("provider", "stripe")
      .maybeSingle();

    if (dbCreds?.client_id) {
      foundPk = dbCreds.client_id;
    } else {
      const { data: gw } = await supabaseAdmin
        .from("payment_gateways")
        .select("credentials")
        .eq("user_id", params.userId)
        .eq("name", "Stripe")
        .maybeSingle();
      if (gw?.credentials && typeof gw.credentials === "object") {
        foundPk = (gw.credentials as any).publishableKey || "";
      }
    }

    if (foundPk) {
      userCredsCache.set(params.userId, { pk: foundPk, expiresAt: Date.now() + 300000 });
      checkoutParams.set("pk", foundPk);
    }
  }

  let checkoutUrl = `${domain}/checkout?${checkoutParams.toString()}`;

  // Gera diretamente a cobrança NATIVA hospedada na Stripe (checkout.stripe.com)
  try {
    const { createNativeStripeCheckoutSession } = await import("@/lib/stripe.server");
    const botUsername = (cfg.bots?.username || "").replace("@", "");

    const session = await createNativeStripeCheckoutSession({
      userId: params.userId,
      mode: (plan.stripeMode as "payment" | "subscription") || "payment",
      currency: params.currency,
      unitAmountCents: amountCents > 0 ? amountCents : 2990,
      productName: plan.name,
      productDescription: `Acesso VIP ${plan.name} (${conv.formatted})`,
      priceId: plan.stripePriceId || undefined,
      successUrl: `${domain}/checkout?success=true&payment_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: botUsername ? `https://t.me/${botUsername}` : `${domain}/checkout?cancelled=true`,
      clientReferenceId: orderId,
      metadata: {
        user_id: params.userId,
        bot_id: params.botId,
        lead_id: params.leadId,
        payment_id: orderId,
        plan_name: plan.name,
        currency: params.currency,
      },
    });

    if (session?.url) {
      checkoutUrl = session.url;
    }
  } catch (stripeErr) {
    console.warn("[native-stripe-hosted-session-fallback]", stripeErr);
  }

  const lines = [
    `⭐ <b>${plan.name.toUpperCase()}</b>`,
    "",
    `• Duration: <b>${plan.duration || "Lifetime Access"}</b>`,
    `• Amount: <b>${conv.formatted}</b>`,
    "",
    "🔒 <b>Secure International Checkout (Stripe)</b>",
    "",
    "Click the link below to pay with Credit Card, Apple Pay or Google Pay via Stripe:",
  ];

  const support = cfg.bots?.supportUsername ? cfg.bots.supportUsername.replace("@", "") : "";
  const inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  inline_keyboard.push([
    { text: `💳 Pay ${conv.formatted} with Card (Stripe) ↗`, url: checkoutUrl },
  ]);

  if (support) {
    inline_keyboard.push([{ text: "💬 Contact Support", url: `https://t.me/${support}` }]);
  }
  inline_keyboard.push([
    { text: "↩️ Back to Plans", callback_data: "nav:plans" },
    { text: "🌐 Change Language", callback_data: "nav:lang" },
  ]);

  await sendMessage(params.token, params.chatId, lines.join("\n"), { inline_keyboard });
}

export function getCachedPixCode(chargeId: string): string | null {
  const cached = pixCodeCache.get(chargeId);
  if (!cached || cached.expiresAt < Date.now()) return null;
  return cached.code;
}

/**
 * Envia o pagamento PIX em duas mensagens separadas no Telegram:
 * 1) Resumo do plano, valor e instruções de pagamento
 * 2) Código PIX Copia e Cola isolado com botão de cópia direta (copy_text) e fallback
 */
export async function sendPixPaymentMessages(params: {
  token: string;
  chatId: number;
  chargeId: string;
  title: string;
  priceFormatted: string;
  pixCode?: string | null;
  expiresMinutes?: number;
  showBackToPlans?: boolean;
  footerText?: string;
}): Promise<TelegramSendResult> {
  const showBack = params.showBackToPlans !== false;
  const infoLines = [
    `⭐ <b>${params.title}</b>`,
    `💰 Valor: <b>R$ ${params.priceFormatted}</b>`,
    "",
    "📲 <b>Como pagar via PIX:</b>",
    "1. Copie o código PIX enviado separadamente abaixo (ou clique no botão <b>📋 Copiar Código PIX</b>).",
    "2. Abra o aplicativo do seu banco e escolha <b>PIX Copia e Cola</b>.",
    "3. Cole o código e finalize o pagamento.",
  ];
  if (params.expiresMinutes && params.expiresMinutes > 0) {
    infoLines.push("", `⏳ Esta cobrança expira em ${params.expiresMinutes} minutos.`);
  }
  infoLines.push(
    "",
    `⚡ <i>${params.footerText || "Assim que o PIX for confirmado, o acesso é liberado automaticamente aqui."}</i>`,
  );

  if (!params.pixCode) {
    const fallbackButtons: Array<Array<{ text: string; callback_data: string }>> = [
      [{ text: "✅ Já realizei o pagamento", callback_data: `check_payment:${params.chargeId}` }],
    ];
    if (showBack) {
      fallbackButtons.push([{ text: "↩️ Voltar aos Planos", callback_data: "nav:plans" }]);
    }
    return sendMessage(params.token, params.chatId, infoLines.join("\n"), {
      inline_keyboard: fallbackButtons,
    });
  }

  pixCodeCache.set(params.chargeId, {
    code: params.pixCode,
    expiresAt: Date.now() + 3_600_000,
  });

  // Mensagem 1: Detalhes e instruções do pagamento
  await sendMessage(params.token, params.chatId, infoLines.join("\n"));

  const codeText = `<code>${params.pixCode}</code>`;
  const buildKeyboard = (useNativeCopy: boolean) => {
    const rows: Array<Array<Record<string, unknown>>> = [
      [
        useNativeCopy
          ? { text: "📋 Copiar Código PIX", copy_text: { text: params.pixCode } }
          : { text: "📋 Copiar Código PIX", callback_data: `copy_pix:${params.chargeId}` },
      ],
      [{ text: "✅ Já realizei o pagamento", callback_data: `check_payment:${params.chargeId}` }],
    ];
    if (showBack) {
      rows.push([{ text: "↩️ Voltar aos Planos", callback_data: "nav:plans" }]);
    }
    return { inline_keyboard: rows };
  };

  // Mensagem 2: Código PIX Copia e Cola isolado com botão de copiar
  const codeRes = await sendMessage(params.token, params.chatId, codeText, buildKeyboard(true));
  if (!codeRes.ok) {
    return sendMessage(params.token, params.chatId, codeText, buildKeyboard(false));
  }
  return codeRes;
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
  setLeadPreferences(params.userId, params.leadId, {
    selectedPlanId: params.planId,
    currency: "BRL",
  });

  const { cfg, flow } = await getCachedBotConfig(params.botId);

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
  let usedFallback = false;

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
      idempotencyKey: `plan:${plan.id}:${amountCents}:lead:${params.leadId}`,
      flowId: flow?.id || null,
    });
  } catch (error) {
    usedFallback = true;
    console.warn("[pix-plan-warning] Falha ao criar cobrança no banco, tentando OmegaPay direto:", error);
    const directChargeId =
      typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `pix-${Date.now()}`;

    try {
      const { createOmegaPixCharge } = await import("@/lib/payments/omegapay.server");
      const omegaRes = await createOmegaPixCharge({
        chargeId: directChargeId,
        amountCents,
        description: `Plano ${plan.name} (${plan.duration || "Acesso Imediato"})`,
        productName: plan.name,
        expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
      });
      charge = { id: directChargeId, pix_code: omegaRes.pixCode };
    } catch (omegaErr) {
      console.warn("[pix-plan-omega-fallback] Gerando PIX estático de emergência:", omegaErr);
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
        id: directChargeId,
        pix_code: fallbackPixCode,
      };
    }
  }

  const priceFormatted = (amountCents / 100).toFixed(2).replace(".", ",");

  const sideEffectsPromise = (async () => {
    try {
      let leadName = "Lead";
      if (isUuid(params.leadId)) {
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("name,telegram_username")
          .eq("id", params.leadId)
          .maybeSingle();
        if (lead) {
          leadName =
            lead.name ||
            (lead.telegram_username ? `@${lead.telegram_username}` : "Lead");
        }
      }

      const bgTasks: Array<Promise<unknown>> = [
        logActivity(
          params.userId,
          "pagamento",
          `PIX gerado por ${leadName} - ${plan.name} (R$ ${priceFormatted})`,
          charge.id,
          {
            lead_name: leadName,
            lead_id: params.leadId,
            plan_name: plan.name,
            amount_cents: amountCents,
          },
        ),
        import("@/lib/downsell.server").then(({ schedulePixDownsells }) =>
          schedulePixDownsells({
            userId: params.userId,
            botId: params.botId,
            leadId: params.leadId,
            chatId: params.chatId,
            orderId: charge.id,
            flowId: flow?.id,
          }),
        ),
      ];

      if (usedFallback) {
        bgTasks.push(
          notify(
            params.userId,
            "info",
            `⏳ Venda Gerada por ${leadName}!`,
            `Novo pedido de R$ ${priceFormatted} aguardando pagamento por ${leadName} (${plan.name}).`,
            "payment",
            charge.id,
          ),
        );
      }

      await Promise.allSettled(bgTasks);
    } catch (bgErr) {
      console.warn("[pix-plan-sideeffects-warn]", bgErr);
    }
  })();

  await Promise.allSettled([
    sendPixPaymentMessages({
      token: params.token,
      chatId: params.chatId,
      chargeId: charge.id,
      title: plan.name,
      priceFormatted,
      pixCode: charge.pix_code,
      showBackToPlans: true,
    }),
    sideEffectsPromise,
  ]);
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

  const priceFormatted = (input.amount / 100).toFixed(2).replace(".", ",");
  const result = await sendPixPaymentMessages({
    token: params.token,
    chatId: params.chatId,
    chargeId: charge.id,
    title: input.productName ?? input.description,
    priceFormatted,
    pixCode: charge.pix_code,
    expiresMinutes: input.expiresMinutes,
    showBackToPlans: false,
    footerText: "Assim que o PIX for confirmado, o produto é entregue automaticamente aqui.",
  });
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

  // Gatilho 2: Agenda o downsell automático de PIX pendente
  if (charge?.id) {
    import("@/lib/downsell.server").then(({ schedulePixDownsells }) => {
      schedulePixDownsells({
        userId: params.userId,
        botId: params.botId,
        leadId: params.leadId,
        chatId: params.chatId,
        orderId: charge.id,
        flowId: params.flowId,
      });
    }).catch((e) => console.warn("[downsell-pix-schedule-bg]", e));
  }

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

    const priceFormatted = (offer.amount_cents / 100).toFixed(2).replace(".", ",");
    await sendPixPaymentMessages({
      token: args.token,
      chatId: args.chatId,
      chargeId: charge.id,
      title: offer.name,
      priceFormatted,
      pixCode: charge.pix_code,
      showBackToPlans: false,
      footerText: "Assim que o PIX for confirmado, liberamos o acesso automaticamente.",
    });
    logActivity(args.userId, "pagamento", "cobrança de oferta criada", charge.id).catch(() => undefined);
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
