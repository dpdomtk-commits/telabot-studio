import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown, Split, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { validatePixKey, type PixKeyType } from "@/lib/payments/pix";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { UserSyncpayCard } from "@/components/app/UserSyncpayCard";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBRL, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/gateways")({
  head: () => ({
    meta: [
      { title: "Gateways | Chef Bot" },
      {
        name: "description",
        content:
          "Conecte múltiplos provedores de pagamento, defina prioridade, fallback, split e roteamento por fluxo.",
      },
      { property: "og:title", content: "Gateways | Chef Bot" },
      {
        property: "og:description",
        content: "Múltiplos provedores PIX com fallback inteligente, split e estatísticas por gateway.",
      },
    ],
  }),
  component: GatewaysPage,
});

const providers = [
  { value: "internal", label: "Gateway interna (PIX estático)" },
  { value: "mercadopago", label: "Mercado Pago" },
  { value: "asaas", label: "Asaas" },
  { value: "efi", label: "Efí" },
  { value: "pushinpay", label: "PushinPay" },
  { value: "openpix", label: "OpenPix" },
  { value: "pagarme", label: "Pagar.me" },
  { value: "custom", label: "Personalizado" },
] as const;

type Provider = (typeof providers)[number]["value"];

type GatewayRow = {
  id: string;
  name: string;
  provider: Provider;
  is_active: boolean;
  allow_fallback: boolean;
  priority: number;
  pix_key: string | null;
  receiver_name: string;
  receiver_city: string;
  min_amount_cents: number;
  max_amount_cents: number | null;
  created_at: string;
};

type SplitRow = {
  id: string;
  gateway_id: string;
  recipient_user_id: string | null;
  recipient_label: string;
  percent: number;
};

type AttemptRow = {
  gateway_id: string | null;
  success: boolean;
  latency_ms: number | null;
  created_at: string;
};

type PaymentRow = {
  gateway_id: string | null;
  status: string;
  amount_cents: number;
};

const pixKeyTypeLabel: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  phone: "telefone",
  email: "e-mail",
  evp: "chave aleatória",
};

const emptyForm = {
  id: "",
  name: "",
  provider: "internal" as Provider,
  pix_key: "",
  receiver_name: "Chef Bot",
  receiver_city: "SAO PAULO",
  min_amount: "",
  max_amount: "",
  allow_fallback: true,
  is_active: true,
};

