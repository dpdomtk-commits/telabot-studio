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
            getLeadPreferences,
            runFlowForLead,
            deliverForPayment,
            sendOfferCharge,
            sendMessage,
          } = await import("@/lib/telegram.server");

          const { data: bot } = await supabaseAdmin
            .from("bots")
            .select("id,user_id,token,status,webhook_secret")
            .eq("id", params.botId)
            .maybeSingle();

          if (!bot) return new Response("Not found", { status: 404 });

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
              message?: { chat?: { id?: number } };
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

          // Encerra o "loading" do botão imediatamente
          if (cb?.id) {
            await fetch(`https://api.telegram.org/bot${bot.token}/answerCallbackQuery`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ callback_query_id: cb.id }),
            }).catch(() => undefined);
          }

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
            await supabaseAdmin.from("leads").update({ status: "engaged" }).eq("id", leadId);
          }

          if (!leadId) return Response.json({ ok: true });

          const data = cb?.data ?? "";

          // 1. Seleção de Idioma (🇧🇷 Português / 🇺🇸 English)
          if (data === "lang:pt") {
            await handleLanguageSelect({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId,
              chatId,
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
              language: "en",
            });
            return Response.json({ ok: true });
          }

          // 2. Seleção de Moeda Internacional (USD, EUR, GBP)
          if (data === "curr:USD" || data === "curr:EUR" || data === "curr:GBP") {
            const currency = data.slice(5) as "USD" | "EUR" | "GBP";
            await handleCurrencySelect({
              userId: bot.user_id,
              botId: bot.id,
              token: bot.token,
              leadId,
              chatId,
              currency,
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
            const { resolveBotFlow } = await import("@/lib/telegram.server");
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

          // 8. Mensagem /start: inicia fluxo com mídias e apresentação
          const msgText = (update.message?.text ?? "").trim();
          if (msgText.startsWith("/start")) {
            await handleTelegramStart({
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
