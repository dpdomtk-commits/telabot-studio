import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { validatePixKey } from "@/lib/payments/pix";
import {
  adjustWallet,
  resolveWithdrawal,
  saveFinanceSettings,
  setUserBlocked,
} from "@/lib/finance.functions";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  formatBRL,
  formatDate,
  paymentStatusLabels,
  pixKeyTypeLabels,
  withdrawalStatusLabels,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/admin-finance")({
  head: () => ({
    meta: [
      { title: "Financeiro admin | AURUMBOT" },
      {
        name: "description",
        content: "Gestão da gateway interna: saldos, cobranças, saques e taxas da plataforma.",
      },
      { property: "og:title", content: "Financeiro admin | AURUMBOT" },
      { property: "og:description", content: "Gestão da gateway interna do AURUMBOT." },
    ],
  }),
  component: AdminFinancePage,
});

function AdminFinancePage() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-finance"] });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-finance"],
    queryFn: async () => {
      const [wallets, profiles, charges, withdrawals, settings] = await Promise.all([
        supabase.from("wallets").select("*").limit(200),
        supabase.from("profiles").select("id,full_name,email,is_blocked").limit(200),
        supabase
          .from("payments")
          .select("id,amount_cents,fee_cents,net_cents,status,description,created_at,user_id")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("withdrawals")
          .select("id,user_id,amount_cents,fee_cents,net_cents,status,pix_key,pix_key_type,created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("finance_settings").select("*").maybeSingle(),
      ]);
      return {
        wallets: wallets.data ?? [],
        profiles: profiles.data ?? [],
        charges: charges.data ?? [],
        withdrawals: withdrawals.data ?? [],
        settings: settings.data,
      };
    },
  });

  const nameOf = (userId: string) => {
    const p = data?.profiles.find((x) => x.id === userId);
    return p?.full_name ?? p?.email ?? userId.slice(0, 8);
  };

  const resolve = useMutation({
    mutationFn: async (vars: { withdrawalId: string; status: "approved" | "paid" | "rejected" }) => {
      const result = await resolveWithdrawal({ data: vars });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (m) => {
      toast.success(m);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const block = useMutation({
    mutationFn: async (vars: { userId: string; blocked: boolean }) => {
      const result = await setUserBlocked({ data: vars });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (m) => {
      toast.success(m);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const totalPaid = (data?.charges ?? [])
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + c.amount_cents, 0);
  const totalFees = (data?.charges ?? [])
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + (c.fee_cents ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Financeiro admin"
        description="Saldos, cobranças, saques e configuração de taxas da gateway."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Cobranças pagas", value: formatBRL(totalPaid) },
          { label: "Taxas da plataforma", value: formatBRL(totalFees) },
          {
            label: "Saques em análise",
            value: String((data?.withdrawals ?? []).filter((w) => w.status === "review").length),
          },
        ].map((c) => (
          <div key={c.label} className="panel p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className="mt-2 font-display text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="withdrawals" className="mt-6">
        <TabsList>
          <TabsTrigger value="withdrawals">Saques</TabsTrigger>
          <TabsTrigger value="wallets">Carteiras</TabsTrigger>
          <TabsTrigger value="charges">Cobranças</TabsTrigger>
          <TabsTrigger value="settings">Taxas</TabsTrigger>
        </TabsList>

        <TabsContent value="withdrawals" className="mt-4">
          {(data?.withdrawals.length ?? 0) === 0 ? (
            <EmptyState title="Nenhum saque" description="Solicitações de saque aparecem aqui." />
          ) : (
            <div className="panel overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Chave PIX</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Líquido</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.withdrawals.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium">{nameOf(w.user_id)}</TableCell>
                      <TableCell>
                        {w.pix_key}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {pixKeyTypeLabels[w.pix_key_type] ?? w.pix_key_type}
                        </span>
                      </TableCell>
                      <TableCell>{formatBRL(w.amount_cents)}</TableCell>
                      <TableCell>{formatBRL(w.net_cents)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            w.status === "paid" ? "default" : w.status === "rejected" ? "destructive" : "secondary"
                          }
                        >
                          {withdrawalStatusLabels[w.status] ?? w.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(w.created_at)}</TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={resolve.isPending || w.status !== "review"}
                          onClick={() => resolve.mutate({ withdrawalId: w.id, status: "approved" })}
                        >
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          disabled={resolve.isPending || (w.status !== "approved" && w.status !== "review")}
                          onClick={() => resolve.mutate({ withdrawalId: w.id, status: "paid" })}
                        >
                          Marcar pago
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={resolve.isPending || w.status === "paid" || w.status === "rejected"}
                          onClick={() => resolve.mutate({ withdrawalId: w.id, status: "rejected" })}
                        >
                          Recusar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="wallets" className="mt-4">
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Disponível</TableHead>
                  <TableHead>Pendente</TableHead>
                  <TableHead>Bloqueado</TableHead>
                  <TableHead>Recebido</TableHead>
                  <TableHead>Sacado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.wallets.map((w) => {
                  const profile = data.profiles.find((p) => p.id === w.user_id);
                  return (
                    <TableRow key={w.user_id}>
                      <TableCell className="font-medium">
                        {nameOf(w.user_id)}
                        {profile?.is_blocked ? (
                          <Badge variant="destructive" className="ml-2">
                            Bloqueado
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatBRL(w.available_cents)}</TableCell>
                      <TableCell>{formatBRL(w.pending_cents)}</TableCell>
                      <TableCell>{formatBRL(w.blocked_cents)}</TableCell>
                      <TableCell>{formatBRL(w.total_received_cents)}</TableCell>
                      <TableCell>{formatBRL(w.total_withdrawn_cents)}</TableCell>
                      <TableCell className="space-x-2 text-right">
                        <AdjustBalance userId={w.user_id} onDone={refresh} />
                        <Button
                          size="sm"
                          variant={profile?.is_blocked ? "secondary" : "destructive"}
                          disabled={block.isPending}
                          onClick={() =>
                            block.mutate({ userId: w.user_id, blocked: !profile?.is_blocked })
                          }
                        >
                          {profile?.is_blocked ? "Liberar" : "Bloquear"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="charges" className="mt-4">
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Taxa</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.charges.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{nameOf(c.user_id)}</TableCell>
                    <TableCell className="text-muted-foreground">{c.description ?? "—"}</TableCell>
                    <TableCell>{formatBRL(c.amount_cents)}</TableCell>
                    <TableCell>{formatBRL(c.fee_cents ?? 0)}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "approved" ? "default" : "secondary"}>
                        {paymentStatusLabels[c.status] ?? c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsForm settings={data?.settings ?? null} onDone={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AdjustBalance({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  const run = useMutation({
    mutationFn: async () => {
      const cents = Math.round(Number(value.replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents === 0) throw new Error("Informe um valor válido");
      if (reason.trim().length < 3) throw new Error("Descreva o motivo do ajuste");
      const result = await adjustWallet({ data: { userId, amountCents: cents, description: reason.trim() } });
      if (!result.ok) throw new Error(result.message);
    },
    onSuccess: () => {
      toast.success("Saldo ajustado");
      setOpen(false);
      setValue("");
      setReason("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Ajustar
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Input
        className="w-24"
        placeholder="±R$"
        maxLength={12}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Input
        className="w-40"
        placeholder="Motivo"
        maxLength={200}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button size="sm" disabled={run.isPending} onClick={() => run.mutate()}>
        Salvar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </span>
  );
}

type Settings = {
  charge_fixed_fee_cents: number;
  charge_percent_fee: number;
  withdrawal_fee_cents: number;
  min_withdrawal_cents: number;
  pix_receiver_key: string | null;
  pix_receiver_name: string;
  pix_receiver_city: string;
} | null;

function SettingsForm({ settings, onDone }: { settings: Settings; onDone: () => void }) {
  const [form, setForm] = useState({
    fixed: String((settings?.charge_fixed_fee_cents ?? 50) / 100),
    percent: String(settings?.charge_percent_fee ?? 0),
    withdrawal: String((settings?.withdrawal_fee_cents ?? 500) / 100),
    min: String((settings?.min_withdrawal_cents ?? 1000) / 100),
    key: settings?.pix_receiver_key ?? "",
    name: settings?.pix_receiver_name ?? "AURUMBOT",
    city: settings?.pix_receiver_city ?? "SAO PAULO",
  });

  const pixKeyCheck = validatePixKey(form.key);

  const save = useMutation({
    mutationFn: async () => {
      if (form.key.trim() && !pixKeyCheck.valid) throw new Error(`Chave PIX inválida: ${pixKeyCheck.error}`);
      const result = await saveFinanceSettings({
        data: {
          chargeFixedFeeCents: Math.round(Number(form.fixed.replace(",", ".")) * 100),
          chargePercentFee: Number(form.percent.replace(",", ".")),
          withdrawalFeeCents: Math.round(Number(form.withdrawal.replace(",", ".")) * 100),
          minWithdrawalCents: Math.round(Number(form.min.replace(",", ".")) * 100),
          pixReceiverKey: pixKeyCheck.valid ? pixKeyCheck.key : null,
          pixReceiverName: form.name.trim(),
          pixReceiverCity: form.city.trim(),
        },
      });
      if (!result.ok) throw new Error(result.message);
    },
    onSuccess: () => {
      toast.success("Configurações salvas");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fields: { key: keyof typeof form; label: string }[] = [
    { key: "fixed", label: "Taxa fixa por cobrança (R$)" },
    { key: "percent", label: "Taxa percentual (%)" },
    { key: "withdrawal", label: "Taxa de saque (R$)" },
    { key: "min", label: "Saque mínimo (R$)" },
    { key: "key", label: "Chave PIX de recebimento" },
    { key: "name", label: "Nome do recebedor" },
    { key: "city", label: "Cidade do recebedor" },
  ];

  return (
    <div className="panel max-w-2xl p-5">
      <p className="text-sm font-medium">Configurações da gateway</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className="space-y-2">
            <Label htmlFor={`fs-${f.key}`}>{f.label}</Label>
            <Input
              id={`fs-${f.key}`}
              maxLength={140}
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
            {f.key === "key" && form.key.trim() ? (
              pixKeyCheck.valid ? (
                <p className="text-xs text-emerald-500">Chave válida — os BR Codes serão gerados normalmente.</p>
              ) : (
                <p className="text-xs text-destructive">{pixKeyCheck.error}</p>
              )
            ) : null}
          </div>
        ))}
      </div>

      <Button className="mt-4" disabled={save.isPending} onClick={() => save.mutate()}>
        Salvar configurações
      </Button>
    </div>
  );
}