function toCents(value: string) {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function GatewaysPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [splitGateway, setSplitGateway] = useState<GatewayRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["gateways"],
    queryFn: async () => {
      const [gateways, splits, attempts, payments, flows] = await Promise.all([
        supabase
          .from("payment_gateways")
          .select(
            "id,name,provider,is_active,allow_fallback,priority,pix_key,receiver_name,receiver_city,min_amount_cents,max_amount_cents,created_at",
          )
          .order("priority", { ascending: true }),
        supabase.from("gateway_splits").select("id,gateway_id,recipient_user_id,recipient_label,percent"),
        supabase
          .from("gateway_attempts")
          .select("gateway_id,success,latency_ms,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("payments").select("gateway_id,status,amount_cents"),
        supabase.from("flows").select("id,name,gateway_id").order("created_at", { ascending: false }),
      ]);
      return {
        gateways: (gateways.data ?? []) as GatewayRow[],
        splits: (splits.data ?? []) as SplitRow[],
        attempts: (attempts.data ?? []) as AttemptRow[],
        payments: (payments.data ?? []) as PaymentRow[],
        flows: (flows.data ?? []) as { id: string; name: string; gateway_id: string | null }[],
      };
    },
  });

  const gateways = data?.gateways ?? [];
  const pixKeyCheck = validatePixKey(form.pix_key);

  const save = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sessão expirada");
      if (form.name.trim().length < 2) throw new Error("Informe um nome para o gateway");
      if (!pixKeyCheck.valid) throw new Error(pixKeyCheck.error);



      const payload = {
        user_id: uid,
        name: form.name.trim(),
        provider: form.provider,
        pix_key: form.pix_key.trim() || null,
        receiver_name: form.receiver_name.trim() || "Chef Bot",
        receiver_city: form.receiver_city.trim() || "SAO PAULO",
        min_amount_cents: toCents(form.min_amount),
        max_amount_cents: toCents(form.max_amount) || null,
        allow_fallback: form.allow_fallback,
        is_active: form.is_active,
      };

      if (form.id) {
        const { error } = await supabase.from("payment_gateways").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const priority = (gateways.at(-1)?.priority ?? 0) + 1;
        const { error } = await supabase.from("payment_gateways").insert({ ...payload, priority });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Gateway salvo");
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["gateways"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<GatewayRow> }) => {
      const { error } = await supabase.from("payment_gateways").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gateways"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_gateways").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gateway removido");
      qc.invalidateQueries({ queryKey: ["gateways"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const routeFlow = useMutation({
    mutationFn: async ({ flowId, gatewayId }: { flowId: string; gatewayId: string | null }) => {
      const { error } = await supabase.from("flows").update({ gateway_id: gatewayId }).eq("id", flowId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Roteamento atualizado");
      qc.invalidateQueries({ queryKey: ["gateways"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function move(gateway: GatewayRow, direction: -1 | 1) {
    const index = gateways.findIndex((g) => g.id === gateway.id);
    const other = gateways[index + direction];
    if (!other) return;
    await Promise.all([
      supabase.from("payment_gateways").update({ priority: other.priority }).eq("id", gateway.id),
      supabase.from("payment_gateways").update({ priority: gateway.priority }).eq("id", other.id),
    ]);
    qc.invalidateQueries({ queryKey: ["gateways"] });
  }

  function statsFor(id: string) {
    const attempts = (data?.attempts ?? []).filter((a) => a.gateway_id === id);
    const ok = attempts.filter((a) => a.success).length;
    const payments = (data?.payments ?? []).filter((p) => p.gateway_id === id);
    const approved = payments.filter((p) => p.status === "approved");
    const latencies = attempts.map((a) => a.latency_ms ?? 0).filter(Boolean);
    return {
      attempts: attempts.length,
      successRate: attempts.length ? Math.round((ok / attempts.length) * 100) : 0,
      charges: payments.length,
      revenue: approved.reduce((sum, p) => sum + p.amount_cents, 0),
      conversion: payments.length ? Math.round((approved.length / payments.length) * 100) : 0,
      latency: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    };
  }

  function openEdit(gateway: GatewayRow) {
    setForm({
      id: gateway.id,
      name: gateway.name,
      provider: gateway.provider,
      pix_key: gateway.pix_key ?? "",
      receiver_name: gateway.receiver_name,
      receiver_city: gateway.receiver_city,
      min_amount: gateway.min_amount_cents ? (gateway.min_amount_cents / 100).toFixed(2) : "",
      max_amount: gateway.max_amount_cents ? (gateway.max_amount_cents / 100).toFixed(2) : "",
      allow_fallback: gateway.allow_fallback,
      is_active: gateway.is_active,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gateways"
        description="Múltiplos provedores de pagamento com prioridade, fallback inteligente, split e roteamento por fluxo."
        action={
          <Button
            onClick={() => {
              setForm(emptyForm);
              setOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" /> Novo gateway
          </Button>
        }
      />

      <UserSyncpayCard />


      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Provedores</TabsTrigger>
          <TabsTrigger value="stats">Estatísticas</TabsTrigger>
          <TabsTrigger value="routing">Roteamento por fluxo</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4 pt-4">
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : gateways.length === 0 ? (
            <EmptyState
              title="Nenhum gateway conectado"
              description="Enquanto não houver provedores, as cobranças continuam saindo pela gateway interna da plataforma."
            />
          ) : (
            <div className="grid gap-4">
              {gateways.map((gateway, index) => {
                const splits = (data?.splits ?? []).filter((s) => s.gateway_id === gateway.id);
                return (
                  <div key={gateway.id} className="rounded-xl border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">#{index + 1}</Badge>
                          <p className="font-medium">{gateway.name}</p>
                          <Badge variant={gateway.is_active ? "default" : "secondary"}>
                            {gateway.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                          {gateway.allow_fallback ? <Badge variant="outline">Fallback</Badge> : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {providers.find((p) => p.value === gateway.provider)?.label} ·{" "}
                          {gateway.pix_key ? "chave PIX configurada" : "sem chave PIX"} · criado em{" "}
                          {formatDate(gateway.created_at)}
                        </p>
                        {splits.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Split: {splits.map((s) => `${s.recipient_label} ${s.percent}%`).join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={gateway.is_active}
                          onCheckedChange={(checked) =>
                            patch.mutate({ id: gateway.id, values: { is_active: checked } })
                          }
                        />
                        <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => move(gateway, -1)}>
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={index === gateways.length - 1}
                          onClick={() => move(gateway, 1)}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setSplitGateway(gateway)}>
                          <Split className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(gateway)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove.mutate(gateway.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="stats" className="pt-4">
          {gateways.length === 0 ? (
            <EmptyState title="Sem estatísticas" description="Conecte um gateway para acompanhar o desempenho." />
          ) : (
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gateway</TableHead>
                    <TableHead>Tentativas</TableHead>
                    <TableHead>Taxa de sucesso</TableHead>
                    <TableHead>Latência média</TableHead>
                    <TableHead>Cobranças</TableHead>
                    <TableHead>Conversão</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gateways.map((gateway) => {
                    const s = statsFor(gateway.id);
                    return (
                      <TableRow key={gateway.id}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            <Activity className="size-4 text-muted-foreground" />
                            {gateway.name}
                          </span>
                        </TableCell>
                        <TableCell>{s.attempts}</TableCell>
                        <TableCell>{s.successRate}%</TableCell>
                        <TableCell>{s.latency ? `${s.latency} ms` : "—"}</TableCell>
                        <TableCell>{s.charges}</TableCell>
                        <TableCell>{s.conversion}%</TableCell>
                        <TableCell className="text-right">{formatBRL(s.revenue)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="routing" className="pt-4">
          {(data?.flows ?? []).length === 0 ? (
            <EmptyState title="Nenhum fluxo" description="Crie um fluxo para definir o gateway de cobrança." />
          ) : (
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fluxo</TableHead>
                    <TableHead className="w-72">Gateway preferido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.flows ?? []).map((flow) => (
                    <TableRow key={flow.id}>
                      <TableCell className="font-medium">{flow.name}</TableCell>
                      <TableCell>
                        <Select
                          value={flow.gateway_id ?? "auto"}
                          onValueChange={(value) =>
                            routeFlow.mutate({ flowId: flow.id, gatewayId: value === "auto" ? null : value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Automático (por prioridade)</SelectItem>
                            {gateways.map((g) => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar gateway" : "Novo gateway"}</DialogTitle>
            <DialogDescription>
              A ordem da lista define a prioridade. Se um gateway falhar, a cobrança segue para o próximo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="gw-name">Nome</Label>
              <Input
                id="gw-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Gateway principal"
              />
            </div>
            <div className="grid gap-2">
              <Label>Provedor</Label>
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v as Provider })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gw-key">Chave PIX de recebimento</Label>
              <Input
                id="gw-key"
                value={form.pix_key}
                onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
                placeholder="email, CPF/CNPJ, telefone ou chave aleatória"
              />
              {form.pix_key.trim() ? (
                pixKeyCheck.valid ? (
                  <p className="text-xs text-emerald-500">Chave válida ({pixKeyTypeLabel[pixKeyCheck.type]})</p>
                ) : (
                  <p className="text-xs text-destructive">{pixKeyCheck.error}</p>
                )
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="gw-rname">Nome do recebedor</Label>
                <Input
                  id="gw-rname"
                  value={form.receiver_name}
                  onChange={(e) => setForm({ ...form, receiver_name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gw-rcity">Cidade</Label>
                <Input
                  id="gw-rcity"
                  value={form.receiver_city}
                  onChange={(e) => setForm({ ...form, receiver_city: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="gw-min">Valor mínimo (R$)</Label>
                <Input
                  id="gw-min"
                  value={form.min_amount}
                  onChange={(e) => setForm({ ...form, min_amount: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gw-max">Valor máximo (R$)</Label>
                <Input
                  id="gw-max"
                  value={form.max_amount}
                  onChange={(e) => setForm({ ...form, max_amount: e.target.value })}
                  placeholder="sem limite"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Permitir fallback</p>
                <p className="text-xs text-muted-foreground">
                  Se falhar, tenta o próximo gateway da fila automaticamente.
                </p>
              </div>
              <Switch
                checked={form.allow_fallback}
                onCheckedChange={(checked) => setForm({ ...form, allow_fallback: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SplitDialog gateway={splitGateway} splits={data?.splits ?? []} onClose={() => setSplitGateway(null)} />
    </div>
  );
}

function SplitDialog({
  gateway,
  splits,
  onClose,
}: {
  gateway: GatewayRow | null;
  splits: SplitRow[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [recipient, setRecipient] = useState("");
  const [percent, setPercent] = useState("");

  const rows = splits.filter((s) => s.gateway_id === gateway?.id);
  const total = rows.reduce((sum, r) => sum + Number(r.percent), 0);

  const add = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid || !gateway) throw new Error("Sessão expirada");
      const value = Number(percent.replace(",", "."));
      if (!label.trim()) throw new Error("Informe o nome do participante");
      if (!(value > 0 && value <= 100)) throw new Error("Percentual inválido");
      if (total + value > 100) throw new Error("A soma dos splits ultrapassa 100%");
      const { error } = await supabase.from("gateway_splits").insert({
        user_id: uid,
        gateway_id: gateway.id,
        recipient_label: label.trim(),
        recipient_user_id: recipient.trim() || null,
        percent: value,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Split adicionado");
      setLabel("");
      setRecipient("");
      setPercent("");
      qc.invalidateQueries({ queryKey: ["gateways"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gateway_splits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gateways"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={Boolean(gateway)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Split de pagamentos · {gateway?.name}</DialogTitle>
          <DialogDescription>
            Cada participante recebe um percentual do valor líquido, creditado na carteira interna assim que o PIX
            é confirmado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum split configurado.</p>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{row.recipient_label}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.percent}% · {row.recipient_user_id ? "carteira vinculada" : "sem carteira vinculada"}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(row.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground">Total distribuído: {total}%</p>

          <div className="grid gap-2 sm:grid-cols-3">
            <Input placeholder="Participante" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Input placeholder="ID do usuário" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            <Input placeholder="%" value={percent} onChange={(e) => setPercent(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            Adicionar split
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

