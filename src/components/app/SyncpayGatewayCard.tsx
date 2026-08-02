import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, Plug, RefreshCw } from "lucide-react";
import { getSyncpayStatus, setPlatformProvider, testSyncpay } from "@/lib/syncpay.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

/** Configurações > Gateway > SyncPay (visível apenas para administradores). */
export function SyncpayGatewayCard() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getSyncpayStatus);
  const runTest = useServerFn(testSyncpay);
  const switchProvider = useServerFn(setPlatformProvider);

  const { data, isLoading } = useQuery({
    queryKey: ["syncpay-status"],
    queryFn: () => fetchStatus(),
  });

  const test = useMutation({
    mutationFn: () => runTest(),
    onSuccess: (r) => {
      if (r.ok) toast.success("Conectado à SyncPay");
      else toast.error(r.message || "Erro de autenticação");
      qc.invalidateQueries({ queryKey: ["syncpay-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const provider = useMutation({
    mutationFn: (p: "internal" | "syncpay") => switchProvider({ data: { provider: p } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      qc.invalidateQueries({ queryKey: ["syncpay-status"] });
      qc.invalidateQueries({ queryKey: ["admin-finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data) return null;

  const active = data.activeProvider === "syncpay";

  return (
    <div className="panel space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Plug className="size-5 text-primary" />
          <div>
            <p className="font-display text-lg font-semibold">SyncPay</p>
            <p className="text-sm text-muted-foreground">
              Gateway principal da plataforma. Todos os PIX caem na conta central e são divididos
              internamente por comissão.
            </p>
          </div>
        </div>
        <Badge variant={data.connected ? "default" : data.connected === false ? "destructive" : "secondary"}>
          {data.connected ? "Conectado" : data.connected === false ? "Erro de autenticação" : "Não testado"}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Client ID</Label>
          <Input readOnly value={data.clientIdMasked || "Não configurado"} />
        </div>
        <div className="space-y-2">
          <Label>Client Secret</Label>
          <Input readOnly value={data.configured ? "•••••••••••••••• (armazenado no servidor)" : "Não configurado"} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Webhook URL</Label>
          <div className="flex gap-2">
            <Input readOnly value={data.webhookUrl} className="font-mono text-xs" />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(data.webhookUrl);
                toast.success("URL copiada");
              }}
            >
              <Copy />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cadastre esta URL na SyncPay para receber os eventos de pagamento.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Última sincronização</Label>
          <Input readOnly value={data.lastSyncAt ? formatDate(data.lastSyncAt) : "—"} />
        </div>
        <div className="space-y-2">
          <Label>Provedor ativo</Label>
          <Input readOnly value={active ? "SyncPay" : "Gateway interna"} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => test.mutate()} disabled={test.isPending}>
          <RefreshCw /> Testar conexão
        </Button>
        <Button
          variant="secondary"
          onClick={() => provider.mutate(active ? "internal" : "syncpay")}
          disabled={provider.isPending || !data.configured}
        >
          <Check /> {active ? "Voltar para gateway interna" : "Ativar SyncPay na plataforma"}
        </Button>
      </div>
    </div>
  );
}
