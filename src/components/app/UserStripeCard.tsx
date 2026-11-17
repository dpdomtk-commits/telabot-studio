import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, CreditCard, ExternalLink, Link2Off, RefreshCw, Save } from "lucide-react";
import {
  disconnectMyStripe,
  getMyStripe,
  saveMyStripe,
  testMyStripe,
} from "@/lib/user-gateway.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

/** Gateways > Stripe Payments do usuário (Cartão Internacional, Apple Pay, Google Pay). */
export function UserStripeCard() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getMyStripe);
  const save = useServerFn(saveMyStripe);
  const test = useServerFn(testMyStripe);
  const disconnect = useServerFn(disconnectMyStripe);

  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["my-stripe"], queryFn: () => fetchStatus() });

  const refresh = () => qc.invalidateQueries({ queryKey: ["my-stripe"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          publishableKey: publishableKey.trim(),
          secretKey: secretKey.trim(),
          webhookSecret: webhookSecret.trim(),
        },
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(r.message);
        setPublishableKey("");
        setSecretKey("");
        setWebhookSecret("");
      } else {
        toast.error(r.message);
      }
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: () => test(),
    onSuccess: (r) => {
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: (r) => {
      toast.success(r.message);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (!data) return null;

  return (
    <div className="panel space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#635BFF]/10 text-[#635BFF]">
            <CreditCard className="size-5" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold flex items-center gap-2">
              Stripe Payments
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-[#635BFF]/20 text-[#a29bfe] border border-[#635BFF]/30">
                Cartão & Carteiras Digitais
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              Aceite cartões de crédito internacionais, Apple Pay e Google Pay (USD, EUR, GBP, BRL) via Stripe.
            </p>
          </div>
        </div>
        <Badge
          variant={
            data.status === "connected" ? "default" : data.status === "error" ? "destructive" : "secondary"
          }
        >
          {data.status === "connected" ? "Conectada" : data.status === "error" ? "Erro" : "Não conectada"}
        </Badge>
      </div>

      {data.configured && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Publishable Key</Label>
            <Input readOnly value={data.publishableKeyMasked} />
          </div>
          <div className="space-y-2">
            <Label>Secret Key</Label>
            <Input readOnly value={data.secretKeyMasked} />
          </div>
          <div className="space-y-2">
            <Label>Última validação</Label>
            <Input readOnly value={data.lastCheckedAt ? formatDate(data.lastCheckedAt) : "—"} />
          </div>
        </div>
      )}

      {data.lastError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <strong>Último erro:</strong> {data.lastError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="stripe-pk">
            Publishable Key <span className="text-xs text-muted-foreground font-mono">(pk_test_... ou pk_live_...)</span>
          </Label>
          <Input
            id="stripe-pk"
            placeholder={data.configured ? "Substituir Chave Publicável..." : "pk_live_51..."}
            value={publishableKey}
            onChange={(e) => setPublishableKey(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stripe-sk">
            Secret Key <span className="text-xs text-muted-foreground font-mono">(sk_test_... ou sk_live_...)</span>
          </Label>
          <Input
            id="stripe-sk"
            type="password"
            placeholder={data.configured ? "Substituir Chave Secreta..." : "sk_live_51..."}
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="stripe-wh">
          Webhook Signing Secret (Opcional) <span className="text-xs text-muted-foreground font-mono">(whsec_...)</span>
        </Label>
        <Input
          id="stripe-wh"
          type="password"
          placeholder={data.webhookSecretMasked ? `Atual: ${data.webhookSecretMasked}` : "whsec_..."}
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Obtido no Stripe Dashboard ao adicionar o endpoint de Webhook abaixo.
        </p>
      </div>

      <div className="rounded-xl border border-white/5 bg-black/40 p-4 space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center justify-between">
          <span>URL do Webhook Stripe (para configurar no Stripe Workbench)</span>
          <a
            href="https://dashboard.stripe.com/workbench/webhooks"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-primary hover:underline flex items-center gap-1"
          >
            Abrir Stripe Webhooks <ExternalLink className="size-3" />
          </a>
        </Label>
        <div className="flex gap-2">
          <Input readOnly value={data.webhookUrl} className="font-mono text-xs select-all bg-black/60" />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(data.webhookUrl);
              toast.success("URL copiada!");
            }}
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Selecione o evento: <code className="text-cyan-400 font-mono">checkout.session.completed</code> para entrega automática instantânea.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex gap-2">
          {data.configured && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
              >
                <RefreshCw className={`mr-2 size-4 ${testMutation.isPending ? "animate-spin" : ""}`} />
                Testar Conexão
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending}
              >
                <Link2Off className="mr-2 size-4" />
                Desconectar
              </Button>
            </>
          )}
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || (!publishableKey && !secretKey)}
        >
          <Save className="mr-2 size-4" />
          {saveMutation.isPending ? "Validando e Salvando..." : "Salvar Credenciais Stripe"}
        </Button>
      </div>
    </div>
  );
}
