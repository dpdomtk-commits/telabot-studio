import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Sparkles,
  AlertCircle,
  Lock,
  ShieldCheck,
} from "lucide-react";

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
  paymentId,
  botUser,
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
  paymentId?: string;
  botUser?: string;
  customPublishableKey?: string;
}) {
  const [isSuccess, setIsSuccess] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);

  const redirectToStripeCheckout = useCallback(async () => {
    setRedirectError(null);
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_name: planName,
          price,
          currency,
          mode,
          lead_id: leadId,
          bot_id: botId,
          plan_id: planId,
          price_id: priceId,
          payment_id: paymentId,
          bot_user: botUser,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Não foi possível iniciar o checkout da Stripe.");
      }

      window.location.replace(data.url);
    } catch (err: any) {
      console.error("[stripe-redirect-error]", err);
      setRedirectError(err?.message || "Falha ao redirecionar para a Stripe.");
    }
  }, [planName, price, currency, mode, leadId, botId, planId, priceId, paymentId, botUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sp = new URLSearchParams(window.location.search);
    if (sp.get("success") === "true" || sp.get("session_id")) {
      setIsSuccess(true);
      const pId = paymentId || sp.get("payment_id");
      if (pId) {
        fetch("/api/confirm-stripe-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_id: pId }),
        }).catch(() => undefined);
      }
      return;
    }

    if (sp.get("cancelled") === "true") {
      setIsCancelled(true);
      return;
    }

    redirectToStripeCheckout();
  }, [paymentId, redirectToStripeCheckout]);

  if (isSuccess) {
    const telegramUrl = botUser ? `https://t.me/${botUser}` : "https://t.me";
    return (
      <div className="w-full max-w-xl mx-auto p-8 bg-zinc-900/90 backdrop-blur-xl border border-emerald-500/40 rounded-3xl shadow-2xl text-white text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="size-20 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto text-3xl font-black shadow-lg shadow-emerald-950/50">
          <CheckCircle2 className="size-10" />
        </div>
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-widest font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1 rounded-full">
            Pagamento Aprovado
          </span>
          <h2 className="text-2xl font-black text-white pt-2">Parabéns! Acesso Liberado</h2>
          <p className="text-sm text-zinc-300 max-w-md mx-auto">
            Seu pagamento de <strong>{priceFormatted}</strong> para o plano{" "}
            <strong>{planName}</strong> foi aprovado com sucesso via Stripe!
          </p>
        </div>

        <div className="p-4 bg-zinc-950/70 border border-white/5 rounded-2xl text-left space-y-2">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
            <Sparkles className="size-4" /> Entrega Automática via Telegram
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            O bot acabou de enviar a mensagem com seu link exclusivo de acesso diretamente no chat
            do Telegram.
          </p>
        </div>

        <div className="pt-2">
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-zinc-950 font-black text-sm transition shadow-lg shadow-cyan-950/50 inline-flex items-center justify-center gap-2"
          >
            Abrir Telegram e Acessar Canal VIP <ExternalLink className="size-4" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-3xl shadow-2xl text-white text-center space-y-6">
      {redirectError ? (
        <>
          <div className="size-16 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto">
            <AlertCircle className="size-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-white">Erro ao abrir pagamento Stripe</h2>
            <p className="text-xs text-rose-300">{redirectError}</p>
          </div>
          <button
            type="button"
            onClick={redirectToStripeCheckout}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm transition cursor-pointer"
          >
            Tentar novamente
          </button>
        </>
      ) : isCancelled ? (
        <>
          <div className="size-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mx-auto">
            <Lock className="size-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-white">Pagamento cancelado</h2>
            <p className="text-xs text-zinc-400">
              Você cancelou o checkout para <strong>{planName}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={redirectToStripeCheckout}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm transition cursor-pointer"
          >
            Ir para o Checkout Oficial da Stripe ({priceFormatted})
          </button>
        </>
      ) : (
        <>
          <div className="size-14 mx-auto rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
          <div className="space-y-2">
            <h2 className="text-lg font-black text-white">{planName}</h2>
            <p className="text-sm font-bold text-emerald-400">{priceFormatted}</p>
            <p className="text-xs text-zinc-400 pt-1">
              Redirecionando para o ambiente oficial da Stripe...
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
            <ShieldCheck className="size-4 text-emerald-400" />
            <span>Checkout hospedado e protegido por Stripe</span>
          </div>
        </>
      )}
    </div>
  );
}
