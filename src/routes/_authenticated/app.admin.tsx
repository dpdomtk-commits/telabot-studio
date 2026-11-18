import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  Lock,
  Search,
  Send,
  ShieldAlert,
  Unlock,
  Wallet as WalletIcon,
  XCircle,
} from "lucide-react";
import { useIsAdmin } from "@/routes/_authenticated/app";
import {
  adjustWallet,
  getAdminOverviewData,
  resolveWithdrawal,
  setUserBlocked,
  type AdminWithdrawalRow,
} from "@/lib/finance.functions";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatBRL,
  formatDate,
  paymentStatusLabels,
  pixKeyTypeLabels,
  withdrawalStatusLabels,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/admin")({
  head: () => ({
    meta: [
      { title: "Painel Admin & Saques | CASH BOT" },
      {
        name: "description",
        content: "Processamento manual de saques, usuários, carteiras, bots, leads e logs globais.",
      },
      { property: "og:title", content: "Painel Admin & Saques | CASH BOT" },
      { property: "og:description", content: "Painel administrativo exclusivo do CASH BOT." },
    ],
  }),
  component: AdminPage,
});

function copyText(text: string, label: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`${label} copiado!`))
      .catch(() => toast.error("Não foi possível copiar."));
  }
}

function List({ rows }: { rows: { id: string; primary: string; secondary: string }[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Sem registros" description="Nada para exibir por aqui ainda." />;
  }
  return (
    <div className="panel divide-y divide-border">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
          <span className="truncate">{r.primary}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{r.secondary}</span>
        </div>
      ))}
    </div>
  );
}

