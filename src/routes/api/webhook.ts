import { createFileRoute } from "@tanstack/react-router";
import { getStripe } from "@/lib/stripe.server";

export const Route = createFileRoute("/api/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const stripe = getStripe();
        const payload = await request.text();
        const signature = request.headers.get("stripe-signature") || "";
        let event: any;

        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

        // Tenta verificar com a chave do ambiente se fornecida
        if (endpointSecret && endpointSecret !== "whsec_placeholder") {
          try {
            event = stripe.webhooks.constructEvent(payload, signature, endpointSecret);
          } catch (err: any) {
            console.warn("Ambiente webhook secret falhou, tentando fallback ou banco:", err.message);
          }
        }

        // Se ainda não decodificou o evento, tenta parsear o payload diretamente
        if (!event) {
          try {
            event = JSON.parse(payload);
          } catch {
            return new Response("Invalid JSON payload", { status: 400 });
          }
        }

        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object;
            console.log("Stripe Checkout completed:", session.id);

            // Verify terms of service acceptance
            if (session.consent?.terms_of_service === "accepted") {
              console.log("Customer accepted terms of service");
            }

            // Check promotional email consent
            if (session.consent?.promotions === "opt_in") {
              const email = session.customer_details?.email;
              console.log("Customer opted in for promotional emails:", email);
            }

            // Liberação automática do Telegram e confirmação do pagamento
            try {
              let paymentId = session.metadata?.payment_id;

              if (!paymentId && session.metadata?.lead_id) {
                const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
                const { data: p } = await supabaseAdmin
                  .from("payments")
                  .select("id")
                  .eq("lead_id", session.metadata.lead_id)
                  .eq("status", "pending")
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (p?.id) paymentId = p.id;
              }

              if (paymentId) {
                const { approvePayment } = await import("@/lib/finance.server");
                await approvePayment(paymentId);
                console.log("[stripe-payment-approved-successfully]", paymentId);
              } else {
                console.warn("[stripe-no-payment-id-found]", session.id, session.metadata);
              }
            } catch (fulfillErr) {
              console.error("[stripe-fulfill-error]", fulfillErr);
            }
            break;
          }
          default:
            console.log("Unhandled Stripe event type:", event.type);
        }

        return Response.json({ received: true });
      },
    },
  },
});
