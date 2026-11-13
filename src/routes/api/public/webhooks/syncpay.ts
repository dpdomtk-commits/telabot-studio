import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Webhook da SyncPay (cash-in).
 * Segurança: token secreto obrigatório (query `?token=` ou header Authorization),
 * idempotência por evento e proteção contra crédito duplicado no banco.
 */

const payloadSchema = z.object({
  data: z.object({
    id: z.string().min(6).max(120),
    status: z.string().min(2).max(40),
    amount: z.number().optional(),
    final_amount: z.number().optional(),
    end_to_end: z.string().max(120).optional().nullable(),
  }),
});

function statusFor(raw: string): "approved" | "refunded" | "failed" | "expired" | "pending" {
  const status = raw.toLowerCase();
  if (["completed", "paid", "approved", "success"].includes(status)) return "approved";
  if (["refunded", "chargeback", "med"].includes(status)) return "refunded";
  if (["failed", "cancelled", "canceled", "error"].includes(status)) return "failed";
  if (["expired"].includes(status)) return "expired";
  return "pending";
}

export const Route = createFileRoute("/api/public/webhooks/syncpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { syncpayWebhookTokenMatches } = await import("@/lib/payments/syncpay.server");

        const url = new URL(request.url);
        const headerToken = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        const token = url.searchParams.get("token") ?? headerToken;
        if (!syncpayWebhookTokenMatches(token)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const raw = await request.text();
        let parsed: z.infer<typeof payloadSchema>;
        try {
          parsed = payloadSchema.parse(JSON.parse(raw));
        } catch {
          return new Response("Invalid payload", { status: 422 });
        }

        const eventType = request.headers.get("event") ?? `cashin.${parsed.data.status}`;
        const mapped = statusFor(parsed.data.status);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotência: o mesmo evento nunca é processado duas vezes.
        const { error: dedupeError } = await supabaseAdmin.from("webhook_events").insert({
          provider: "syncpay",
          event_id: parsed.data.id,
          event_type: eventType,
          payload: JSON.parse(raw) as never,
        });
        if (dedupeError) {
          return Response.json({ ok: true, duplicate: true });
        }

        const { data: payment } = await supabaseAdmin
          .from("payments")
          .select("id,user_id,status")
          .eq("external_id", parsed.data.id)
          .maybeSingle();

        if (!payment) {
          await supabaseAdmin
            .from("webhook_events")
            .update({ processed_at: new Date().toISOString() })
            .eq("provider", "syncpay")
            .eq("event_id", parsed.data.id)
            .eq("event_type", eventType);
          return Response.json({ ok: true, ignored: "payment_not_found" });
        }

        const ip =
          (request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "")
            .split(",")[0]
            ?.trim() || null;

        if (mapped === "approved") {
          const { approvePayment } = await import("@/lib/finance.server");
          await approvePayment(payment.id, ip);
        } else if (mapped !== "pending" && payment.status !== "approved") {
          await supabaseAdmin.from("payments").update({ status: mapped }).eq("id", payment.id);
        }

        await supabaseAdmin
          .from("webhook_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("provider", "syncpay")
          .eq("event_id", parsed.data.id)
          .eq("event_type", eventType);

        // Processa downsells agendados em background
        import("@/lib/downsell.server").then(({ processScheduledDownsells }) => {
          processScheduledDownsells();
        }).catch(() => undefined);

        return Response.json({ ok: true, status: mapped });
      },
      GET: async () => {
        try {
          const { processScheduledDownsells } = await import("@/lib/downsell.server");
          const stats = await processScheduledDownsells();
          return Response.json({
            ok: true,
            provider: "syncpay",
            cron: "executed",
            timestamp: new Date().toISOString(),
            stats,
          });
        } catch (e: any) {
          console.warn("[syncpay-cron-error]", e);
          return Response.json({ ok: true, provider: "syncpay", error: e?.message });
        }
      },
    },
  },
});
