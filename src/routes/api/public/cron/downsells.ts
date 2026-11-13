import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/downsells")({
  server: {
    handlers: {
      GET: async () => {
        const { processScheduledDownsells } = await import("@/lib/downsell.server");
        const stats = await processScheduledDownsells();
        return Response.json({
          ok: true,
          worker: "public-cron-downsells",
          timestamp: new Date().toISOString(),
          stats,
        });
      },
      POST: async () => {
        const { processScheduledDownsells } = await import("@/lib/downsell.server");
        const stats = await processScheduledDownsells();
        return Response.json({
          ok: true,
          worker: "public-cron-downsells",
          timestamp: new Date().toISOString(),
          stats,
        });
      },
    },
  },
});
