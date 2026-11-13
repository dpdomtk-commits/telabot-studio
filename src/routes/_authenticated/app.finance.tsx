import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Copy, Wallet, Clock, ArrowDownToLine, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { getFinanceFees, requestWithdrawal } from "@/lib/finance.functions";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { validatePixCode } from "@/lib/payments/pix";
import {
  formatBRL,

  formatDate,
  formatDay,
  ledgerTypeLabels,
  paymentStatusLabels,
  pixKeyTypeLabels,
  withdrawalStatusLabels,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/finance")({
  head: () => ({
    meta: [
      { title: "Financeiro | Chef Bot" },
      {
        name: "description",
        content: "Carteira interna, cobranças PIX, extrato financeiro e saques dos seus bots.",
      },
      { property: "og:title", content: "Financeiro | Chef Bot" },
      { property: "og:description", content: "Carteira, extrato e saques da sua gateway nativa Chef Bot." },
    ],
  }),
  component: FinancePage,
});

type Wallet = {
  available_cents: number;
  pending_cents: number;
  blocked_cents: number;
  total_received_cents: number;
  total_withdrawn_cents: number;
  total_fees_cents: number;
};

function toCents(value: string) {
  return Math.round(Number(value.replace(",", ".")) * 100);
}

function FinancePage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["finance"],
    queryFn: async () => {
      const since = new Date(Date.now() - 29 * 86400000);
      since.setHours(0, 0, 0, 0);
      const [wallet, ledger, charges, withdrawals, settings] = await Promise.all([
        supabase.from("wallets").select("*").maybeSingle(),
        supabase
          .from("ledger_entries")
          .select("id,type,status,amount_cents,fee_cents,net_cents,description,created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("payments")
          .select("id,amount_cents,fee_cents,net_cents,status,description,product_name,pix_code,expires_at,created_at,paid_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("withdrawals")
          .select("id,amount_cents,fee_cents,net_cents,status,pix_key,pix_key_type,rejection_reason,created_at")
          .order("created_at", { ascending: false })
          .limit(50),
        getFinanceFees(),
      ]);
      return {
        wallet: (wallet.data ?? {
          available_cents: 0,
          pending_cents: 0,
          blocked_cents: 0,
          total_received_cents: 0,
          total_withdrawn_cents: 0,
          total_fees_cents: 0,
        }) as Wallet,
        ledger: ledger.data ?? [],
        charges: charges.data ?? [],
        withdrawals: withdrawals.data ?? [],
        settings,
        since: since.toISOString(),
      };
    },
  });

  const wallet = data?.wallet;
  const received = (data?.ledger ?? []).filter((l) => l.type === "payment_in" && l.status === "completed");
  const todayKey = new Date().toISOString().slice(0, 10);
  const monthKey = todayKey.slice(0, 7);
  const todayTotal = received
    .filter((l) => l.created_at.slice(0, 10) === todayKey)
    .reduce((s, l) => s + l.net_cents, 0);
  const monthTotal = received
    .filter((l) => l.created_at.slice(0, 7) === monthKey)
    .reduce((s, l) => s + l.net_cents, 0);

  const daily: { day: string; valor: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    daily.push({
      day: formatDay(d.toISOString()),
      valor:
        received.filter((l) => l.created_at.slice(0, 10) === key).reduce((s, l) => s + l.net_cents, 0) /
        100,
    });
  }

  const monthly: { key: string; label: string; total: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthly.push({
      key,
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      total: received.filter((l) => l.created_at.slice(0, 7) === key).reduce((s, l) => s + l.net_cents, 0),
    });
  }

  const cards = [
    { label: "Saldo disponível", value: formatBRL(wallet?.available_cents ?? 0), icon: Wallet },
    { label: "Saldo pendente", value: formatBRL(wallet?.pending_cents ?? 0), icon: Clock },
    { label: "Recebido hoje", value: formatBRL(todayTotal), icon: TrendingUp },
    { label: "Recebido no mês", value: formatBRL(monthTotal), icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Sua carteira interna, saldo, recebimentos PIX e solicitação de saques."
      />

      {/* Banner Gateway Nativa Ativa */}
      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-purple-950/30 to-black p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
            <Wallet className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-sm">Gateway Interna Chef Bot (PIX Automático)</h3>
              <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                Ativa e Conectada
              </Badge>
            </div>
            <p className="text-xs text-zinc-400">
              Todas as cobranças dos seus bots são geradas e confirmadas automaticamente pela gateway nativa.
            </p>
          </div>
        </div>
      </div>

      {/* Cards de Saldo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="panel p-5 border-white/10 bg-[#0e0e11]/80 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-zinc-400">{c.label}</span>
              <c.icon className="size-4 text-cyan-400" />
            </div>
            {isLoading ? (
              <Skeleton className="mt-3 h-8 w-24" />
            ) : (
              <p className="mt-2 font-display text-2xl font-black text-white">{c.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* PEDIR SAQUE VIA PIX NA MESMA TELA */}
      <div className="rounded-2xl border border-white/10 bg-[#0e0e11]/80 p-6 backdrop-blur shadow-xl">
        <WithdrawalForm
          available={wallet?.available_cents ?? 0}
          feeCents={data?.settings?.withdrawal_fee_cents ?? 500}
          minCents={data?.settings?.min_withdrawal_cents ?? 1000}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["finance"] });
            qc.invalidateQueries({ queryKey: ["notifications"] });
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total recebido", value: wallet?.total_received_cents ?? 0 },
          { label: "Total sacado", value: wallet?.total_withdrawn_cents ?? 0 },
          { label: "Total de taxas", value: wallet?.total_fees_cents ?? 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/5 bg-[#0e0e11]/60 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">{s.label}</p>
            <p className="mt-1 font-display text-lg font-bold text-white">{formatBRL(s.value)}</p>
          </div>
        ))}
      </div>

      <div className="panel p-5 border-white/10 bg-[#0e0e11]/80 backdrop-blur">
        <p className="text-sm font-semibold text-white">Recebimentos dos últimos 30 dias</p>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily}>
              <defs>
                <linearGradient id="gFin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d2ff" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "#0d0e14",
                  border: "1px solid rgba(6,182,212,0.3)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#fff",
                }}
              />
              <Area type="monotone" dataKey="valor" stroke="#00d2ff" fill="url(#gFin)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {monthly.map((m) => (
            <div key={m.key} className="rounded-lg border border-white/5 bg-black/40 p-3">
              <p className="text-xs capitalize text-zinc-400">{m.label}</p>
              <p className="mt-1 font-display text-base font-bold text-white">{formatBRL(m.total)}</p>
            </div>
          ))}
        </div>
      </div>

      <Tabs defaultValue="charges" className="mt-6">
        <TabsList className="bg-zinc-900 border border-white/5">
          <TabsTrigger value="charges" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
            Cobranças & Vendas
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
            Histórico de Saques PIX
          </TabsTrigger>
          <TabsTrigger value="ledger" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
            Extrato Detalhado
          </TabsTrigger>
        </TabsList>

        <TabsContent value="charges" className="mt-4">
          <ChargesTable charges={data?.charges ?? []} />
        </TabsContent>

        <TabsContent value="ledger" className="mt-4">
          {(data?.ledger.length ?? 0) === 0 ? (
            <EmptyState title="Extrato vazio" description="Movimentações financeiras aparecem aqui." />
          ) : (
            <div className="panel overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Taxa</TableHead>
                    <TableHead>Líquido</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.ledger.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-muted-foreground">{formatDate(l.created_at)}</TableCell>
                      <TableCell>{ledgerTypeLabels[l.type] ?? l.type}</TableCell>
                      <TableCell className="text-muted-foreground">{l.description ?? "—"}</TableCell>
                      <TableCell>{formatBRL(l.amount_cents)}</TableCell>
                      <TableCell>{formatBRL(l.fee_cents)}</TableCell>
                      <TableCell className={l.net_cents < 0 ? "text-destructive" : ""}>
                        {formatBRL(l.net_cents)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={l.status === "completed" ? "default" : "secondary"}>
                          {l.status === "completed" ? "Concluído" : l.status === "pending" ? "Pendente" : "Estornado"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="withdrawals" className="mt-4 space-y-4">
          <WithdrawalForm
            available={wallet?.available_cents ?? 0}
            feeCents={data?.settings?.withdrawal_fee_cents ?? 500}
            minCents={data?.settings?.min_withdrawal_cents ?? 1000}
            onDone={() => {
              qc.invalidateQueries({ queryKey: ["finance"] });
              qc.invalidateQueries({ queryKey: ["notifications"] });
            }}
          />
          {(data?.withdrawals.length ?? 0) === 0 ? (
            <EmptyState title="Nenhum saque" description="Suas solicitações de saque aparecem aqui." />
          ) : (
            <div className="panel overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Chave PIX</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Taxa</TableHead>
                    <TableHead>Líquido</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.withdrawals.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="text-muted-foreground">{formatDate(w.created_at)}</TableCell>
                      <TableCell>
                        {w.pix_key}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {pixKeyTypeLabels[w.pix_key_type] ?? w.pix_key_type}
                        </span>
                      </TableCell>
                      <TableCell>{formatBRL(w.amount_cents)}</TableCell>
                      <TableCell>{formatBRL(w.fee_cents)}</TableCell>
                      <TableCell>{formatBRL(w.net_cents)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            w.status === "paid" ? "default" : w.status === "rejected" ? "destructive" : "secondary"
                          }
                          title={w.rejection_reason ?? undefined}
                        >
                          {withdrawalStatusLabels[w.status] ?? w.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

type Charge = {
  id: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  status: string;
  description: string | null;
  product_name: string | null;
  pix_code: string | null;
  expires_at: string | null;
  created_at: string;
  paid_at: string | null;
};

function ChargesTable({ charges }: { charges: Charge[] }) {
  const [selected, setSelected] = useState<Charge | null>(null);

  if (charges.length === 0) {
    return <EmptyState title="Nenhuma cobrança" description="Cobranças PIX geradas pelos fluxos aparecem aqui." />;
  }

  return (
    <div className="space-y-4">
      <div className="panel overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Taxa</TableHead>
              <TableHead>Líquido</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead className="text-right">PIX</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {charges.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.product_name ?? c.description ?? "—"}</TableCell>
                <TableCell>{formatBRL(c.amount_cents)}</TableCell>
                <TableCell>{formatBRL(c.fee_cents ?? 0)}</TableCell>
                <TableCell>{formatBRL(c.net_cents ?? 0)}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      c.status === "approved" ? "default" : c.status === "pending" ? "secondary" : "outline"
                    }
                  >
                    {paymentStatusLabels[c.status] ?? c.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="secondary" disabled={!c.pix_code} onClick={() => setSelected(c)}>
                    Ver QR Code
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {selected?.pix_code ? <PixCard charge={selected} /> : null}
    </div>
  );
}

function PixCard({ charge }: { charge: Charge }) {
  const [qr, setQr] = useState<string>("");
  const code = charge.pix_code ?? "";
  // QR Code e copia e cola saem exatamente do mesmo BR Code validado.
  const check = validatePixCode(code);

  useEffect(() => {
    let active = true;
    if (!check.valid) {
      setQr("");
      return;
    }
    QRCode.toDataURL(code, { margin: 1, width: 220 })
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => setQr(""));
    return () => {
      active = false;
    };
  }, [code, check.valid]);

  if (!check.valid) {
    return (
      <div className="panel space-y-2 border-destructive/40 p-5">
        <p className="font-display text-lg font-bold text-destructive">BR Code inválido</p>
        <p className="text-sm text-muted-foreground">
          Esta cobrança não gerou um código PIX válido e seria recusada pelo banco. Revise a chave PIX do gateway e
          gere a cobrança novamente.
        </p>
        <ul className="list-inside list-disc text-xs text-destructive">
          {check.errors.map((e: string) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="panel flex flex-col items-start gap-4 p-5 sm:flex-row">
      {qr ? (
        <img src={qr} alt={`QR Code PIX de ${charge.product_name ?? "cobrança"}`} className="rounded-md" />
      ) : (
        <Skeleton className="size-[220px]" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-bold">{charge.product_name ?? charge.description}</p>
        <p className="text-sm text-muted-foreground">{formatBRL(charge.amount_cents)}</p>
        {charge.expires_at ? (
          <p className="mt-1 text-xs text-muted-foreground">Expira em {formatDate(charge.expires_at)}</p>
        ) : null}
        <p className="mt-3 break-all rounded-md border border-border p-3 font-mono text-xs">{code}</p>
        <Button
          size="sm"
          className="mt-3"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            toast.success("Código PIX copiado");
          }}
        >
          <Copy /> Copiar código
        </Button>
      </div>
    </div>
  );
}


function WithdrawalForm({
  available,
  feeCents,
  minCents,
  onDone,
}: {
  available: number;
  feeCents: number;
  minCents: number;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cpf");

  const submit = useMutation({
    mutationFn: async () => {
      const cents = toCents(amount);
      if (!Number.isFinite(cents) || cents < minCents) {
        throw new Error(`Valor mínimo de saque: ${formatBRL(minCents)}`);
      }
      if (cents > available) throw new Error("Saldo disponível insuficiente");
      const result = await requestWithdrawal({
        data: {
          amountCents: cents,
          pixKey: pixKey.trim(),
          pixKeyType: pixKeyType as "cpf" | "cnpj" | "email" | "phone" | "random",
        },
      });
      if (!result.ok) throw new Error(result.message);
    },
    onSuccess: () => {
      toast.success("Saque solicitado — aguardando aprovação");
      setAmount("");
      setPixKey("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cents = amount ? toCents(amount) : 0;

  return (
    <div className="panel p-5">
      <p className="text-sm font-medium">Solicitar saque</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Disponível: {formatBRL(available)} · Taxa de saque: {formatBRL(feeCents)} · Mínimo: {formatBRL(minCents)}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="wd-amount">Valor (R$)</Label>
          <Input
            id="wd-amount"
            inputMode="decimal"
            maxLength={12}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100,00"
          />
        </div>
        <div className="space-y-2">
          <Label>Tipo de chave</Label>
          <Select value={pixKeyType} onValueChange={setPixKeyType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(pixKeyTypeLabels).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wd-key">Chave PIX</Label>
          <Input
            id="wd-key"
            maxLength={140}
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            placeholder="sua chave PIX"
          />
        </div>
        <div className="flex items-end">
          <Button
            className="w-full"
            disabled={submit.isPending || !amount || pixKey.trim().length < 4}
            onClick={() => submit.mutate()}
          >
            <ArrowDownToLine /> Solicitar
          </Button>
        </div>
      </div>
      {cents > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Você receberá {formatBRL(Math.max(cents - feeCents, 0))} após a taxa de saque.
        </p>
      ) : null}
    </div>
  );
}

