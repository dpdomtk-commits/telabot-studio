import Stripe from "stripe";

let defaultStripeInstance: Stripe | null = null;

export function getStripe(secretKeyOverride?: string): Stripe | null {
  const secretKey = secretKeyOverride || process.env.STRIPE_SECRET_KEY || "";
  if (!secretKey || secretKey === "sk_test_placeholder" || secretKey.length < 10) {
    return null;
  }

  if (secretKeyOverride) {
    return new Stripe(secretKeyOverride, {
      apiVersion: "2026-03-25.dahlia" as any,
    });
  }

  if (!defaultStripeInstance) {
    defaultStripeInstance = new Stripe(secretKey, {
      apiVersion: "2026-03-25.dahlia" as any,
    });
  }
  return defaultStripeInstance;
}

export async function getStripeForUser(userId?: string): Promise<{
  stripe: Stripe | null;
  publishableKey?: string;
  webhookSecret?: string;
}> {
  if (userId) {
    try {
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

        if (secretKey && secretKey !== "sk_test_placeholder" && secretKey.length >= 10) {
          return {
            stripe: new Stripe(secretKey, { apiVersion: "2026-03-25.dahlia" as any }),
            publishableKey: data.client_id || undefined,
            webhookSecret: webhookSecret || process.env.STRIPE_WEBHOOK_SECRET,
          };
        }
      }
    } catch (e) {
      console.warn("[getStripeForUser-err]", e);
    }
  }

  const defaultStripe = getStripe();
  return {
    stripe: defaultStripe,
    publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  };
}
