import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Link2Off, RefreshCw, Save } from "lucide-react";
import {
  disconnectMySyncpay,
  getMySyncpay,
  saveMySyncpay,
  testMySyncpay,
} from "@/lib/user-gateway.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

/** Gateways > SyncPay do usuário (Client ID / Client Secret próprios). */
export function UserSyncpayCard() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getMySyncpay);
  const save = useServerFn(saveMySyncpay);
  const test = useServerFn(testMySyncpay);
  const disconnect = useServerFn(disconnectMySyncpay);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["my-syncpay"], queryFn: () => fetchStatus() });

  const refresh = () => qc.invalidateQueries({ queryKey: ["my-syncpay"] });

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { clientId: clientId.trim(), clientSecret: clientSecret.trim() } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(r.message);
        setClientId("");
        setClientSecret("");
      } else toast.error(r.message);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: () => test(),
    onSuccess: (r) => {
      if (r.ok) toast.success("Conexão validada");
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
          <KeyRound className="size-5 text-primary" />
          <div>
            <p className="font-display text-lg font-semibold">Minha SyncPay</p>
            <p className="text-sm text-muted-foreground">
              Use suas próprias credenciais SyncPay. Quando conectada, todas as cobranças dos seus fluxos
              passam por ela.
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Client ID salvo</Label>
            <Input readOnly value={data.clientIdMasked} />
          </div>
          <div className="space-y-2">
            <Label>Última validação</Label>
            <Input readOnly value={data.lastCheckedAt ? formatDate(data.lastCheckedAt) : "—"} />
          </div>
          {data.lastError && (
            <p className="text-xs text-destructive sm:col-span-2">Último erro: {data.lastError}</p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sp-client-id">Client ID</Label>
          <Input
            id="sp-client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Cole seu Client ID da SyncPay"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sp-client-secret">Client Secret</Label>
          <Input
            id="sp-client-secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Cole seu Client Secret"
          />
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
            Cadastre esta URL no painel da SyncPay para receber as confirmações de pagamento.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || clientId.trim().length < 6 || clientSecret.trim().length < 6}
        >
          <Save /> Salvar e validar
        </Button>
        <Button
          variant="secondary"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending || !data.configured}
        >
          <RefreshCw /> Testar conexão
        </Button>
        {data.configured && (
          <Button
            variant="ghost"
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
          >
            <Link2Off /> Desconectar
          </Button>
        )}
      </div>
    </div>
  );
}
