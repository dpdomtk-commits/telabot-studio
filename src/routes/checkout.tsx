import { createFileRoute } from "@tanstack/react-router";
import { StripeEmbeddedForm } from "@/components/checkout/StripeEmbeddedForm";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout Seguro — Stripe | CASH BOT" },
      { name: "description", content: "Finalize seu pagamento com cartão via Stripe com total segurança." },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const planName = searchParams.get("plan_name") || "Acesso VIP Internacional";
  const currency = (searchParams.get("currency") || "USD").toUpperCase();
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  const price = searchParams.get("price") || "29.90";
  const priceFormatted = `${symbol} ${price}`;
  const leadId = searchParams.get("lead_id") || undefined;
  const botId = searchParams.get("bot_id") || undefined;
  const planId = searchParams.get("plan_id") || undefined;
  const priceId = searchParams.get("price_id") || undefined;
  const paymentId = searchParams.get("payment_id") || undefined;
  const botUser = searchParams.get("bot_user") || undefined;
  const mode = (searchParams.get("mode") as "payment" | "subscription") || "payment";
  const customPublishableKey = searchParams.get("pk") || undefined;

  return (
    <div className="min-h-screen bg-[#050508] text-white flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-xl mb-4 text-center">
        <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2.5">
          <img src="/cashbot-emblem.jpg?v=3" alt="CASH BOT" className="size-9 object-contain" />
          <span>CASH BOT</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
            STRIPE
          </span>
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Pagamento internacional criptografado de ponta a ponta
        </p>
      </div>

      <StripeEmbeddedForm
        planName={planName}
        price={price}
        priceFormatted={priceFormatted}
        currency={currency}
        mode={mode}
        leadId={leadId}
        botId={botId}
        planId={planId}
        priceId={priceId}
        paymentId={paymentId}
        botUser={botUser}
        customPublishableKey={customPublishableKey}
      />

      <div className="mt-6 text-center text-xs text-zinc-600">
        Ambiente seguro com certificação PCI-DSS fornecido pela Stripe.
      </div>
    </div>
  );
}
