import { createFileRoute } from "@tanstack/react-router";
import { getStripe } from "@/lib/stripe.server";

export const Route = createFileRoute("/api/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const stripe = getStripe();
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
        const payload = await request.text();
        let event: any;

        if (endpointSecret && endpointSecret !== "whsec_placeholder") {
          const signature = request.headers.get("stripe-signature") || "";
          try {
            event = stripe.webhooks.constructEvent(payload, signature, endpointSecret);
          } catch (err: any) {
            console.error("Webhook signature verification failed.", err.message);
            return new Response(`Webhook Error: ${err.message}`, { status: 400 });
          }
        } else {
          try {
            event = JSON.parse(payload);
          } catch {
            return new Response("Invalid JSON payload", { status: 400 });
          }
        }

        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object;
            console.log("Checkout completed:", session.id);

            // Verify terms of service acceptance
            if (session.consent?.terms_of_service === "accepted") {
              console.log("Customer accepted terms of service");
            }

            // Check promotional email consent (opt_in or opt_out)
            if (session.consent?.promotions === "opt_in") {
              const email = session.customer_details?.email;
              console.log("Customer opted in for promotional emails:", email);
              // Add email to your marketing list
            }

            // Fulfill Telegram purchase and grant access if payment_id or lead_id exists
            try {
              const paymentId = session.metadata?.payment_id;
              if (paymentId) {
                const { approvePayment } = await import("@/lib/finance.server");
                await approvePayment(paymentId);
              }
            } catch (fulfillErr) {
              console.error("[stripe-fulfill-error]", fulfillErr);
            }
            break;
          }
          default:
            console.log("Unhandled event type:", event.type);
        }

        return Response.json({ received: true });
      },
    },
  },
});
