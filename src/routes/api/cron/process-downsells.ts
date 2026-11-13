import { createFileRoute } from "@tanstack/react-router";

/**
 * Valida a autenticação do chamador do Cron / Worker.
 * Suporta:
 * 1. Header nativo da Vercel: Authorization: Bearer <CRON_SECRET>
 * 2. Header customizado: x-cron-secret: <CRON_SECRET>
 * 3. Query params para serviços gratuitos externos: ?key=<CRON_SECRET> ou ?secret=<CRON_SECRET>
 * Se CRON_SECRET não estiver configurado no ambiente, permite a chamada emitindo alerta.
 */
function isAuthorizedCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET || process.env.VITE_CRON_SECRET;
  if (!cronSecret) {
    // Failsafe: se o usuário ainda não adicionou CRON_SECRET no painel da Vercel,
    // não derruba a automação, mas recomenda a configuração no log.
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token === cronSecret) return true;
  }

  const xSecret = request.headers.get("x-cron-secret");
  if (xSecret && xSecret === cronSecret) return true;

  try {
    const url = new URL(request.url, "http://localhost");
    const queryKey = url.searchParams.get("key") || url.searchParams.get("secret");
    if (queryKey && queryKey === cronSecret) return true;
  } catch {
    // ignore
  }

  return false;
}

/**
 * Worker periódico de processamento de Downsells e Automações:
 * Busca agendamentos pendentes com scheduled_for <= NOW(),
 * verifica se o lead já pagou (se sim, cancela),
 * respeita o idioma do lead e dispara as mensagens/mídias/botões de downsell.
 */
export const Route = createFileRoute("/api/cron/process-downsells")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const { processScheduledDownsells } = await import("@/lib/downsell.server");
          const stats = await processScheduledDownsells();
          return Response.json({
            ok: true,
            worker: "process-downsells",
            timestamp: new Date().toISOString(),
            stats,
          });
        } catch (error: any) {
          console.error("[cron-process-downsells-error]", error);
          return Response.json({
            ok: false,
            error: error?.message || "Internal error",
          }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const { processScheduledDownsells } = await import("@/lib/downsell.server");
          const stats = await processScheduledDownsells();
          return Response.json({
            ok: true,
            worker: "process-downsells",
            timestamp: new Date().toISOString(),
            stats,
          });
        } catch (error: any) {
          console.error("[cron-process-downsells-error]", error);
          return Response.json({
            ok: false,
            error: error?.message || "Internal error",
          }, { status: 500 });
        }
      },
    },
  },
});
