import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Stripe?: (key: string) => any;
  }
}

export function StripeEmbeddedForm({
  planName = "Plano VIP",
  price = "29.90",
  priceFormatted = "$ 29.90",
  currency = "USD",
  mode = "payment",
  leadId,
  botId,
  planId,
  priceId,
  customPublishableKey,
}: {
  planName?: string;
  price?: string | number;
  priceFormatted?: string;
  currency?: string;
  mode?: "payment" | "subscription";
  leadId?: string;
  botId?: string;
  planId?: string;
  priceId?: string;
  customPublishableKey?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    async function initializeCheckout() {
      try {
        const publishableKey =
          customPublishableKey ||
          import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
          "pk_test_placeholder";

        if (!window.Stripe) {
          // Aguarda o script Dahlia carregar caso ainda não esteja pronto
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => resolve(), 3000);
            if (window.Stripe) {
              clearTimeout(timeout);
              return resolve();
            }
            const interval = setInterval(() => {
              if (window.Stripe) {
                clearInterval(interval);
                clearTimeout(timeout);
                resolve();
              }
            }, 100);
          });
        }

        if (!window.Stripe) {
          throw new Error("Stripe.js Dahlia SDK não foi carregado corretamente no cabeçalho.");
        }

        const stripe = window.Stripe(publishableKey);

        const appearance = {
          theme: "stripe",
          labels: "auto",
          inputs: "spaced",
          variables: {
            borderRadius: "6px",
            colorBackground: "#ffffff",
            colorDanger: "#df1b41",
            colorPrimary: "#0570de",
            colorSuccess: "#00c853",
            colorText: "#18181b",
            fontFamily: "default",
            fontSizeBase: "16px",
            spacingUnit: "4px",
          },
        };

        const clientSecret = fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            plan_name: planName,
            price,
            currency,
            price_id: priceId,
            metadata: {
              plan_name: planName,
              price,
              currency,
              lead_id: leadId,
              bot_id: botId,
              plan_id: planId,
            },
          }),
        })
          .then((response) => response.json())
          .then((json) => {
            if (json.error) throw new Error(json.error);
            return json.client_secret;
          });

        const checkout = stripe.initCheckoutFormSdk({ clientSecret, appearance });
        const form = checkout.createForm({ layout: "expanded" });
        form.mount("#checkout-form");

        const loadActionsResult = await checkout.loadActions();
        if (loadActionsResult.type === "success") {
          form.on("confirm", async (event: any) => {
            try {
              const res = await loadActionsResult.actions.confirm({ formConfirmEvent: event });
              if (res?.type === "success") {
                setIsSuccess(true);
              }
            } catch (error) {
              console.error("Payment confirmation error:", error);
            }
          });
        }

        setLoading(false);
      } catch (err: any) {
        console.error("Erro ao inicializar Stripe Checkout Form:", err);
        setErrorMessage(
          err?.message || "Não foi possível carregar o formulário de pagamento da Stripe."
        );
        setLoading(false);
      }
    }

    initializeCheckout();
  }, [mode, customPublishableKey, leadId, botId, planId, priceId, planName, price, currency]);

  if (isSuccess) {
    return (
      <div className="w-full max-w-xl mx-auto p-8 bg-zinc-900 border border-emerald-500/30 rounded-2xl shadow-2xl text-white text-center space-y-4">
        <div className="size-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto text-2xl font-bold">
          ✓
        </div>
        <h2 className="text-2xl font-bold text-white">Pagamento Aprovado com Sucesso!</h2>
        <p className="text-sm text-zinc-300">
          Seu acesso ao <strong>{planName}</strong> foi confirmado e liberado.
        </p>
        <p className="text-xs text-zinc-400">
          Você já pode voltar para a conversa no <strong>Telegram</strong>. O bot acabou de lhe enviar o link exclusivo do canal VIP!
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto p-6 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl text-white">
      <div className="mb-6 border-b border-zinc-800 pb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider font-semibold text-cyan-400">
            Pagamento Seguro Stripe
          </span>
          <span className="text-sm font-bold text-emerald-400">{priceFormatted}</span>
        </div>
        <h2 className="text-xl font-bold mt-1 text-white">{planName}</h2>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <div className="size-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
          <p className="text-sm text-zinc-400">Carregando formulário seguro da Stripe...</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-xl text-red-200 text-sm mb-4">
          <p className="font-semibold">Aviso de Configuração Stripe:</p>
          <p className="mt-1 text-xs">{errorMessage}</p>
          <p className="mt-2 text-[11px] text-zinc-400">
            Configure suas chaves de API no painel CASH BOT em <strong>Gateways &gt; Stripe</strong>.
          </p>
        </div>
      )}

      {/* Container obrigatório para renderização do formulário embutido da Stripe */}
      <div id="checkout-form" ref={containerRef} className="min-h-[200px]" />
    </div>
  );
}
