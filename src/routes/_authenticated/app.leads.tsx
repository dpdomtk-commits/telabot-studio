import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBots } from "./app.bots";
import {
  Download,
  ExternalLink,
  Search,
  Users,
  Trophy,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL, formatDate } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/leads")({
  head: () => ({
    meta: [
      { title: "Leads | CASH BOT" },
      { name: "description", content: "Todos os contatos capturados pelos seus bots do Telegram." },
      { property: "og:title", content: "Leads | CASH BOT" },
      { property: "og:description", content: "Todos os contatos capturados pelos seus bots." },
    ],
  }),
  component: LeadsPage,
});

type Lead = {
  id: string;
  name: string | null;
  telegram_id: number | null;
  telegram_username: string | null;
  status: string;
  created_at: string;
  bots: { name: string } | null;
};

const statusLabels: Record<string, string> = {
  new: "Novo",
  engaged: "Em conversa",
  converted: "Convertido",
};

function LeadsPage() {
  const { data: bots } = useBots();
  const [botId, setBotId] = useState("all");
  const [status, setStatus] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<"today" | "yesterday" | "7d" | "30d" | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ["leads", botId, status, from, to],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("id,name,telegram_id,telegram_username,status,created_at,bots(name)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (botId !== "all") q = q.eq("bot_id", botId);
      if (status !== "all") q = q.eq("status", status as "new" | "engaged" | "converted");
      if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      const [leadsRes, paymentsRes] = await Promise.all([
        q,
        supabase.from("payments").select("lead_id,amount_cents,status").limit(600),
      ]);
      if (leadsRes.error) throw leadsRes.error;
      return {
        leads: (leadsRes.data ?? []) as unknown as Lead[],
        payments: paymentsRes.data ?? [],
      };
    },
  });

  const paymentSummaryByLead = useMemo(() => {
    const map = new Map<string, { paidCents: number; paidCount: number; pendingCount: number }>();
    for (const p of leadsData?.payments ?? []) {
      if (!p.lead_id) continue;
      const cur = map.get(p.lead_id) ?? { paidCents: 0, paidCount: 0, pendingCount: 0 };
      if (p.status === "approved") {
        cur.paidCents += p.amount_cents || 0;
        cur.paidCount += 1;
      } else if (p.status === "pending") {
        cur.pendingCount += 1;
      }
      map.set(p.lead_id, cur);
    }
    return map;
  }, [leadsData?.payments]);

  const filteredLeads = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startYesterday = startToday - 86400000;
    const cutoff7d = now.getTime() - 7 * 86400000;
    const cutoff30d = now.getTime() - 30 * 86400000;
    const q = searchQuery.trim().toLowerCase();

    return (leadsData?.leads ?? []).filter((lead) => {
      const createdMs = new Date(lead.created_at).getTime();
      if (periodFilter === "today" && createdMs < startToday) return false;
      if (periodFilter === "yesterday" && (createdMs < startYesterday || createdMs >= startToday)) return false;
      if (periodFilter === "7d" && createdMs < cutoff7d) return false;
      if (periodFilter === "30d" && createdMs < cutoff30d) return false;
      if (!q) return true;
      return `${lead.name ?? ""} ${lead.telegram_username ?? ""} ${lead.telegram_id ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [leadsData?.leads, periodFilter, searchQuery]);

  const novosCount = filteredLeads.filter((l) => l.status === "new").length;
  const engagedCount = filteredLeads.filter((l) => l.status === "engaged").length;
  const pendingPixCount = filteredLeads.filter((l) => {
    const s = paymentSummaryByLead.get(l.id);
    return (s?.pendingCount ?? 0) > 0 && (s?.paidCount ?? 0) === 0;
  }).length;
  const convertedCount = filteredLeads.filter(
    (l) => l.status === "converted" || (paymentSummaryByLead.get(l.id)?.paidCount ?? 0) > 0,
  ).length;

  const rankedLeads = useMemo(() => {
    return [...filteredLeads]
      .filter((l) => (paymentSummaryByLead.get(l.id)?.paidCount ?? 0) > 0)
      .sort(
        (a, b) =>
          (paymentSummaryByLead.get(b.id)?.paidCents ?? 0) -
          (paymentSummaryByLead.get(a.id)?.paidCents ?? 0),
      );
  }, [filteredLeads, paymentSummaryByLead]);

  const renderLeadTable = (rows: Lead[]) =>
    rows.length === 0 ? (
      <EmptyState title="Nenhum cliente encontrado" description="Ajuste os filtros ou aguarde novas interações." />
    ) : (
      <div className="panel overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente / @Username</TableHead>
              <TableHead>Telegram ID</TableHead>
              <TableHead>Bot</TableHead>
              <TableHead>Compras / Total Gasto</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((lead) => {
              const sum = paymentSummaryByLead.get(lead.id);
              const initials = (lead.name || lead.telegram_username || "L").slice(0, 2).toUpperCase();
              const usernameClean = lead.telegram_username?.replace("@", "");
              return (
                <TableRow key={lead.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 shrink-0 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-[11px] font-bold text-cyan-300">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate">{lead.name ?? "Sem nome"}</p>
                        <p className="text-xs text-zinc-400 truncate">
                          {usernameClean ? `@${usernameClean}` : "Sem username"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{lead.telegram_id ?? "—"}</TableCell>
                  <TableCell className="text-xs">{lead.bots?.name ?? "—"}</TableCell>
                  <TableCell>
                    {sum && sum.paidCount > 0 ? (
                      <div>
                        <span className="font-bold text-emerald-400 text-xs">{formatBRL(sum.paidCents)}</span>
                        <span className="text-[11px] text-zinc-400 ml-1">({sum.paidCount}x)</span>
                      </div>
                    ) : sum && sum.pendingCount > 0 ? (
                      <Badge variant="outline" className="border-amber-500/30 text-amber-300 text-[10px]">
                        {sum.pendingCount} PIX pendente
                      </Badge>
                    ) : (
                      <span className="text-xs text-zinc-500">R$ 0,00</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        lead.status === "converted"
                          ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-400 font-medium"
                          : lead.status === "engaged"
                          ? "border-cyan-500/30 bg-cyan-950/20 text-cyan-300 font-medium"
                          : "border-zinc-800 bg-zinc-900/70 text-zinc-400 font-medium"
                      }
                    >
                      {statusLabels[lead.status] ?? lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{formatDate(lead.created_at)}</TableCell>
                  <TableCell className="text-right">
                    {usernameClean ? (
                      <Button size="sm" variant="outline" asChild className="h-7 text-xs border-white/10">
                        <a href={`https://t.me/${usernameClean}`} target="_blank" rel="noopener noreferrer">
                          Abrir Chat <ExternalLink className="size-3 ml-1" />
                        </a>
                      </Button>
                    ) : (
                      <span className="text-[11px] text-zinc-500">Privado</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Base de Clientes (Leads)"
        description="Gerencie todos os leads capturados, visualize o ranking de melhores compradores e controle acessos VIP."
        action={
          <Button
            variant="secondary"
            disabled={filteredLeads.length === 0}
            onClick={() =>
              downloadCsv(
                `leads-${new Date().toISOString().slice(0, 10)}.csv`,
                ["Nome", "Telegram ID", "Usuário", "Bot", "Situação", "Entrada"],
                filteredLeads.map((l) => [
                  l.name ?? "",
                  l.telegram_id ?? "",
                  l.telegram_username ?? "",
                  l.bots?.name ?? "",
                  statusLabels[l.status] ?? l.status,
                  formatDate(l.created_at),
                ]),
              )
            }
          >
            <Download /> Exportar CSV
          </Button>
        }
      />

      {/* 5 KPIs Estilo SharkBot */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-[#09090E]/90 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
            <Sparkles className="size-3 text-cyan-400" /> Novos (/start)
          </p>
          <p className="mt-1 font-display text-2xl font-black text-white">{novosCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#09090E]/90 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1">
            <MessageSquare className="size-3" /> Em Conversa
          </p>
          <p className="mt-1 font-display text-2xl font-black text-cyan-300">{engagedCount}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
            <Clock className="size-3" /> PIX Pendentes
          </p>
          <p className="mt-1 font-display text-2xl font-black text-amber-400">{pendingPixCount}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="size-3" /> Convertidos
          </p>
          <p className="mt-1 font-display text-2xl font-black text-emerald-400">{convertedCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#09090E]/90 p-4 col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
            <Users className="size-3 text-blue-400" /> Total de Leads
          </p>
          <p className="mt-1 font-display text-2xl font-black text-white">{filteredLeads.length}</p>
        </div>
      </div>

      {/* Filtros de Período e Busca */}
      <div className="panel p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "today", label: "Hoje" },
                { id: "yesterday", label: "Ontem" },
                { id: "7d", label: "7 dias" },
                { id: "30d", label: "30 dias" },
                { id: "all", label: "Tudo" },
              ] as const
            ).map((opt) => (
              <Button
                key={opt.id}
                type="button"
                size="sm"
                variant={periodFilter === opt.id ? "default" : "outline"}
                onClick={() => setPeriodFilter(opt.id)}
                className="text-xs h-8 border-white/10"
              >
                {opt.label}
              </Button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="size-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar nome, @usuario ou ID..."
              className="pl-8 h-8 text-xs bg-black/40 border-white/10"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-white/5">
          <div className="space-y-1.5">
            <Label className="text-xs">Bot</Label>
            <Select value={botId} onValueChange={setBotId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os bots</SelectItem>
                {bots?.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Situação</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Object.entries(statusLabels).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from" className="text-xs">De</Label>
            <Input id="from" type="date" className="h-8 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to" className="text-xs">Até</Label>
            <Input id="to" type="date" className="h-8 text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-44 w-full" />
      ) : (
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="bg-zinc-900 border border-white/5">
            <TabsTrigger value="all">
              <Users className="size-3.5 mr-1.5" /> Todos os Leads ({filteredLeads.length})
            </TabsTrigger>
            <TabsTrigger value="ranking">
              <Trophy className="size-3.5 mr-1.5 text-amber-400" /> Ranking de Clientes ({rankedLeads.length})
            </TabsTrigger>
            <TabsTrigger value="vip">
              <ShieldCheck className="size-3.5 mr-1.5 text-emerald-400" /> Controle de Acessos VIP ({rankedLeads.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">{renderLeadTable(filteredLeads)}</TabsContent>
          <TabsContent value="ranking">{renderLeadTable(rankedLeads)}</TabsContent>
          <TabsContent value="vip">{renderLeadTable(rankedLeads)}</TabsContent>
        </Tabs>
      )}
    </div>
  );
}

