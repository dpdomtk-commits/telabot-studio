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
  const currency = searchParams.get("currency") || "USD";
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  const price = searchParams.get("price") || "29.90";
  const priceFormatted = `${symbol} ${price}`;

  return (
    <div className="min-h-screen bg-[#050508] text-white flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-xl mb-4 text-center">
        <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
          <span>⚡ CASH BOT</span>
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
        priceFormatted={priceFormatted}
        mode="payment"
      />

      <div className="mt-6 text-center text-xs text-zinc-600">
        Ambiente seguro com certificação PCI-DSS fornecido pela Stripe.
      </div>
    </div>
  );
}
