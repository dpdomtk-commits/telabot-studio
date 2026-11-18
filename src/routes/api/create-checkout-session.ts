import { createFileRoute } from "@tanstack/react-router";

type CheckoutInput = {
  plan_name?: string;
  price?: string | number;
  currency?: string;
  lead_id?: string;
  bot_id?: string;
  plan_id?: string;
  payment_id?: string;
  bot_user?: string;
  mode?: string;
  price_id?: string;
  origin?: string;
};

async function buildHostedStripeSession(input: CheckoutInput) {
  const { createNativeStripeCheckoutSession } = await import("@/lib/stripe.server");

  const planName = input.plan_name || "VIP Access";
  const currency = (input.currency || "USD").toUpperCase();
  const parsedPrice = Number(input.price || "29.90");
  const amountCents =
    Number.isFinite(parsedPrice) && parsedPrice > 0 ? Math.round(parsedPrice * 100) : 2990;
  const mode: "payment" | "subscription" =
    input.mode === "subscription" ? "subscription" : "payment";

  let userId: string | undefined;
  let paymentId = input.payment_id;
  let botUsername = input.bot_user ? input.bot_user.replace("@", "") : "";

  if (input.bot_id) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: bot } = await supabaseAdmin
        .from("bots")
        .select("id, user_id, telegram_username")
        .eq("id", input.bot_id)
        .maybeSingle();

      if (bot?.user_id) {
        userId = bot.user_id;
        if (!botUsername && bot.telegram_username) {
          botUsername = bot.telegram_username.replace("@", "");
        }

        if ((!paymentId || paymentId.startsWith("stripe-")) && input.lead_id) {
          const { data: pendingPayment } = await supabaseAdmin
            .from("payments")
            .insert({
              user_id: bot.user_id,
              bot_id: bot.id,
              lead_id: input.lead_id,
              amount_cents: amountCents,
              status: "pending",
              provider: "stripe",
              product_name: planName,
              currency,
            })
            .select("id")
            .maybeSingle();

          if (pendingPayment?.id) {
            paymentId = pendingPayment.id;
          }
        }
      }
    } catch (initErr) {
      console.warn("[stripe-init-payment-warning]", initErr);
    }
  }

  const domain = (
    process.env.DOMAIN ||
    input.origin ||
    "https://telabot-studio.vercel.app"
  ).replace(/\/+$/, "");

  const successParams = new URLSearchParams({
    success: "true",
    plan_name: planName,
    price: (amountCents / 100).toFixed(2),
    currency,
  });
  if (paymentId) successParams.set("payment_id", paymentId);
  if (botUsername) successParams.set("bot_user", botUsername);

  const successUrl = `${domain}/checkout?${successParams.toString()}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = botUsername
    ? `https://t.me/${botUsername}`
    : `${domain}/checkout?cancelled=true`;

  const metadata: Record<string, string> = {
    plan_name: planName,
    currency,
  };
  if (userId) metadata.user_id = userId;
  if (input.bot_id) metadata.bot_id = input.bot_id;
  if (input.lead_id) metadata.lead_id = input.lead_id;
  if (input.plan_id) metadata.plan_id = input.plan_id;
  if (paymentId) metadata.payment_id = paymentId;

  return createNativeStripeCheckoutSession({
    userId,
    mode,
    currency,
    unitAmountCents: amountCents,
    productName: planName,
    productDescription: `Acesso VIP ${planName}`,
    priceId: input.price_id || undefined,
    successUrl,
    cancelUrl,
    clientReferenceId: paymentId,
    metadata,
  });
}

export const Route = createFileRoute("/api/create-checkout-session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const sp = url.searchParams;
          const session = await buildHostedStripeSession({
            plan_name: sp.get("plan_name") || undefined,
            price: sp.get("price") || undefined,
            currency: sp.get("currency") || undefined,
            lead_id: sp.get("lead_id") || undefined,
            bot_id: sp.get("bot_id") || undefined,
            plan_id: sp.get("plan_id") || undefined,
            payment_id: sp.get("payment_id") || undefined,
            bot_user: sp.get("bot_user") || undefined,
            mode: sp.get("mode") || undefined,
            price_id: sp.get("price_id") || undefined,
            origin: url.origin,
          });
          return Response.redirect(session.url, 302);
        } catch (error: any) {
          console.error("[stripe-checkout-session-get-error]", error);
          return Response.json(
            { error: error?.message || "Failed to create Stripe checkout session" },
            { status: 500 },
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const body = (await request.json().catch(() => ({}))) as Record<string, any>;
          const meta = body?.metadata || {};

          const session = await buildHostedStripeSession({
            plan_name: body?.plan_name || meta?.plan_name,
            price: body?.price,
            currency: body?.currency || meta?.currency,
            lead_id: body?.lead_id || meta?.lead_id,
            bot_id: body?.bot_id || meta?.bot_id,
            plan_id: body?.plan_id || meta?.plan_id,
            payment_id: body?.payment_id || meta?.payment_id,
            bot_user: body?.bot_user,
            mode: body?.mode,
            price_id: body?.price_id,
            origin: url.origin,
          });

          return Response.json({ url: session.url, id: session.id });
        } catch (error: any) {
          console.error("[stripe-checkout-session-post-error]", error);
          return Response.json(
            { error: error?.message || "Failed to create Stripe checkout session" },
            { status: 500 },
          );
        }
      },
    },
  },
});
