import { createFileRoute } from "@tanstack/react-router";

function isAuthorizedCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET || process.env.VITE_CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token === cronSecret) return true;
  }

  const xSecret = request.headers.get("x-cron-secret");
  if (xSecret === cronSecret) return true;

  try {
    const url = new URL(request.url, "http://localhost");
    const queryKey = url.searchParams.get("key") || url.searchParams.get("secret");
    if (queryKey && queryKey === cronSecret) return true;
  } catch {
    // ignore
  }

  return false;
}

export const Route = createFileRoute("/api/public/cron/downsells")({
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
            worker: "public-cron-downsells",
            timestamp: new Date().toISOString(),
            stats,
          });
        } catch (error: any) {
          console.error("[public-cron-downsells-error]", error);
          return Response.json({ ok: false, error: error?.message || "Internal error" }, { status: 500 });
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
            worker: "public-cron-downsells",
            timestamp: new Date().toISOString(),
            stats,
          });
        } catch (error: any) {
          console.error("[public-cron-downsells-error]", error);
          return Response.json({ ok: false, error: error?.message || "Internal error" }, { status: 500 });
        }
      },
    },
  },
});
