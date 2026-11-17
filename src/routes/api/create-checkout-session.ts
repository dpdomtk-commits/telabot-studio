import { createFileRoute } from "@tanstack/react-router";
import { getStripe, getStripeForUser } from "@/lib/stripe.server";

export const Route = createFileRoute("/api/create-checkout-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));

          let stripe = getStripe();
          let paymentId: string | undefined;

          // Se bot_id e lead_id forem informados, vincula as credenciais do dono do bot e registra o pedido pendente
          if (body?.metadata?.bot_id && body?.metadata?.lead_id) {
            try {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const { data: bot } = await supabaseAdmin
                .from("bots")
                .select("id, user_id")
                .eq("id", body.metadata.bot_id)
                .maybeSingle();

              if (bot?.user_id) {
                const userStripe = await getStripeForUser(bot.user_id);
                if (userStripe?.stripe) {
                  stripe = userStripe.stripe;
                }

                const amountCents = body?.price ? Math.round(Number(body.price) * 100) : 2990;
                const { data: pendingPayment } = await supabaseAdmin
                  .from("payments")
                  .insert({
                    user_id: bot.user_id,
                    bot_id: bot.id,
                    lead_id: body.metadata.lead_id,
                    amount_cents: amountCents,
                    status: "pending",
                    provider: "stripe",
                    product_name: body?.plan_name || "Plano VIP",
                    currency: (body?.currency || "USD").toUpperCase(),
                  })
                  .select("id")
                  .maybeSingle();

                if (pendingPayment?.id) {
                  paymentId = pendingPayment.id;
                }
              }
            } catch (initErr) {
              console.warn("[stripe-init-payment-warning]", initErr);
            }
          }

          // TODO: Set mode to "subscription" if selling recurring products.
          const mode: "payment" | "subscription" = body?.mode === "subscription" ? "subscription" : "payment";

          // Use the fixed_by_ui parameters from the Field Intents section.
          // line_items is sample_only — replace with real values, then list in TODO.
          let line_items = body?.line_items;
          if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
            if (body?.price_id) {
              line_items = [{ price: body.price_id, quantity: 1 }];
            } else if (body?.price) {
              const amountCents = Math.round(Number(body.price) * 100);
              const currency = (body.currency || "usd").toLowerCase();
              line_items = [
                {
                  price_data: {
                    currency,
                    product_data: {
                      name: body.plan_name || "VIP Plan",
                    },
                    unit_amount: amountCents > 0 ? amountCents : 2990,
                  },
                  quantity: 1,
                },
              ];
            } else {
              line_items = [{ price: "price_...", quantity: 1 }];
            }
          }

          // Only include payment_method_collection when mode is "subscription".
          const sessionParams: Record<string, any> = {
            ui_mode: "form",
            mode,
            billing_address_collection: "auto",
            phone_number_collection: {
              enabled: false,
            },
            automatic_tax: {
              enabled: false,
            },
            submit_type: "auto",
            integration_identifier: "custom_embedded_web_0001",
            line_items,
          };

          if (mode === "subscription") {
            sessionParams.payment_method_collection = "always";
          }

          if (body?.return_url) {
            sessionParams.return_url = body.return_url;
          }

          sessionParams.metadata = {
            ...(body?.metadata || {}),
            ...(paymentId ? { payment_id: paymentId } : {}),
            plan_name: body?.plan_name || "VIP Plan",
          };

          const session = await stripe.checkout.sessions.create(sessionParams as any);

          return Response.json({ client_secret: session.client_secret });
        } catch (error: any) {
          console.error("[stripe-checkout-session-error]", error);
          return Response.json(
            { error: error?.message || "Failed to create checkout session" },
            { status: 500 }
          );
        }
      },
    },
  },
});
