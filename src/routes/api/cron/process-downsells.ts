import { createFileRoute } from "@tanstack/react-router";

/**
 * Worker periódico de processamento de Downsells:
 * Busca agendamentos pendentes com scheduled_for <= NOW(),
 * verifica se o lead já pagou (se sim, cancela),
 * respeita o idioma do lead e dispara as mensagens/mídias/botões de downsell.
 */
export const Route = createFileRoute("/api/cron/process-downsells")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { processScheduledDownsells } = await import("@/lib/downsell.server");
        const stats = await processScheduledDownsells();
        return Response.json({
          ok: true,
          worker: "process-downsells",
          timestamp: new Date().toISOString(),
          stats,
        });
      },
      POST: async ({ request }) => {
        const { processScheduledDownsells } = await import("@/lib/downsell.server");
        const stats = await processScheduledDownsells();
        return Response.json({
          ok: true,
          worker: "process-downsells",
          timestamp: new Date().toISOString(),
          stats,
        });
      },
    },
  },
});
