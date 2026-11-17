import { useEffect, useRef, useState } from "react";
import { AlertCircle, CreditCard, ExternalLink } from "lucide-react";

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
          "";

        if (!publishableKey || publishableKey === "pk_test_placeholder" || publishableKey.length < 10) {
          throw new Error(
            "Credenciais da Stripe não configuradas. Acesse o Painel CASH BOT > Gateways > Stripe e cadastre suas chaves de API (Publishable Key e Secret Key)."
          );
        }

        // Requisita a sessão de checkout no servidor antes de montar o Dahlia
        const res = await fetch("/api/create-checkout-session", {
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
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          throw new Error(data.error || "Não foi possível iniciar a sessão de pagamento.");
        }

        const clientSecret = data.client_secret;
        if (!clientSecret) {
          throw new Error("Client secret não retornado pela Stripe.");
        }

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

        const checkout = stripe.initCheckoutFormSdk({ clientSecret, appearance });
        const form = checkout.createForm({ layout: "expanded" });
        form.mount("#checkout-form");

        const loadActionsResult = await checkout.loadActions();
        if (loadActionsResult.type === "success") {
          form.on("confirm", async (event: any) => {
            try {
              const confirmRes = await loadActionsResult.actions.confirm({ formConfirmEvent: event });
              if (confirmRes?.type === "success") {
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
          <span className="text-xs uppercase tracking-wider font-semibold text-cyan-400 flex items-center gap-1.5">
            <CreditCard className="size-3.5" /> Pagamento Seguro Stripe
          </span>
          <span className="text-sm font-bold text-emerald-400">{priceFormatted}</span>
        </div>
        <h2 className="text-xl font-bold mt-1 text-white">{planName}</h2>
      </div>

      {loading && !errorMessage && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <div className="size-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
          <p className="text-sm text-zinc-400">Carregando formulário seguro da Stripe...</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-6 bg-zinc-950 border border-amber-500/40 rounded-2xl text-white space-y-4 shadow-xl">
          <div className="flex items-center gap-3 text-amber-400">
            <AlertCircle className="size-5" />
            <h3 className="font-bold text-sm">Configuração Stripe Necessária</h3>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            {errorMessage}
          </p>
          <div className="bg-black/60 p-3.5 rounded-xl border border-white/5 space-y-2 text-xs text-zinc-400">
            <p className="font-semibold text-white">Como ativar em 1 minuto:</p>
            <ol className="list-decimal pl-4 space-y-1 text-[11px]">
              <li>Acesse o painel CASH BOT em <strong>Gateways &gt; Stripe Payments</strong>.</li>
              <li>Cole sua <strong>Publishable Key</strong> (<code className="text-cyan-400">pk_live_...</code> ou <code className="text-cyan-400">pk_test_...</code>).</li>
              <li>Cole sua <strong>Secret Key</strong> (<code className="text-cyan-400">sk_live_...</code> ou <code className="text-cyan-400">sk_test_...</code>).</li>
              <li>Clique em <strong>Salvar Credenciais Stripe</strong>.</li>
            </ol>
          </div>
          <div className="pt-1 flex gap-2">
            <a
              href="/app/gateways"
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition inline-flex items-center gap-1.5"
            >
              Configurar no Painel de Gateways <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      )}

      {/* Container obrigatório para renderização do formulário embutido da Stripe */}
      <div id="checkout-form" ref={containerRef} className={errorMessage ? "hidden" : "min-h-[200px]"} />
    </div>
  );
}
