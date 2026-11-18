import { createFileRoute } from "@tanstack/react-router";

// Cache em memória de update_id para evitar reenvio em duplicidade pelo Telegram
const processedUpdates = new Map<number, number>();
function isDuplicateUpdate(updateId?: number): boolean {
  if (!updateId) return false;
  const now = Date.now();
  for (const [id, time] of processedUpdates.entries()) {
    if (now - time > 60_000) processedUpdates.delete(id);
  }
  if (processedUpdates.has(updateId)) return true;
  processedUpdates.set(updateId, now);
  return false;
}

// Cache em memória do bot com TTL de 30 min e stale-while-revalidate
const BOT_CACHE_TTL_MS = 1_800_000;
const LEAD_CACHE_TTL_MS = 600_000;

export interface BotCacheItem {
  id: string;
  user_id: string;
  token: string;
  status: string;
  webhook_secret: string | null;
  expiresAt: number;
  refreshing?: boolean;
}

const localBotDbCache = new Map<string, BotCacheItem>();
const leadCache = new Map<string, { id: string; expiresAt: number }>();

export function primeBotDbCache(bot: {
  id: string;
  user_id: string;
  token: string;
  status?: string;
  webhook_secret?: string | null;
}): BotCacheItem {
  const existing = localBotDbCache.get(bot.id);
  const item: BotCacheItem = {
    id: bot.id,
    user_id: bot.user_id || existing?.user_id || "",
    token: bot.token,
    status: bot.status || "active",
    webhook_secret: bot.webhook_secret !== undefined ? bot.webhook_secret : (existing?.webhook_secret ?? null),
    expiresAt: Date.now() + BOT_CACHE_TTL_MS,
    refreshing: false,
  };
  localBotDbCache.set(bot.id, item);
  return item;
}

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    chat?: { id?: number };
    from?: { id?: number; username?: string; first_name?: string };
    text?: string;
    caption?: string;
    photo?: Array<{ file_id?: string }>;
    video?: { file_id?: string; file_name?: string };
    voice?: { file_id?: string };
    audio?: { file_id?: string; file_name?: string };
    document?: { file_id?: string; file_name?: string };
  };
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number }; message_id?: number };
    from?: { id?: number; username?: string; first_name?: string };
  };
};

async function refreshBotCache(
  supabaseAdmin: any,
  botId: string,
  sharedBotDbCache?: Map<string, BotCacheItem>,
): Promise<BotCacheItem | null> {
  const { data: dbBot } = await supabaseAdmin
    .from("bots")
    .select("id,user_id,token,status,webhook_secret")
    .eq("id", botId)
    .maybeSingle();

  if (!dbBot) return null;
  const item = primeBotDbCache(dbBot);
  sharedBotDbCache?.set(botId, item);
  return item;
}

async function resolveCachedBot(
  supabaseAdmin: any,
  botId: string,
  sharedBotDbCache?: Map<string, BotCacheItem>,
): Promise<BotCacheItem | null> {
  const now = Date.now();
  const cached = sharedBotDbCache?.get(botId) ?? localBotDbCache.get(botId);
  if (cached) {
    if (cached.expiresAt < now && !cached.refreshing) {
      cached.refreshing = true;
      refreshBotCache(supabaseAdmin, botId, sharedBotDbCache).catch(() => {
        cached.refreshing = false;
      });
    }
    return cached;
  }
  return refreshBotCache(supabaseAdmin, botId, sharedBotDbCache);
}

async function resolveOrCreateLead(
  supabaseAdmin: any,
  bot: BotCacheItem,
  from: { id: number; username?: string; first_name?: string },
): Promise<string | null> {
  const leadKey = `${bot.id}:${from.id}`;
  const cached = leadCache.get(leadKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.id;
  }

  try {
    const { data: existing } = await supabaseAdmin
      .from("leads")
      .select("id,status")
      .eq("bot_id", bot.id)
      .eq("telegram_id", from.id)
      .maybeSingle();

    let leadId: string | null = existing?.id ?? null;
    if (!leadId) {
      const { data: created } = await supabaseAdmin
        .from("leads")
        .insert({
          user_id: bot.user_id,
          bot_id: bot.id,
          telegram_id: from.id,
          telegram_username: from.username ?? null,
          name: from.first_name ?? null,
          status: "new",
        })
        .select("id")
        .maybeSingle();
      leadId = created?.id ?? null;
    } else if (existing?.status === "new") {
      supabaseAdmin
        .from("leads")
        .update({ status: "engaged" })
        .eq("id", leadId)
        .then(
          () => undefined,
          () => undefined,
        );
    }

    if (leadId) {
      leadCache.set(leadKey, { id: leadId, expiresAt: Date.now() + LEAD_CACHE_TTL_MS });
    }
    return leadId;
  } catch (e) {
    console.warn("[lead-upsert-warn]", e);
    return cached?.id ?? null;
  }
}

