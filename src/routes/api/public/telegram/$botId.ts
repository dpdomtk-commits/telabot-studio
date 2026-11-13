import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/$botId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        // Nunca responder != 200 depois de aceitar o update: o Telegram
        // reenvia em loop e o fluxo roda duplicado.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runFlowForLead } = await import("@/lib/telegram.server");

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

          const cb = update.callback_query;
          const from = update.message?.from ?? cb?.from;
          const chatId = update.message?.chat?.id ?? cb?.message?.chat?.id;
          if (!from?.id || !chatId) return Response.json({ ok: true, ignored: true });

          // Encerra o "loading" do botão imediatamente.
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

          // Clique em botão/menu retoma o fluxo a partir daquela etapa.
          let resumeFromStepId: string | undefined;
          let resumeHandle: string | undefined;
          const data = cb?.data ?? "";
          if (data.startsWith("offer:")) {
            const { sendOfferCharge } = await import("@/lib/telegram.server");
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
          if (data.startsWith("step:")) {
            resumeFromStepId = data.slice(5);
          } else if (data.startsWith("menu:")) {
            const parts = data.split(":");
            resumeFromStepId = parts[1];
            resumeHandle = parts.slice(2).join(":");
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
