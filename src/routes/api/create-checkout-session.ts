import { createFileRoute } from "@tanstack/react-router";
import { getStripe } from "@/lib/stripe.server";

export const Route = createFileRoute("/api/create-checkout-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const stripe = getStripe();
          const body = await request.json().catch(() => ({}));

          // TODO: Set mode to "subscription" if selling recurring products.
          const mode: "payment" | "subscription" = body?.mode === "subscription" ? "subscription" : "payment";

          // Use the fixed_by_ui parameters from the Field Intents section.
          // line_items is sample_only — replace with real values, then list in TODO.
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
            line_items: body?.line_items || [{ price: "price_...", quantity: 1 }],
          };

          if (mode === "subscription") {
            sessionParams.payment_method_collection = "always";
          }

          if (body?.return_url) {
            sessionParams.return_url = body.return_url;
          }

          if (body?.metadata) {
            sessionParams.metadata = body.metadata;
          }

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
