import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/push-subscribe")({
  server: {
    handlers: {
      GET: async () => {
        const { VAPID_PUBLIC_KEY } = await import("@/lib/webpush.server");
        return Response.json({ publicKey: VAPID_PUBLIC_KEY });
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            action?: string;
            botId?: string;
            flowId?: string;
            simpleConfig?: unknown;
            userId?: string;
            subscription?: unknown;
            test?: boolean;
          };

          if (body.action === "invalidate_bot_cache") {
            const [{ invalidateBotCache, setCachedBotConfig }, { normalizeAdvancedConfig }] =
              await Promise.all([
                import("@/lib/telegram.server"),
                import("@/lib/flow-advanced"),
              ]);
            if (body.botId) {
              invalidateBotCache(body.botId);
              if (body.simpleConfig) {
                const normalized = normalizeAdvancedConfig(body.simpleConfig);
                setCachedBotConfig(
                  body.botId,
                  { id: body.flowId || body.botId, is_active: true, simple_config: normalized },
                  normalized,
                );
              }
            }
            return Response.json({ ok: true });
          }

          if (!body.userId || !body.subscription) {
            return Response.json(
              { ok: false, error: "userId e subscription são obrigatórios." },
              { status: 400 },
            );
          }

          const { savePushSubscription, sendWebPushToUser } = await import("@/lib/webpush.server");
          const saved = await savePushSubscription(body.userId, body.subscription);

          if (saved && body.test) {
            await sendWebPushToUser(body.userId, {
              title: "🔔 Notificações Ativadas no iPhone!",
              body: "Você receberá alertas em tempo real de todos os pagamentos gerados e aprovados.",
              tag: "cashbot-push-test",
              url: "/app/payments",
            });
          }

          return Response.json({ ok: saved });
        } catch (err: any) {
          console.error("[push-subscribe-error]", err);
          return Response.json(
            { ok: false, error: err?.message || "Falha ao registrar assinatura Web Push" },
            { status: 500 },
          );
        }
      },
    },
  },
});
