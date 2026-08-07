import { createFileRoute } from "@tanstack/react-router";

/**
 * Redirecionador público: registra o clique (dispositivo, origem, IP) e
 * envia o visitante ao destino configurado.
 */
function detectDevice(ua: string): string {
  const value = ua.toLowerCase();
  if (/ipad|tablet/.test(value)) return "tablet";
  if (/mobi|android|iphone/.test(value)) return "mobile";
  if (!value) return "desconhecido";
  return "desktop";
}

export const Route = createFileRoute("/api/public/r/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: link } = await supabaseAdmin
          .from("redirect_links")
          .select("id,user_id,destination,is_active,clicks_total")
          .eq("slug", params.slug)
          .maybeSingle();

        if (!link || !link.is_active || !link.destination) {
          return new Response("Link não encontrado", { status: 404 });
        }

        const userAgent = request.headers.get("user-agent") ?? "";
        const ip =
          request.headers.get("cf-connecting-ip") ??
          (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ??
          null;

        await supabaseAdmin.from("redirect_clicks").insert({
          link_id: link.id,
          user_id: link.user_id,
          referrer: request.headers.get("referer"),
          device: detectDevice(userAgent),
          user_agent: userAgent.slice(0, 400),
          ip_address: ip,
        });

        await supabaseAdmin
          .from("redirect_links")
          .update({
            clicks_total: (link.clicks_total ?? 0) + 1,
            last_click_at: new Date().toISOString(),
          })
          .eq("id", link.id);

        return new Response(null, { status: 302, headers: { location: link.destination } });
      },
    },
  },
});
