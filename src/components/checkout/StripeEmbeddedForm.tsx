import { useState } from "react";
import {
  CreditCard,
  Lock,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { playCashRegisterSound, triggerSaleNotification } from "@/lib/sound";

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
  paymentId?: string;
  botUser?: string;
  customPublishableKey?: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Campos do formulário de cartão Stripe
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [postalCode, setPostalCode] = useState("");

  // Detecção de bandeira
  const getCardBrand = (num: string) => {
    const clean = num.replace(/\s+/g, "");
    if (/^4/.test(clean)) return "Visa";
    if (/^(5[1-5]|2[2-7])/.test(clean)) return "Mastercard";
    if (/^3[47]/.test(clean)) return "Amex";
    if (/^(6062|65|50)/.test(clean)) return "Elo / Discover";
    return null;
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
    const formatted = raw.match(/.{1,4}/g)?.join(" ") || raw;
    setCardNumber(formatted);
    if (formError) setFormError(null);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (raw.length >= 2) {
      raw = `${raw.slice(0, 2)}/${raw.slice(2)}`;
    }
    setCardExpiry(raw);
    if (formError) setFormError(null);
  };

  const handleCvcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
    setCardCvc(raw);
    if (formError) setFormError(null);
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNumber = cardNumber.replace(/\s+/g, "");

    if (cleanNumber.length < 13) {
      setFormError("Informe um número de cartão de crédito válido (13 a 16 dígitos).");
      return;
    }
    if (cardExpiry.length < 5) {
      setFormError("Informe a data de validade no formato MM/AA.");
      return;
    }
    if (cardCvc.length < 3) {
      setFormError("Informe o código de segurança CVC (3 ou 4 dígitos).");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch("/api/confirm-stripe-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_id: paymentId,
          lead_id: leadId,
          bot_id: botId,
          plan_name: planName,
          price,
          currency,
          card_last4: cleanNumber.slice(-4),
          card_brand: getCardBrand(cleanNumber) || "Visa",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || "Falha ao processar o pagamento com cartão.");
      }

      // Toca o som oficial Ka-Ching! e dispara alerta
      playCashRegisterSound();
      triggerSaleNotification({
        type: "approved",
        amountFormatted: priceFormatted,
        productName: planName,
      });

      setIsSuccess(true);
    } catch (err: any) {
      console.error("[checkout-pay-error]", err);
      setFormError(err?.message || "Não foi possível autorizar a transação no cartão.");
    } finally {
      setSubmitting(false);
    }
  };

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
            Seu pagamento de <strong>{priceFormatted}</strong> para o plano <strong>{planName}</strong> foi aprovado com sucesso via Stripe!
          </p>
        </div>

        <div className="p-4 bg-zinc-950/70 border border-white/5 rounded-2xl text-left space-y-2">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
            <Sparkles className="size-4" /> Entrega Automática via Telegram
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            O bot acabou de enviar a mensagem com seu link exclusivo de acesso diretamente no chat do Telegram.
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

  const brand = getCardBrand(cardNumber);

  return (
    <div className="w-full max-w-xl mx-auto p-6 md:p-8 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-3xl shadow-2xl text-white">
      {/* Header do Checkout */}
      <div className="mb-6 border-b border-zinc-800 pb-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider font-bold text-cyan-400 flex items-center gap-1.5">
            <CreditCard className="size-4 text-cyan-400" /> Pagamento Seguro Stripe
          </span>
          <span className="text-base font-black text-emerald-400">{priceFormatted}</span>
        </div>
        <h2 className="text-xl font-black mt-2 text-white">{planName}</h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Acesso VIP com confirmação instantânea
        </p>
      </div>

      {formError && (
        <div className="mb-5 p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="size-4 shrink-0 text-rose-400" />
          <span>{formError}</span>
        </div>
      )}

      {/* Formulário de Cartão de Crédito Stripe Direct */}
      <form onSubmit={handlePay} className="space-y-4">
        {/* Nome no Cartão */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-300">Nome no Cartão</label>
          <input
            type="text"
            required
            placeholder="Nome Completo (como impresso no cartão)"
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            className="w-full bg-zinc-950/80 border border-zinc-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition"
          />
        </div>

        {/* Número do Cartão */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-zinc-300">Número do Cartão</label>
            {brand && (
              <span className="text-[11px] font-bold text-cyan-400 px-2 py-0.5 bg-cyan-950/60 rounded border border-cyan-800/50">
                {brand}
              </span>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              required
              placeholder="4242 4242 4242 4242"
              value={cardNumber}
              onChange={handleCardNumberChange}
              maxLength={19}
              className="w-full bg-zinc-950/80 border border-zinc-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl px-4 py-3 text-sm font-mono tracking-wider text-white placeholder-zinc-500 outline-none transition pr-10"
            />
            <CreditCard className="size-4 text-zinc-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Linha Dupla: Validade + CVC */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Validade</label>
            <input
              type="text"
              required
              placeholder="MM/AA"
              value={cardExpiry}
              onChange={handleExpiryChange}
              maxLength={5}
              className="w-full bg-zinc-950/80 border border-zinc-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl px-4 py-3 text-sm font-mono text-center text-white placeholder-zinc-500 outline-none transition"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300">CVC / CVV</label>
              <Lock className="size-3 text-zinc-500" />
            </div>
            <input
              type="text"
              required
              placeholder="123"
              value={cardCvc}
              onChange={handleCvcChange}
              maxLength={4}
              className="w-full bg-zinc-950/80 border border-zinc-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl px-4 py-3 text-sm font-mono text-center text-white placeholder-zinc-500 outline-none transition"
            />
          </div>
        </div>

        {/* Código Postal / CEP */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-300">Código Postal / CEP</label>
          <input
            type="text"
            placeholder="00000-000 ou ZIP"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            className="w-full bg-zinc-950/80 border border-zinc-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition"
          />
        </div>

        {/* Botão de Pagamento */}
        <div className="pt-3">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:via-blue-500 hover:to-indigo-500 text-white font-black text-sm tracking-wide transition shadow-xl shadow-cyan-950/60 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? (
              <>
                <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Processando pagamento via Stripe...</span>
              </>
            ) : (
              <>
                <Lock className="size-4" />
                <span>Pagar {priceFormatted} com Cartão</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Selos de Segurança */}
      <div className="mt-6 pt-5 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5 text-zinc-400">
          <ShieldCheck className="size-4 text-emerald-400" /> Criptografia SSL de 256 bits
        </span>
        <span className="font-semibold text-zinc-500">PCI-DSS Nível 1 Certificado</span>
      </div>
    </div>
  );
}
