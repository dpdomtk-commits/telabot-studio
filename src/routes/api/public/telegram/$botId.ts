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

// Cache em memória do bot com TTL de 5 min e stale-while-revalidate
const BOT_CACHE_TTL_MS = 300_000;
const LEAD_CACHE_TTL_MS = 600_000;

interface BotCacheItem {
  id: string;
  user_id: string;
  token: string;
  status: string;
  webhook_secret: string | null;
  expiresAt: number;
  refreshing?: boolean;
}

const botDbCache = new Map<string, BotCacheItem>();
const leadCache = new Map<string, { id: string; expiresAt: number }>();

type TelegramUpdate = {
  update_id?: number;
  message?: {
    chat?: { id?: number };
    from?: { id?: number; username?: string; first_name?: string };
    text?: string;
  };
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number }; message_id?: number };
    from?: { id?: number; username?: string; first_name?: string };
  };
};

async function refreshBotCache(supabaseAdmin: any, botId: string): Promise<BotCacheItem | null> {
  const { data: dbBot } = await supabaseAdmin
    .from("bots")
    .select("id,user_id,token,status,webhook_secret")
    .eq("id", botId)
    .maybeSingle();

  if (!dbBot) return null;
  const item: BotCacheItem = {
    ...dbBot,
    expiresAt: Date.now() + BOT_CACHE_TTL_MS,
    refreshing: false,
  };
  botDbCache.set(botId, item);
  return item;
}

async function resolveCachedBot(supabaseAdmin: any, botId: string): Promise<BotCacheItem | null> {
  const now = Date.now();
  const cached = botDbCache.get(botId);
  if (cached) {
    if (cached.expiresAt < now && !cached.refreshing) {
      cached.refreshing = true;
      refreshBotCache(supabaseAdmin, botId).catch(() => {
        cached.refreshing = false;
      });
    }
    return cached;
  }
  return refreshBotCache(supabaseAdmin, botId);
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
            sendChatAction,
            editMessageReplyMarkup,
          } = telegramMod;

          // Etapa 2: Lookup do bot e aquecimento do fluxo configurável em paralelo
          const [bot] = await Promise.all([
            resolveCachedBot(supabaseAdmin, params.botId),
            getCachedBotConfig(params.botId).catch(() => null),
          ]);

          if (!bot) return new Response("Not found", { status: 404 });

          const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
          if (secret !== bot.webhook_secret) return new Response("Unauthorized", { status: 401 });
          if (bot.status !== "active") return Response.json({ ok: true, ignored: true });

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
          const leadKey = `${bot.id}:${from.id}`;

          // PRIORIDADE MÁXIMA NÃO-BLOQUEANTE: Mensagem /start (< 1s)
          if (msgText.startsWith("/start")) {
            const leadUpsertPromise = resolveOrCreateLead(supabaseAdmin, bot, fromUser);
            const fallbackLeadId = leadCache.get(leadKey)?.id ?? `lead-${from.id}`;

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

            leadUpsertPromise.catch(() => undefined);
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
