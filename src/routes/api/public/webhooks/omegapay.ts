import { createFileRoute } from "@tanstack/react-router";
import { approvePayment } from "@/lib/finance.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Webhook oficial da Omega Payments (OmegaPay).
 * Notificações em tempo real sobre pagamentos PIX recebidos.
 * Eventos monitorados: TRANSACTION_PAID, TRANSACTION_CREATED, etc.
 */

export const Route = createFileRoute("/api/public/webhooks/omegapay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          let body: any = {};
          try {
            body = JSON.parse(raw);
          } catch {
            return new Response("Invalid JSON", { status: 400 });
          }

          const event = body.event || "";
          const transaction = body.transaction || {};
          const status = (transaction.status || body.status || "").toUpperCase();
          const identifier = transaction.identifier || body.identifier || body.metadata?.orderId || "";
          const transactionId = transaction.id || body.transactionId || "";

          console.log("[omegapay-webhook-received]", { event, status, identifier, transactionId });

          // Idempotência básica para evitar reprocessamento
          if (transactionId) {
            try {
              await supabaseAdmin.from("webhook_events").insert({
                provider: "omegapay",
                event_id: `${transactionId}_${event || status}`,
                event_type: event || status,
                payload: body as never,
              });
            } catch {}
          }

          // Se a transação foi paga com sucesso
          const isPaid =
            event === "TRANSACTION_PAID" ||
            status === "COMPLETED" ||
            status === "OK" ||
            status === "PAID" ||
            Boolean(transaction.payedAt);

          if (isPaid) {
            let paymentId = identifier;

            // Se não temos o identifier direto, busca pelo external_id na tabela payments
            if (!paymentId && transactionId) {
              const { data: p } = await supabaseAdmin
                .from("payments")
                .select("id")
                .eq("external_id", transactionId)
                .maybeSingle();
              if (p?.id) paymentId = p.id;
            }

            if (paymentId) {
              const result = await approvePayment(paymentId);
              console.log("[omegapay-payment-approved]", { paymentId, result });

              // Cancela downsells pendentes associados
              try {
                const { cancelPendingDownsells } = await import("@/lib/downsell.server");
                await cancelPendingDownsells({ orderId: paymentId });
              } catch {}
            }
          }

          // A OmegaPay exige retorno HTTP 2XX para confirmar recebimento
          return Response.json({ ok: true, received: true });
        } catch (err: any) {
          console.error("[omegapay-webhook-error]", err);
          return Response.json({ ok: false, error: err?.message || "Internal error" }, { status: 500 });
        }
      },
    },
  },
});
