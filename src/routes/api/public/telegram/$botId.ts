import { createFileRoute } from "@tanstack/react-router";

// Cache em memória de update_id para evitar reenvio em duplicidade pelo Telegram
const processedUpdates = new Map<number, number>();
function isDuplicateUpdate(updateId?: number): boolean {
  if (!updateId) return false;
  const now = Date.now();
  // Limpa updates mais antigos que 60 segundos
  for (const [id, time] of processedUpdates.entries()) {
    if (now - time > 60000) processedUpdates.delete(id);
  }
  if (processedUpdates.has(updateId)) return true;
  processedUpdates.set(updateId, now);
  return false;
}

// Cache em memória do bot para evitar consultas repetidas ao banco a cada update
interface BotCacheItem {
  id: string;
  user_id: string;
  token: string;
  status: string;
  webhook_secret: string | null;
  expiresAt: number;
}
const botDbCache = new Map<string, BotCacheItem>();

export const Route = createFileRoute("/api/public/telegram/$botId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        // Nunca responder != 200 depois de aceitar o update: o Telegram
        // reenvia em loop e o fluxo roda duplicado.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const {
            handleTelegramStart,
            handleLanguageSelect,
            handleCurrencySelect,
            sendCurrencySelectionMenu,
            sendBrlPlansMenu,
            sendIntlPlansMenu,
            handleInternationalPlanPurchase,
            handlePixPlanPurchase,
            handleSettingsMenu,
            getLeadPreferences,
            runFlowForLead,
            deliverForPayment,
            sendOfferCharge,
            sendMessage,
          } = await import("@/lib/telegram.server");

          // 1. Resolução ultrarrápida do bot via cache em memória (60s TTL)
          const now = Date.now();
          let bot = botDbCache.get(params.botId);
          if (!bot || bot.expiresAt < now) {
            const { data: dbBot } = await supabaseAdmin
              .from("bots")
              .select("id,user_id,token,status,webhook_secret")
              .eq("id", params.botId)
              .maybeSingle();

            if (!dbBot) return new Response("Not found", { status: 404 });
            bot = { ...dbBot, expiresAt: now + 60000 };
            botDbCache.set(params.botId, bot);
          }

          const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
          if (secret !== bot.webhook_secret) return new Response("Unauthorized", { status: 401 });
          if (bot.status !== "active") return Response.json({ ok: true, ignored: true });

          const update = (await request.json()) as {
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

          // Evita processamento duplicado do mesmo update enviado pelo Telegram
          if (update.update_id && isDuplicateUpdate(update.update_id)) {
            return Response.json({ ok: true, duplicate: true });
          }

          const cb = update.callback_query;
          const from = update.message?.from ?? cb?.from;
          const chatId = update.message?.chat?.id ?? cb?.message?.chat?.id;
          if (!from?.id || !chatId) return Response.json({ ok: true, ignored: true });

          // Encerra o "loading" do botão imediatamente (sem aguardar)
          if (cb?.id) {
            fetch(`https://api.telegram.org/bot${bot.token}/answerCallbackQuery`, {
              method: "POST",
              headers: { "content-type": "application/json", Connection: "keep-alive" },
              body: JSON.stringify({ callback_query_id: cb.id }),
            }).catch(() => undefined);
          }

          const msgText = (update.message?.text ?? "").trim();

          // PRIORIDADE MÁXIMA NÃO-BLOQUEANTE: Mensagem /start
          // Dispara a apresentação/mídias imediatamente em menos de 1 segundo
          // enquanto o upsert do lead roda em background
          if (msgText.startsWith("/start")) {
            // Upsert assíncrono em background sem atrasar a resposta
            const leadUpsertPromise = (async () => {
              try {
                const { data: existing } = await supabaseAdmin
                  .from("leads")
                  .select("id")
                  .eq("bot_id", bot.id)
                  .eq("telegram_id", from.id)
                  .maybeSingle();

                if (!existing) {
                  await supabaseAdmin.from("leads").insert({
                    user_id: bot.user_id,
                    bot_id: bot.id,
                    telegram_id: from.id,
                    telegram_username: from.username ?? null,
                    name: from.first_name ?? null,
                    status: "new",
                  });
                }
              } catch (e) {
                console.warn("[start-lead-upsert-bg]", e);
              }
            })();

            // Disparo imediato do /start
            await handleTelegramStart({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId: `lead-${from.id}`,
              chatId,
            });

            // Aguarda o upsert terminar se necessário sem bloquear retorno
            leadUpsertPromise.catch(() => undefined);
            return Response.json({ ok: true });
          }

          // Para callbacks ou outras mensagens, garante leadId no banco
          const { data: existing } = await supabaseAdmin
            .from("leads")
            .select("id,status")
            .eq("bot_id", bot.id)
            .eq("telegram_id", from.id)
            .maybeSingle();

          let leadId = existing?.id ?? null;
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
            supabaseAdmin.from("leads").update({ status: "engaged" }).eq("id", leadId).then(() => undefined);
          }

          if (!leadId) return Response.json({ ok: true });

          const data = cb?.data ?? "";
          const cbMessageId = cb?.message?.message_id;

          // 1. Seleção de Idioma (🇧🇷 Português / 🇺🇸 English)
          if (data === "lang:pt") {
            await handleLanguageSelect({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId,
              chatId,
              messageId: cbMessageId,
              language: "pt",
            });
            return Response.json({ ok: true });
          }
          if (data === "lang:en") {
            await handleLanguageSelect({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId,
              chatId,
              messageId: cbMessageId,
              language: "en",
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
            const { handleViewPlans } = await import("@/lib/telegram.server");
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

          // 3. Seleção de Plano Internacional (Preparação Stripe)
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
              }
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
              const { editMessageReplyMarkup } = await import("@/lib/telegram.server");
              await editMessageReplyMarkup(bot.token, chatId, cbMessageId, currencyMarkup);
              return Response.json({ ok: true });
            }
            const { resolveBotFlow, sendCurrencySelectionMenu } = await import("@/lib/telegram.server");
            const flow = await resolveBotFlow(bot.id);
            const { normalizeAdvancedConfig } = await import("@/lib/flow-advanced");
            const cfg = normalizeAdvancedConfig(flow?.simple_config as any);
            await sendCurrencySelectionMenu({ userId: bot.user_id, botId: bot.id, token: bot.token, leadId, chatId }, cfg);
            return Response.json({ ok: true });
          }

          if (data === "nav:plans") {
            const { resolveBotFlow } = await import("@/lib/telegram.server");
            const flow = await resolveBotFlow(bot.id);
            const { normalizeAdvancedConfig } = await import("@/lib/flow-advanced");
            const cfg = normalizeAdvancedConfig(flow?.simple_config as any);
            const prefs = await getLeadPreferences(leadId);
            if (prefs.language === "en" && prefs.currency && prefs.currency !== "BRL") {
              await sendIntlPlansMenu({ userId: bot.user_id, botId: bot.id, token: bot.token, leadId, chatId }, cfg, prefs.currency, false);
            } else {
              await sendBrlPlansMenu({ userId: bot.user_id, botId: bot.id, token: bot.token, leadId, chatId }, cfg, false);
            }
            return Response.json({ ok: true });
          }

          // 6. Confirmação manual de pagamento PIX
          if (data.startsWith("check_payment:")) {
            const paymentId = data.slice(14);
            await supabaseAdmin
              .from("payments")
              .update({ status: "approved", approved_at: new Date().toISOString() })
              .eq("id", paymentId);
            await deliverForPayment(paymentId);
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

            // Se for um clique de plano no menu legado, direciona para o PIX imediatamente
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
