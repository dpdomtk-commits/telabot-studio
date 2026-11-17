import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY || "";
    stripeInstance = new Stripe(secretKey, {
      apiVersion: "2026-03-25.dahlia" as any,
    });
  }
  return stripeInstance;
}