function AdminPage() {
  const { data: isAdmin, isLoading: checkingAdmin } = useIsAdmin();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<"all" | "review" | "approved" | "paid" | "rejected">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [rejectTarget, setRejectTarget] = useState<AdminWithdrawalRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [adjustTargetUser, setAdjustTargetUser] = useState<{ id: string; label: string } | null>(null);
  const [adjustReais, setAdjustReais] = useState("");
  const [adjustDesc, setAdjustDesc] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    enabled: !!isAdmin,
    refetchInterval: 15_000,
    queryFn: () => getAdminOverviewData(),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
    qc.invalidateQueries({ queryKey: ["admin-finance"] });
  };

  const resolve = useMutation({
    mutationFn: async (vars: { withdrawalId: string; status: "approved" | "paid" | "rejected"; reason?: string }) => {
      const result = await resolveWithdrawal({ data: vars });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (msg) => {
      toast.success(msg);
      setRejectTarget(null);
      setRejectReason("");
      refreshAll();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const blockUser = useMutation({
    mutationFn: async (vars: { userId: string; blocked: boolean }) => {
      const result = await setUserBlocked({ data: vars });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (msg) => {
      toast.success(msg);
      refreshAll();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const adjustBalance = useMutation({
    mutationFn: async (vars: { userId: string; amountCents: number; description: string }) => {
      const result = await adjustWallet({ data: vars });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (msg) => {
      toast.success(msg);
      setAdjustTargetUser(null);
      setAdjustReais("");
      setAdjustDesc("");
      refreshAll();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (checkingAdmin) return <Skeleton className="h-64 w-full" />;

  if (!isAdmin) {
    return (
      <div className="panel mx-auto max-w-lg p-8 text-center space-y-4">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
          <ShieldAlert className="size-6" />
        </div>
        <h2 className="text-xl font-bold text-white">Acesso Restrito</h2>
        <p className="text-sm text-zinc-400">
          O Painel Admin é visível e acessível apenas para a conta administrativa autorizada.
        </p>
        <Button asChild>
          <Link to="/app/dashboard">Voltar ao Painel</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const profiles = data?.profiles ?? [];
  const wallets = data?.wallets ?? [];
  const withdrawals = data?.withdrawals ?? [];
  const payments = data?.payments ?? [];

  const profileOf = (userId: string) => profiles.find((p) => p.id === userId);
  const walletOf = (userId: string) => wallets.find((w) => w.user_id === userId);

  const pendingWithdrawals = withdrawals.filter((w) => w.status === "review" || w.status === "approved");
  const pendingNetCents = pendingWithdrawals.reduce((sum, w) => sum + (w.net_cents || 0), 0);
  const paidWithdrawals = withdrawals.filter((w) => w.status === "paid");
  const paidNetCents = paidWithdrawals.reduce((sum, w) => sum + (w.net_cents || 0), 0);
  const approvedGrossCents = payments
    .filter((p) => p.status === "approved")
    .reduce((sum, p) => sum + (p.amount_cents || 0), 0);
  const totalFeeCents = payments
    .filter((p) => p.status === "approved")
    .reduce((sum, p) => sum + (p.fee_cents || 0), 0);

  const filteredWithdrawals = withdrawals.filter((w) => {
    if (statusFilter !== "all" && w.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const prof = profileOf(w.user_id);
    return (
      w.pix_key.toLowerCase().includes(q) ||
      w.id.toLowerCase().includes(q) ||
      w.user_id.toLowerCase().includes(q) ||
      (prof?.full_name || "").toLowerCase().includes(q) ||
      (prof?.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel Admin & Processamento de Saques"
        description="Gestão exclusiva (dpz09@hotmail.com e dpdomtk@gmail.com): aprove e transfira manualmente todos os pedidos de saque via PIX."
      />

      {/* Resumo Financeiro da Plataforma */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/15 p-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-amber-300">
            <span>Saques Pendentes</span>
            <Clock className="size-4" />
          </div>
          <p className="mt-2 font-display text-2xl font-black text-white">
            {formatBRL(pendingNetCents)}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {pendingWithdrawals.length} solicitação(ões) aguardando PIX manual
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/15 p-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-emerald-300">
            <span>Saques Pagos</span>
            <CheckCircle2 className="size-4" />
          </div>
          <p className="mt-2 font-display text-2xl font-black text-white">
            {formatBRL(paidNetCents)}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {paidWithdrawals.length} transferência(s) concluída(s)
          </p>
        </div>

        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/15 p-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-cyan-300">
            <span>Volume Bruto Aprovado</span>
            <DollarSign className="size-4" />
          </div>
          <p className="mt-2 font-display text-2xl font-black text-white">
            {formatBRL(approvedGrossCents)}
          </p>
          <p className="mt-1 text-xs text-zinc-400">Total processado pelos usuários</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0e0e11]/80 p-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-zinc-400">
            <span>Receita em Taxas</span>
            <WalletIcon className="size-4 text-cyan-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-black text-white">
            {formatBRL(totalFeeCents)}
          </p>
          <p className="mt-1 text-xs text-zinc-400">{profiles.length} usuário(s) cadastrados</p>
        </div>
      </div>

      <Tabs defaultValue="withdrawals">
        <TabsList className="flex-wrap h-auto bg-zinc-900 border border-white/5 p-1">
          <TabsTrigger value="withdrawals">
            Pedidos de Saque ({pendingWithdrawals.length > 0 ? `${pendingWithdrawals.length} pendentes` : withdrawals.length})
          </TabsTrigger>
          <TabsTrigger value="wallets">Carteiras ({wallets.length})</TabsTrigger>
          <TabsTrigger value="users">Usuários ({profiles.length})</TabsTrigger>
          <TabsTrigger value="bots">Bots ({data?.bots.length ?? 0})</TabsTrigger>
          <TabsTrigger value="leads">Leads ({data?.leads.length ?? 0})</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos ({payments.length})</TabsTrigger>
          <TabsTrigger value="logs">Logs ({data?.logs.length ?? 0})</TabsTrigger>
        </TabsList>

        {/* ABA 1: PEDIDOS DE SAQUE PARA PROCESSAMENTO MANUAL */}
        <TabsContent value="withdrawals" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#09090E]/90 p-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "all", label: `Todos (${withdrawals.length})` },
                  {
                    id: "review",
                    label: `Em Análise (${withdrawals.filter((w) => w.status === "review").length})`,
                  },
                  {
                    id: "approved",
                    label: `Aprovados (${withdrawals.filter((w) => w.status === "approved").length})`,
                  },
                  { id: "paid", label: `Pagos (${paidWithdrawals.length})` },
                  {
                    id: "rejected",
                    label: `Recusados (${withdrawals.filter((w) => w.status === "rejected").length})`,
                  },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    statusFilter === f.id
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      : "bg-black/40 text-zinc-400 border border-white/5 hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="size-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome, email ou chave PIX..."
                className="pl-8 h-8 text-xs bg-black/50 border-white/10 text-white"
              />
            </div>
          </div>

          {filteredWithdrawals.length === 0 ? (
            <EmptyState
              title="Nenhum pedido de saque encontrado"
              description="Quando os usuários solicitarem saque pelo painel Financeiro, todas as informações aparecerão aqui."
            />
          ) : (
            <div className="space-y-4">
              {filteredWithdrawals.map((w) => {
                const prof = profileOf(w.user_id);
                const wal = walletOf(w.user_id);
                const netDecimal = (w.net_cents / 100).toFixed(2).replace(".", ",");
                const pixTypeLabel = pixKeyTypeLabels[w.pix_key_type] ?? w.pix_key_type;
                const statusLabel = withdrawalStatusLabels[w.status] ?? w.status;

                return (
                  <div
                    key={w.id}
                    className={`rounded-2xl border p-5 space-y-4 transition ${
                      w.status === "review"
                        ? "border-amber-500/40 bg-amber-950/10"
                        : w.status === "approved"
                          ? "border-cyan-500/40 bg-cyan-950/10"
                          : w.status === "paid"
                            ? "border-emerald-500/25 bg-[#09090E]/90"
                            : "border-red-500/25 bg-[#09090E]/80"
                    }`}
                  >
                    {/* Cabeçalho do pedido */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-white text-base">
                            {prof?.full_name || prof?.email || "Usuário sem nome"}
                          </span>
                          <Badge
                            variant={
                              w.status === "paid"
                                ? "default"
                                : w.status === "rejected"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {statusLabel}
                          </Badge>
                          {prof?.is_blocked && <Badge variant="destructive">Conta Bloqueada</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                          <span>E-mail: <strong className="text-zinc-200">{prof?.email || "—"}</strong></span>
                          <span>•</span>
                          <span>Pedido: <code className="text-zinc-300">{w.id.slice(0, 8)}</code></span>
                          <span>•</span>
                          <span>Solicitado em: <strong className="text-zinc-300">{formatDate(w.created_at)}</strong></span>
                          {w.ip_address && (
                            <>
                              <span>•</span>
                              <span>IP: <code className="text-zinc-400">{w.ip_address}</code></span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-[11px] uppercase tracking-wider text-zinc-400">
                          Valor Líquido a Transferir
                        </span>
                        <div className="flex items-center sm:justify-end gap-2 mt-0.5">
                          <span className="font-display text-2xl font-black text-emerald-400">
                            {formatBRL(w.net_cents)}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => copyText(netDecimal, "Valor líquido")}
                            className="h-7 px-2 text-[11px] border-white/10"
                          >
                            <Copy className="size-3 mr-1" /> Copiar R$
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Grid com Dados Bancários PIX + Valores + Carteira do Usuário */}
                    <div className="grid gap-3 md:grid-cols-3">
                      {/* Box Chave PIX */}
                      <div className="rounded-xl border border-cyan-500/25 bg-black/50 p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
                            Chave PIX Destino ({pixTypeLabel})
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => copyText(w.pix_key, "Chave PIX")}
                            className="h-6 px-2 text-[11px] text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/10"
                          >
                            <Copy className="size-3 mr-1" /> Copiar Chave
                          </Button>
                        </div>
                        <p className="font-mono text-sm font-bold text-white break-all select-all bg-zinc-900/90 px-2.5 py-2 rounded-lg border border-white/5">
                          {w.pix_key}
                        </p>
                      </div>

                      {/* Box Resumo Financeiro do Pedido */}
                      <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 space-y-1.5 text-xs">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                          Detalhamento do Saque
                        </span>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Valor bruto solicitado:</span>
                          <span className="font-semibold text-white">{formatBRL(w.amount_cents)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Taxa descontada:</span>
                          <span className="font-semibold text-amber-300">- {formatBRL(w.fee_cents)}</span>
                        </div>
                        <div className="flex justify-between border-t border-white/10 pt-1.5">
                          <span className="font-bold text-zinc-200">Líquido para envio PIX:</span>
                          <span className="font-black text-emerald-400">{formatBRL(w.net_cents)}</span>
                        </div>
                      </div>

                      {/* Box Auditoria da Carteira do Usuário */}
                      <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 space-y-1.5 text-xs">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                          Carteira do Solicitante
                        </span>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Saldo disponível atual:</span>
                          <span className="font-semibold text-white">
                            {formatBRL(wal?.available_cents ?? 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Saldo bloqueado:</span>
                          <span className="font-semibold text-amber-300">
                            {formatBRL(wal?.blocked_cents ?? 0)}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-white/10 pt-1.5">
                          <span className="text-zinc-400">Total recebido (Vendas):</span>
                          <span className="font-semibold text-cyan-300">
                            {formatBRL(wal?.total_received_cents ?? 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {w.rejection_reason && (
                      <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-3.5 py-2 text-xs text-red-300">
                        <strong>Motivo da recusa:</strong> {w.rejection_reason}
                      </div>
                    )}

                    {/* Ações manuais */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="text-[11px] text-zinc-500">
                        ID Usuário: <code>{w.user_id}</code>
                        {w.reviewed_at ? ` · Revisado em ${formatDate(w.reviewed_at)}` : ""}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {w.status === "review" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={resolve.isPending}
                            onClick={() => resolve.mutate({ withdrawalId: w.id, status: "approved" })}
                          >
                            <CheckCircle2 className="size-3.5 mr-1.5" /> Aprovar
                          </Button>
                        )}
                        {(w.status === "review" || w.status === "approved") && (
                          <Button
                            size="sm"
                            disabled={resolve.isPending}
                            onClick={() => resolve.mutate({ withdrawalId: w.id, status: "paid" })}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                          >
                            <Send className="size-3.5 mr-1.5" /> Confirmar PIX Enviado (Marcar Pago)
                          </Button>
                        )}
                        {w.status !== "paid" && w.status !== "rejected" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={resolve.isPending}
                            onClick={() => {
                              setRejectTarget(w);
                              setRejectReason("");
                            }}
                          >
                            <XCircle className="size-3.5 mr-1.5" /> Recusar / Estornar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ABA 2: CARTEIRAS & AJUSTE DE SALDO */}
        <TabsContent value="wallets" className="mt-4">
          {wallets.length === 0 ? (
            <EmptyState title="Sem carteiras" description="Nenhuma carteira encontrada." />
          ) : (
            <div className="panel divide-y divide-border">
              {wallets.map((wal) => {
                const prof = profileOf(wal.user_id);
                const label = prof?.full_name ?? prof?.email ?? wal.user_id.slice(0, 8);
                return (
                  <div
                    key={wal.user_id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 text-sm"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{label}</span>
                        {prof?.email && <span className="text-xs text-zinc-400">({prof.email})</span>}
                        {prof?.is_blocked && <Badge variant="destructive">Bloqueado</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
                        <span>Disponível: <strong className="text-emerald-400">{formatBRL(wal.available_cents)}</strong></span>
                        <span>Bloqueado: <strong className="text-amber-300">{formatBRL(wal.blocked_cents)}</strong></span>
                        <span>Recebido: <strong className="text-white">{formatBRL(wal.total_received_cents)}</strong></span>
                        <span>Sacado: <strong className="text-zinc-300">{formatBRL(wal.total_withdrawn_cents)}</strong></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAdjustTargetUser({ id: wal.user_id, label });
                          setAdjustReais("");
                          setAdjustDesc("");
                        }}
                      >
                        Ajustar Saldo
                      </Button>
                      <Button
                        size="sm"
                        variant={prof?.is_blocked ? "secondary" : "destructive"}
                        disabled={blockUser.isPending}
                        onClick={() => blockUser.mutate({ userId: wal.user_id, blocked: !prof?.is_blocked })}
                      >
                        {prof?.is_blocked ? (
                          <>
                            <Unlock className="size-3.5 mr-1" /> Desbloquear
                          </>
                        ) : (
                          <>
                            <Lock className="size-3.5 mr-1" /> Bloquear
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ABA 3: USUÁRIOS */}
        <TabsContent value="users" className="mt-4">
          {profiles.length === 0 ? (
            <EmptyState title="Sem usuários" description="Nenhum usuário encontrado." />
          ) : (
            <div className="panel divide-y divide-border">
              {profiles.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">
                      {p.full_name ?? p.email ?? "Sem nome"}
                      {p.is_blocked && (
                        <Badge variant="destructive" className="ml-2">
                          Bloqueado
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-zinc-400 truncate">
                      {p.email || "Sem e-mail"} · ID: {p.id.slice(0, 8)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">{formatDate(p.created_at)}</span>
                    <Button
                      size="sm"
                      variant={p.is_blocked ? "secondary" : "outline"}
                      disabled={blockUser.isPending}
                      onClick={() => blockUser.mutate({ userId: p.id, blocked: !p.is_blocked })}
                    >
                      {p.is_blocked ? "Liberar" : "Bloquear"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bots" className="mt-4">
          <List
            rows={(data?.bots ?? []).map((b) => ({
              id: b.id,
              primary: `${b.name} · ${b.status === "active" ? "Ativo" : "Inativo"}`,
              secondary: formatDate(b.created_at),
            }))}
          />
        </TabsContent>

        <TabsContent value="leads" className="mt-4">
          <List
            rows={(data?.leads ?? []).map((l) => ({
              id: l.id,
              primary: l.name ?? String(l.telegram_id ?? "—"),
              secondary: formatDate(l.created_at),
            }))}
          />
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <List
            rows={payments.map((p) => ({
              id: p.id,
              primary: `${formatBRL(p.amount_cents)} · ${paymentStatusLabels[p.status] ?? p.status} · ${profileOf(p.user_id)?.email ?? p.user_id.slice(0, 8)}`,
              secondary: formatDate(p.created_at),
            }))}
          />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <List
            rows={(data?.logs ?? []).map((l) => ({
              id: l.id,
              primary: `${l.entity} · ${l.action}`,
              secondary: formatDate(l.created_at),
            }))}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog: Recusar Saque */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="bg-[#09090E] border-white/15 text-white">
          <DialogHeader>
            <DialogTitle>Recusar e Estornar Saque</DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              O valor bloqueado será devolvido para a carteira do usuário. Informe um motivo opcional.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Motivo da recusa (opcional)</Label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex: Chave PIX incorreta ou divergente do titular"
              className="bg-black/50 border-white/10 text-white"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={resolve.isPending || !rejectTarget}
              onClick={() => {
                if (!rejectTarget) return;
                resolve.mutate({
                  withdrawalId: rejectTarget.id,
                  status: "rejected",
                  ...(rejectReason.trim() ? { reason: rejectReason.trim() } : {}),
                });
              }}
            >
              Confirmar Recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Ajustar Saldo */}
      <Dialog open={!!adjustTargetUser} onOpenChange={(open) => !open && setAdjustTargetUser(null)}>
        <DialogContent className="bg-[#09090E] border-white/15 text-white">
          <DialogHeader>
            <DialogTitle>Ajustar Saldo Manualmente</DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Usuário: {adjustTargetUser?.label}. Valores negativos debitam o saldo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$, ex: 50,00 ou -25,00)</Label>
              <Input
                value={adjustReais}
                onChange={(e) => setAdjustReais(e.target.value)}
                placeholder="50,00"
                className="bg-black/50 border-white/10 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição / Motivo</Label>
              <Input
                value={adjustDesc}
                onChange={(e) => setAdjustDesc(e.target.value)}
                placeholder="Ex: Crédito manual referente a compensação"
                className="bg-black/50 border-white/10 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjustTargetUser(null)}>
              Cancelar
            </Button>
            <Button
              disabled={adjustBalance.isPending || !adjustTargetUser}
              onClick={() => {
                if (!adjustTargetUser) return;
                const amountCents = Math.round(Number(adjustReais.replace(",", ".")) * 100);
                if (!Number.isFinite(amountCents) || amountCents === 0) {
                  return toast.error("Informe um valor válido diferente de zero.");
                }
                if (adjustDesc.trim().length < 3) {
                  return toast.error("Informe uma descrição com pelo menos 3 caracteres.");
                }
                adjustBalance.mutate({
                  userId: adjustTargetUser.id,
                  amountCents,
                  description: adjustDesc.trim(),
                });
              }}
            >
              Confirmar Ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
