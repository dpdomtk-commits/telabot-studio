import Stripe from "stripe";

let defaultStripeInstance: Stripe | null = null;

export function getStripe(secretKeyOverride?: string): Stripe {
  if (secretKeyOverride) {
    return new Stripe(secretKeyOverride, {
      apiVersion: "2026-03-25.dahlia" as any,
    });
  }
  if (!defaultStripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY || "";
    defaultStripeInstance = new Stripe(secretKey, {
      apiVersion: "2026-03-25.dahlia" as any,
    });
  }
  return defaultStripeInstance;
}

export async function getStripeForUser(userId?: string): Promise<{
  stripe: Stripe;
  publishableKey?: string;
  webhookSecret?: string;
}> {
  if (userId) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_gateway_credentials")
      .select("client_id, client_secret")
      .eq("user_id", userId)
      .eq("provider", "stripe")
      .maybeSingle();

    if (data?.client_secret) {
      let secretKey = data.client_secret;
      let webhookSecret: string | undefined;

      if (secretKey.includes(":::")) {
        const parts = secretKey.split(":::");
        secretKey = parts[0];
        webhookSecret = parts[1] || undefined;
      } else {
        try {
          const parsed = JSON.parse(secretKey);
          if (parsed.secretKey) {
            secretKey = parsed.secretKey;
            webhookSecret = parsed.webhookSecret || undefined;
          }
        } catch {}
      }

      return {
        stripe: new Stripe(secretKey, { apiVersion: "2026-03-25.dahlia" as any }),
        publishableKey: data.client_id || undefined,
        webhookSecret: webhookSecret || process.env.STRIPE_WEBHOOK_SECRET,
      };
    }
  }

  return {
    stripe: getStripe(),
    publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  };
}
