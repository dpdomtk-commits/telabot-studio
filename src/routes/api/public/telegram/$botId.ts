import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/$botId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
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
            message?: { chat?: { id?: number } };
            from?: { id?: number; username?: string; first_name?: string };
          };
        };

        const source = update.message ?? update.callback_query?.message ? update.message : undefined;
        const from = update.message?.from ?? update.callback_query?.from;
        const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
        if (!from?.id || !chatId) return Response.json({ ok: true, ignored: true });

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

        void source;

        await runFlowForLead({
          userId: bot.user_id,
          botId: bot.id,
          token: bot.token,
          leadId,
          chatId,
        });

        return Response.json({ ok: true });
      },
    },
  },
});