async function recordInboundLeadMessage(
  supabaseAdmin: any,
  bot: BotCacheItem,
  leadId: string | null,
  message: NonNullable<TelegramUpdate["message"]>,
  fromUser: { id: number; username?: string | undefined; first_name?: string | undefined },
) {
  try {
    let realLeadId = leadId && !leadId.startsWith("lead-") ? leadId : null;
    if (!realLeadId) {
      realLeadId = await resolveOrCreateLead(supabaseAdmin, bot, fromUser);
    }

    const rawText = (message.text ?? message.caption ?? "").trim();
    let kind = "text";
    let fileId: string | null = null;
    let fileName: string | null = null;
    let body = rawText;

    if (message.photo && message.photo.length > 0) {
      kind = "photo";
      fileId = message.photo[message.photo.length - 1]?.file_id ?? null;
      body = rawText || "📷 Foto enviada pelo cliente";
    } else if (message.video) {
      kind = "video";
      fileId = message.video.file_id ?? null;
      fileName = message.video.file_name ?? null;
      body = rawText || "🎬 Vídeo enviado pelo cliente";
    } else if (message.voice || message.audio) {
      kind = "audio";
      fileId = message.voice?.file_id ?? message.audio?.file_id ?? null;
      fileName = message.audio?.file_name ?? null;
      body = rawText || "🎤 Áudio enviado pelo cliente";
    } else if (message.document) {
      kind = "document";
      fileId = message.document.file_id ?? null;
      fileName = message.document.file_name ?? null;
      body = rawText || "📎 Documento enviado pelo cliente";
    }

    if (!body && !fileId) return;

    const nowIso = new Date().toISOString();
    const preview = (body || "Mídia recebida").slice(0, 160);
    const { appendLeadChatMemory } = await import("@/lib/telegram.server");

    const chatMsg = {
      id: `in-${message.message_id ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      direction: "in" as const,
      kind,
      body: body || "",
      file_id: fileId,
      file_name: fileName,
      telegram_message_id: message.message_id ?? null,
      created_at: nowIso,
    };

    appendLeadChatMemory([realLeadId, fromUser.id, `${bot.id}:${fromUser.id}`], chatMsg);

    if (!realLeadId || realLeadId.startsWith("lead-")) return;

    const { data: existingConv } = await supabaseAdmin
      .from("conversations")
      .select("id,unread_count")
      .eq("lead_id", realLeadId)
      .maybeSingle();

    let convId: string | null = existingConv?.id ?? null;
    if (convId) {
      await supabaseAdmin
        .from("conversations")
        .update({
          bot_id: bot.id,
          status: "open",
          last_message_at: nowIso,
          last_inbound_at: nowIso,
          last_message_preview: preview,
          unread_count: (existingConv?.unread_count ?? 0) + 1,
        })
        .eq("id", convId);
    } else {
      const { data: createdConv } = await supabaseAdmin
        .from("conversations")
        .insert({
          user_id: bot.user_id,
          bot_id: bot.id,
          lead_id: realLeadId,
          status: "open",
          last_message_at: nowIso,
          last_inbound_at: nowIso,
          last_message_preview: preview,
          unread_count: 1,
        })
        .select("id")
        .maybeSingle();
      convId = createdConv?.id ?? null;
    }

    await Promise.allSettled([
      supabaseAdmin.from("activity_logs").insert({
        user_id: bot.user_id,
        entity: "lead_chat_msg",
        entity_id: realLeadId,
        action: "in",
        metadata: chatMsg as never,
      }),
      convId
        ? supabaseAdmin.from("messages").insert({
            conversation_id: convId,
            user_id: bot.user_id,
            direction: "in",
            kind,
            body: body || null,
            file_id: fileId,
            file_name: fileName,
            telegram_message_id: message.message_id ?? null,
          })
        : Promise.resolve(),
    ]);
  } catch (err) {
    console.warn("[recordInboundLeadMessage-warn]", err);
  }
}

function formatCallbackActionLabel(data: string): string {
  if (data === "lang:pt") return "🇧🇷 Clicou no botão: Português";
  if (data === "lang:en") return "🇺🇸 Clicou no botão: English";
  if (data.startsWith("curr:")) return `💱 Selecionou moeda: ${data.slice(5)}`;
  if (data === "view_plans" || data === "nav:plans") return "📋 Clicou em: Ver Planos";
  if (data === "nav:lang") return "🌐 Clicou em: Alterar Idioma";
  if (data === "nav:curr") return "💱 Clicou em: Alterar Moeda";
  if (data.startsWith("pix_plan:")) return "💠 Selecionou plano no bot (gerando PIX)";
  if (data.startsWith("intl_plan:")) return "💳 Selecionou plano internacional (Stripe)";
  if (data.startsWith("copy_pix:")) return "📋 Clicou em: Copiar Código PIX";
  if (data.startsWith("check_payment:")) return "✅ Clicou em: Já Paguei";
  if (data.startsWith("downsell_pay:")) return "🔥 Clicou na oferta de Downsell";
  if (data.startsWith("rmk_pix:")) return "🎁 Clicou na oferta promocional";
  if (data === "view_preview") return "👀 Clicou em: Ver Prévia";
  if (data === "decline_upsell") return "🙅 Clicou em: Não quero (Upsell)";
  if (data.startsWith("offer:")) return "✨ Clicou em oferta adicional";
  return `🔘 Clicou no botão: ${data.slice(0, 60)}`;
}

function logCallbackChatActionBg(
  supabaseAdmin: any,
  bot: BotCacheItem,
  leadId: string | null,
  fromUser: { id: number; username?: string | undefined; first_name?: string | undefined },
  cbData: string,
) {
  if (!cbData) return;
  const label = formatCallbackActionLabel(cbData);
  const nowIso = new Date().toISOString();
  const chatMsg = {
    id: `cb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    direction: "in" as const,
    kind: "callback",
    body: label,
    file_id: null,
    file_name: null,
    telegram_message_id: null,
    created_at: nowIso,
  };

  import("@/lib/telegram.server")
    .then(async ({ appendLeadChatMemory }) => {
      const realLeadId =
        leadId && !leadId.startsWith("lead-")
          ? leadId
          : await resolveOrCreateLead(supabaseAdmin, bot, fromUser);
      appendLeadChatMemory([realLeadId, fromUser.id, `${bot.id}:${fromUser.id}`], chatMsg);
      if (realLeadId && !realLeadId.startsWith("lead-")) {
        await supabaseAdmin.from("activity_logs").insert({
          user_id: bot.user_id,
          entity: "lead_chat_msg",
          entity_id: realLeadId,
          action: "in",
          metadata: chatMsg as never,
        });
      }
    })
    .catch(() => undefined);
}

export const Route = createFileRoute("/api/public/telegram/$botId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        // Nunca responder != 200 depois de aceitar o update: o Telegram
        // reenvia em loop e o fluxo roda duplicado.
        try {
          // Etapa 1: Carrega módulos e faz parsing do payload em paralelo
          const [{ supabaseAdmin }, telegramMod, update] = await Promise.all([
            import("@/integrations/supabase/client.server"),
            import("@/lib/telegram.server"),
            request.json() as Promise<TelegramUpdate>,
          ]);

          const {
            botDbCache: sharedBotDbCache,
            botConfigCache,
            setCachedBotConfig,
            decodeWebhookFlowSnapshot,
            getCachedBotConfig,
            getCachedPixCode,
            handleTelegramStart,
            handleLanguageSelect,
            handleCurrencySelect,
            handleViewPlans,
            sendBrlPlansMenu,
            sendIntlPlansMenu,
            handleInternationalPlanPurchase,
            handlePixPlanPurchase,
            handleSettingsMenu,
            getLeadPreferences,
            runFlowForLead,
            sendOfferCharge,
            sendMessage,
            sendPhoto,
            sendVideo,
            deleteMessage,
            sendChatAction,
            editMessageReplyMarkup,
          } = telegramMod;

          // Etapa 2: Lookup instantâneo (0ms) via query params auto-contidos da URL do webhook ou fallback em cache/DB
          const reqUrl = new URL(request.url, "https://telabot-studio.vercel.app");
          const qToken = reqUrl.searchParams.get("t")?.trim() || "";
          const qUserId = reqUrl.searchParams.get("u")?.trim() || "";
          const qSecret = reqUrl.searchParams.get("s");
          const qConfig = reqUrl.searchParams.get("c")?.trim() || "";

          if (qConfig && !botConfigCache.has(params.botId)) {
            const decodedCfg = decodeWebhookFlowSnapshot(qConfig);
            if (decodedCfg) {
              const { normalizeAdvancedConfig } = await import("@/lib/flow-advanced");
              const normalizedSnapshot = normalizeAdvancedConfig(decodedCfg);
              setCachedBotConfig(
                params.botId,
                { id: params.botId, is_active: true, simple_config: normalizedSnapshot },
                normalizedSnapshot,
              );
            }
          }

          let bot: BotCacheItem | null = null;
          if (qToken) {
            bot = primeBotDbCache({
              id: params.botId,
              user_id: qUserId,
              token: qToken,
              status: "active",
              webhook_secret: qSecret,
            });
            sharedBotDbCache.set(params.botId, bot);
            if (!botConfigCache.has(params.botId)) {
              await getCachedBotConfig(params.botId).catch(() => null);
            }
          } else {
            const [resolvedBot] = await Promise.all([
              resolveCachedBot(supabaseAdmin, params.botId, sharedBotDbCache),
              getCachedBotConfig(params.botId).catch(() => null),
            ]);
            bot = resolvedBot;
          }

          if (!bot) return new Response("Not found", { status: 404 });

          const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
          if (bot.webhook_secret && secret && secret !== bot.webhook_secret && !qToken) {
            return new Response("Unauthorized", { status: 401 });
          }

          if (update.update_id && isDuplicateUpdate(update.update_id)) {
            return Response.json({ ok: true, duplicate: true });
          }

          const cb = update.callback_query;
          const from = update.message?.from ?? cb?.from;
          const chatId = update.message?.chat?.id ?? cb?.message?.chat?.id;
          if (!from?.id || !chatId) return Response.json({ ok: true, ignored: true });

          const fromUser = {
            id: from.id,
            username: from.username,
            first_name: from.first_name,
          };

          // Dispara "digitando..." e remove loading do botão sem bloquear o fluxo
          sendChatAction(bot.token, chatId, "typing").catch(() => undefined);
          if (cb?.id) {
            fetch(`https://api.telegram.org/bot${bot.token}/answerCallbackQuery`, {
              method: "POST",
              headers: { "content-type": "application/json", Connection: "keep-alive" },
              body: JSON.stringify({ callback_query_id: cb.id }),
            }).catch(() => undefined);
          }

          const msgText = (update.message?.text ?? "").trim();
          const msgLower = msgText.toLowerCase();
          const leadKey = `${bot.id}:${from.id}`;

          // PRIORIDADE MÁXIMA NÃO-BLOQUEANTE: Mensagem /start ou start (< 1s)
          if (msgLower.startsWith("/start") || msgLower === "start") {
            const fallbackLeadId = leadCache.get(leadKey)?.id ?? `lead-${from.id}`;

            resolveOrCreateLead(supabaseAdmin, bot, fromUser)
              .then((realId) => {
                if (realId && update.message) {
                  return recordInboundLeadMessage(supabaseAdmin, bot, realId, update.message, fromUser);
                }
                return undefined;
              })
              .catch(() => undefined);

            await handleTelegramStart({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId: fallbackLeadId,
              chatId,
            });

            import("@/lib/downsell.server")
              .then(({ scheduleStartDownsells, processScheduledDownsells }) =>
                scheduleStartDownsells({
                  userId: bot.user_id,
                  botId: bot.id,
                  leadId: leadCache.get(leadKey)?.id ?? fallbackLeadId,
                  chatId,
                }).then(() => processScheduledDownsells()),
              )
              .catch((e) => console.warn("[downsell-start-schedule-bg]", e));

            return Response.json({ ok: true });
          }

          const data = cb?.data ?? "";
          const cbMessageId = cb?.message?.message_id;

          // Callbacks instantâneos: nunca bloqueiam na query de leads se o cache ainda não aqueceu
          const isFastCallback =
            data === "lang:pt" ||
            data === "lang:en" ||
            data === "curr:BRL" ||
            data === "curr:USD" ||
            data === "curr:EUR" ||
            data === "curr:GBP" ||
            data.startsWith("nav:") ||
            data.startsWith("copy_pix:");

          let leadId = leadCache.get(leadKey)?.id ?? null;

          if (!leadId) {
            if (isFastCallback) {
              leadId = `lead-${from.id}`;
              resolveOrCreateLead(supabaseAdmin, bot, fromUser).catch(() => undefined);
            } else {
              leadId = (await resolveOrCreateLead(supabaseAdmin, bot, fromUser)) ?? `lead-${from.id}`;
            }
          }

          // Trigger oportunístico em background de downsells vencidos
          import("@/lib/downsell.server")
            .then(({ processScheduledDownsells }) => processScheduledDownsells())
            .catch(() => undefined);

          if (data) {
            logCallbackChatActionBg(supabaseAdmin, bot, leadId, fromUser, data);
          }

          // Botão fallback de cópia do Código PIX enviado isoladamente
          if (data.startsWith("copy_pix:")) {
            const chargeId = data.slice(9);
            let pixCode = getCachedPixCode(chargeId);
            if (!pixCode) {
              try {
                const { data: paymentRow } = await supabaseAdmin
                  .from("payments")
                  .select("pix_code")
                  .eq("id", chargeId)
                  .maybeSingle();
                pixCode = paymentRow?.pix_code ?? null;
              } catch {
                pixCode = null;
              }
            }

            if (pixCode) {
              await sendMessage(bot.token, chatId, `<code>${pixCode}</code>`);
            } else {
              await sendMessage(
                bot.token,
                chatId,
                "Não foi possível localizar o código PIX desta cobrança. Selecione o plano novamente.",
              );
            }
            return Response.json({ ok: true });
          }

          // 1. Seleção de Idioma (🇧🇷 Português / 🇺🇸 English)
          if (data === "lang:pt" || data === "lang:en") {
            await handleLanguageSelect({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId,
              chatId,
              messageId: cbMessageId,
              language: data === "lang:pt" ? "pt" : "en",
            });
            return Response.json({ ok: true });
          }

          // 2. Seleção de Moeda (BRL, USD, EUR, GBP)
          if (data === "curr:BRL" || data === "curr:USD" || data === "curr:EUR" || data === "curr:GBP") {
            const currency = data.slice(5) as "BRL" | "USD" | "EUR" | "GBP";
            await handleCurrencySelect({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId,
              chatId,
              messageId: cbMessageId,
              currency,
            });
            return Response.json({ ok: true });
          }

          // 2.1 Botão CTA "Ver Planos" / "View Plans"
          if (data === "view_plans") {
            await handleViewPlans({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId,
              chatId,
              messageId: cbMessageId,
            });
            return Response.json({ ok: true });
          }

          // 3. Seleção de Plano Internacional (Stripe Checkout Nativo)
          if (data.startsWith("intl_plan:")) {
            const [, planId, currency] = data.split(":");
            await handleInternationalPlanPurchase({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId,
              chatId,
              planId,
              currency: (currency as "USD" | "EUR" | "GBP") || "USD",
            });
            return Response.json({ ok: true });
          }

          // 4. Seleção de Plano Brasileiro via PIX
          if (data.startsWith("pix_plan:")) {
            const planId = data.slice(9);
            await handlePixPlanPurchase({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId,
              chatId,
              planId,
            });
            return Response.json({ ok: true });
          }

          // 5. Botões de Navegação
          if (data === "nav:lang") {
            await sendMessage(
              bot.token,
              chatId,
              "Escolha seu idioma de preferência / Choose your preferred language:",
              {
                inline_keyboard: [
                  [
                    { text: "🇧🇷 Português", callback_data: "lang:pt" },
                    { text: "🇺🇸 English", callback_data: "lang:en" },
                  ],
                ],
              },
            );
            return Response.json({ ok: true });
          }

          if (data === "nav:curr") {
            const currencyMarkup = {
              inline_keyboard: [
                [
                  { text: "💵 USD ($)", callback_data: "curr:USD" },
                  { text: "💶 EUR (€)", callback_data: "curr:EUR" },
                  { text: "💷 GBP (£)", callback_data: "curr:GBP" },
                ],
              ],
            };
            if (cbMessageId) {
              await editMessageReplyMarkup(bot.token, chatId, cbMessageId, currencyMarkup);
              return Response.json({ ok: true });
            }
            const { cfg } = await getCachedBotConfig(bot.id);
            const textEn =
              cfg.welcome?.messageEn ||
              "Hello! Welcome to our VIP service. 👋\n\nPlease choose your preferred currency below to view our exclusive plans:";
            await sendMessage(bot.token, chatId, textEn, currencyMarkup);
            return Response.json({ ok: true });
          }

          if (data === "nav:plans") {
            const [{ cfg }, prefs] = await Promise.all([
              getCachedBotConfig(bot.id),
              getLeadPreferences(leadId),
            ]);
            if (prefs.language === "en" && prefs.currency && prefs.currency !== "BRL") {
              await sendIntlPlansMenu(
                { userId: bot.user_id, botId: bot.id, token: bot.token, leadId, chatId },
                cfg,
                prefs.currency,
                false,
              );
            } else {
              await sendBrlPlansMenu(
                { userId: bot.user_id, botId: bot.id, token: bot.token, leadId, chatId },
                cfg,
                false,
              );
            }
            return Response.json({ ok: true });
          }

          // 6. Confirmação manual de pagamento PIX
          if (data.startsWith("check_payment:")) {
            const paymentId = data.slice(14);
            const { approvePayment } = await import("@/lib/finance.server");
            await approvePayment(paymentId);
            return Response.json({ ok: true });
          }

          // 6.1 Compra de Downsell via Botão Inline
          if (data.startsWith("downsell_pay:")) {
            const parts = data.slice(13).split(":");
            const seqId = parts[0];
            const planId = parts[1];
            const { handleDownsellPurchase } = await import("@/lib/downsell.server");
            await handleDownsellPurchase({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId,
              chatId,
              seqId,
              planId,
            });
            return Response.json({ ok: true });
          }

          // 6.2 Oferta PIX promocional enviada via Disparo/Campanha de Remarketing
          if (data.startsWith("rmk_pix:")) {
            const rawPayload = data.slice(8);
            const sepIdx = rawPayload.indexOf(":");
            const rawCents = sepIdx >= 0 ? rawPayload.slice(0, sepIdx) : rawPayload;
            const rawTitle = sepIdx >= 0 ? rawPayload.slice(sepIdx + 1) : "Oferta Especial VIP";
            const amountCents = Math.max(100, Number.parseInt(rawCents || "1990", 10) || 1990);
            const offerTitle = (rawTitle || "Oferta Especial VIP").trim();

            try {
              const [{ createPixCharge }, { sendPixPaymentMessages }] = await Promise.all([
                import("@/lib/finance.server"),
                import("@/lib/telegram.server"),
              ]);

              const charge = await createPixCharge({
                userId: bot.user_id,
                botId: bot.id,
                leadId,
                amountCents,
                description: offerTitle,
                productName: offerTitle,
              });

              await sendPixPaymentMessages({
                token: bot.token,
                chatId,
                chargeId: charge.id,
                title: offerTitle,
                priceFormatted: (amountCents / 100).toFixed(2).replace(".", ","),
                pixCode: charge.pix_code,
                showBackToPlans: true,
              });
            } catch (rmkErr) {
              console.error("[telegram-webhook-rmk-pix-error]", rmkErr);
              await sendMessage(
                bot.token,
                chatId,
                "❌ Não foi possível gerar o PIX promocional agora. Tente novamente em instantes ou clique em <b>Ver Planos</b>.",
              );
            }
            return Response.json({ ok: true });
          }

          // 7.1 Prévia temporária com auto-exclusão
          if (data === "view_preview") {
            try {
              const { cfg } = await getCachedBotConfig(bot.id);
              const previews = (cfg as unknown as Record<string, any>)["previews"] as
                | {
                    enabled?: boolean;
                    deleteSeconds?: number;
                    conversionCopy?: string;
                    media?: Array<{ kind?: string; url?: string; fileId?: string }>;
                  }
                | undefined;
              const delSec = Math.min(60, Math.max(5, Number(previews?.deleteSeconds) || 15));
              const firstMedia = previews?.media?.[0];
              const mediaTarget = firstMedia?.fileId || firstMedia?.url || "";
              let previewMsgId: number | undefined;

              if (mediaTarget) {
                const mediaRes =
                  firstMedia?.kind === "video"
                    ? await sendVideo(bot.token, chatId, mediaTarget, `👀 Prévia exclusiva (expira em ${delSec}s)`)
                    : await sendPhoto(bot.token, chatId, mediaTarget, `👀 Prévia exclusiva (expira em ${delSec}s)`);
                previewMsgId = mediaRes.result?.message_id;
              } else {
                const txtRes = await sendMessage(
                  bot.token,
                  chatId,
                  `👀 Prévia exclusiva disponível por ${delSec}s!`,
                );
                previewMsgId = txtRes.result?.message_id;
              }

              if (previewMsgId) {
                setTimeout(() => {
                  deleteMessage(bot.token, chatId, previewMsgId!).catch(() => undefined);
                }, delSec * 1000);
              }

              const conversionCopy =
                previews?.conversionCopy?.trim() ||
                "⏳ Aproveite antes que a oferta saia do ar! Clique abaixo para escolher seu plano VIP:";
              await sendMessage(bot.token, chatId, conversionCopy, {
                inline_keyboard: [[{ text: "📋 Ver Planos", callback_data: "nav:plans" }]],
              });
            } catch (prevErr) {
              console.warn("[view_preview-warn]", prevErr);
            }
            return Response.json({ ok: true });
          }

          // 7.2 Recusa opcional de Upsell / Order Bump ("Não quero")
          if (data === "decline_upsell") {
            if (cbMessageId) {
              editMessageReplyMarkup(bot.token, chatId, cbMessageId, { inline_keyboard: [] }).catch(
                () => undefined,
              );
            }
            await sendMessage(
              bot.token,
              chatId,
              "✅ Tudo certo! Seu acesso principal continua normalmente liberado.",
            );
            return Response.json({ ok: true });
          }

          // 7. Ofertas / Bump / Upsell
          if (data.startsWith("offer:")) {
            await sendOfferCharge({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId,
              chatId,
              offerId: data.slice(6),
            });
            return Response.json({ ok: true });
          }

          // 8.1 Menu Secundário de Configurações (/config, /idioma, /settings)
          if (
            msgText.startsWith("/config") ||
            msgText.startsWith("/idioma") ||
            msgText.startsWith("/settings")
          ) {
            await handleSettingsMenu({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId,
              chatId,
            });
            return Response.json({ ok: true });
          }

          // 9. Retomada de etapas do canvas visual
          let resumeFromStepId: string | undefined;
          let resumeHandle: string | undefined;
          if (data.startsWith("step:")) {
            resumeFromStepId = data.slice(5);
          } else if (data.startsWith("menu:")) {
            const parts = data.split(":");
            resumeFromStepId = parts[1];
            resumeHandle = parts.slice(2).join(":");

            if (resumeHandle && resumeHandle.startsWith("plan-")) {
              const planId = resumeHandle.slice(5);
              await handlePixPlanPurchase({
                userId: bot.user_id,
                botId: bot.id,
                token: bot.token,
                leadId,
                chatId,
                planId,
              });
              return Response.json({ ok: true });
            }
          }

          if (!cb && update.message) {
            await recordInboundLeadMessage(supabaseAdmin, bot, leadId, update.message, fromUser);
            return Response.json({ ok: true, chatLogged: true });
          }

          await runFlowForLead({
            userId: bot.user_id,
            botId: bot.id,
            token: bot.token,
            leadId,
            chatId,
            resumeFromStepId,
            resumeHandle,
          });

          return Response.json({ ok: true });
        } catch (error) {
          console.error("[telegram-webhook]", error);
          return Response.json({ ok: true, error: String(error) });
        }
      },
    },
  },
});
