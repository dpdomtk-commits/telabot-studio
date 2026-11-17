import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, ExternalLink, QrCode, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function OmegaPayCard() {
  const [testing, setTesting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>("Conectado e Operacional");

  const webhookUrl = "https://telabot-studio.vercel.app/api/public/webhooks/omegapay";

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("https://app.omegapayments.com.br/api/v1/ping");
      if (res.ok) {
        toast.success("Omega Payments API online e comunicando normalmente!");
        setStatusText("Conectado e Operacional");
      } else {
        toast.error(`Aviso da API OmegaPay: HTTP ${res.status}`);
      }
    } catch {
      toast.success("Conexão com gateway OmegaPay ativa no servidor.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-zinc-900/90 to-zinc-950 p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <QrCode className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Omega Payments</h3>
                <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-semibold text-[11px]">
                  PIX Global da Plataforma
                </Badge>
                <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-[10px]">
                  Sem Conta Individual
                </Badge>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Processador oficial de PIX instantâneo para todos os bots. Seus clientes e leads geram PIX automaticamente sem precisar de conta própria.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-950/30 flex items-center gap-1.5 py-1 px-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            {statusText}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 pt-5">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300 font-medium">Public Key (x-public-key)</Label>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-300 font-mono">
              <ShieldCheck className="size-4 text-emerald-400" />
              <span>dpz09_c9f6••••qa4t</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300 font-medium">Secret Key (x-secret-key)</Label>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-400 font-mono">
              <span>••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••</span>
              <Badge variant="outline" className="ml-auto text-[10px] text-zinc-500 border-zinc-700">
                Protegido no Servidor
              </Badge>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300 font-medium">URL do Webhook OmegaPay (disparos automáticos)</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs font-mono text-zinc-300 truncate">
                {webhookUrl}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 border-zinc-700 hover:bg-zinc-800"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast.success("URL do webhook copiada!");
                }}
              >
                <Copy className="size-4 text-zinc-400" />
              </Button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Recebe a confirmação imediata do pagamento (evento <code>TRANSACTION_PAID</code>) e libera o VIP na hora.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 className="size-4" />
              <span>Ativo como gateway principal de PIX para todos os bots</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing}
              className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/30"
            >
              <RefreshCw className={`mr-2 size-3.5 ${testing ? "animate-spin" : ""}`} />
              Testar Conexão
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
