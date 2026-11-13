import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BadgePercent, QrCode, Receipt, ShoppingBag, TimerOff, Users, Wallet } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { formatBRL, formatDate, formatDay } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | AURUMBOT" },
      { name: "description", content: "Acompanhe vendas, conversão, receita e ticket médio em tempo real." },
      { property: "og:title", content: "Dashboard | AURUMBOT" },
      { property: "og:description", content: "Vendas, conversão, receita e ticket médio da sua operação." },
    ],
  }),
  component: Dashboard,
});

const periods = [
  { key: "7", label: "7 dias", days: 7 },
  { key: "30", label: "30 dias", days: 30 },
  { key: "90", label: "90 dias", days: 90 },
  { key: "all", label: "Tudo", days: 3650 },
] as const;

type PeriodKey = (typeof periods)[number]["key"];

function Dashboard() {
  const [period, setPeriod] = useState<PeriodKey>("30");
  const days = periods.find((p) => p.key === period)?.days ?? 30;
  const since = useMemo(() => {
    const d = new Date(Date.now() - days * 86400000);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [days]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", period],
    refetchInterval: 20000,
    queryFn: async () => {
      const [payments, leads, logs] = await Promise.all([
        supabase
          .from("payments")
          .select("id,amount_cents,net_cents,status,created_at,product_name,description")
          .gte("created_at", since)
          .order("created_at", { ascending: false }),
        supabase
          .from("leads")
          .select("id,name,telegram_username,created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false }),
        supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(8),
      ]);

      const rows = payments.data ?? [];
      const leadRows = leads.data ?? [];
      const approved = rows.filter((p) => p.status === "approved");
      const expired = rows.filter((p) => p.status === "expired" || p.status === "cancelled");
      const revenue = approved.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
      const net = approved.reduce((sum, p) => sum + (p.net_cents ?? 0), 0);

      const chartDays: { day: string; leads: number; vendas: number }[] = [];
      const window = Math.min(days, 30);
      for (let i = window - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        d.setHours(0, 0, 0, 0);
        const key = d.toISOString().slice(0, 10);
        chartDays.push({
          day: formatDay(d.toISOString()),
          leads: leadRows.filter((l) => l.created_at.slice(0, 10) === key).length,
          vendas: approved.filter((p) => p.created_at.slice(0, 10) === key).length,
        });
      }

      const months: { key: string; label: string; total: number; count: number }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthRows = approved.filter((p) => p.created_at.slice(0, 7) === key);
        months.push({
          key,
          label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
          total: monthRows.reduce((s, p) => s + (p.amount_cents ?? 0), 0),
          count: monthRows.length,
        });
      }

      return {
        sales: approved.length,
        revenue,
        net,
        ticket: approved.length ? Math.round(revenue / approved.length) : 0,
        conversion: leadRows.length ? (approved.length / leadRows.length) * 100 : 0,
        leadsCount: leadRows.length,
        pixCount: rows.length,
        expiredCount: expired.length,
        recentLeads: leadRows.slice(0, 6),
        recentPix: rows.filter((p) => p.status === "pending").slice(0, 6),
        recentSales: approved.slice(0, 6),
        recentExpired: expired.slice(0, 6),
        days: chartDays,
        months,
        logs: logs.data ?? [],
      };
    },
  });

  const cards = [
    { label: "Vendas", value: data?.sales ?? 0, icon: ShoppingBag, hint: `${data?.pixCount ?? 0} cobranças geradas` },
    {
      label: "Conversão",
      value: `${(data?.conversion ?? 0).toFixed(1)}%`,
      icon: BadgePercent,
      hint: `${data?.leadsCount ?? 0} leads no período`,
    },
    { label: "Receita", value: formatBRL(data?.revenue ?? 0), icon: Wallet, hint: `${formatBRL(data?.net ?? 0)} líquido` },
    { label: "Ticket médio", value: formatBRL(data?.ticket ?? 0), icon: Receipt, hint: "por venda aprovada" },
  ];

  const eventPanels = [
    {
      title: "Leads",
      icon: Users,
      accent: "text-[var(--color-chart-1)]",
      items: (data?.recentLeads ?? []).map((l) => ({
        id: l.id,
        primary: l.name ?? l.telegram_username ?? "Lead",
        secondary: formatDate(l.created_at),
      })),
    },
    {
      title: "PIX gerados",
      icon: QrCode,
      accent: "text-[var(--color-chart-3)]",
      items: (data?.recentPix ?? []).map((p) => ({
        id: p.id,
        primary: `${p.product_name ?? p.description ?? "Cobrança"} · ${formatBRL(p.amount_cents ?? 0)}`,
        secondary: formatDate(p.created_at),
      })),
    },
    {
      title: "Vendas aprovadas",
      icon: ShoppingBag,
      accent: "text-[var(--color-chart-2)]",
      items: (data?.recentSales ?? []).map((p) => ({
        id: p.id,
        primary: `${p.product_name ?? p.description ?? "Venda"} · ${formatBRL(p.amount_cents ?? 0)}`,
        secondary: formatDate(p.created_at),
      })),
    },
    {
      title: "Expirados",
      icon: TimerOff,
      accent: "text-muted-foreground",
      items: (data?.recentExpired ?? []).map((p) => ({
        id: p.id,
        primary: `${p.product_name ?? p.description ?? "Cobrança"} · ${formatBRL(p.amount_cents ?? 0)}`,
        secondary: formatDate(p.created_at),
      })),
    },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="Visão geral da sua operação." />

      <div className="mb-4 flex flex-wrap gap-2">
        {periods.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              period === p.key
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <div
            key={c.label}
            className="panel card-glow group animate-rise p-6"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</span>
              <span className="flex size-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary-glow transition-shadow duration-300 group-hover:shadow-[0_0_20px_-4px_var(--color-primary)]">
                <c.icon className="size-4" />
              </span>
            </div>
            {isLoading ? (
              <Skeleton className="mt-3 h-9 w-28" />
            ) : (
              <>
                <p className="mt-3 font-display text-3xl font-bold tracking-tight">{c.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="panel mt-6 p-5">
        <p className="text-sm font-medium">Leads x vendas no período</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.days ?? []}>
              <defs>
                <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gVendas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Area type="monotone" dataKey="leads" stroke="var(--color-chart-1)" fill="url(#gLeads)" strokeWidth={2} />
              <Area type="monotone" dataKey="vendas" stroke="var(--color-chart-2)" fill="url(#gVendas)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Activity className="size-4 text-primary" /> Últimos eventos
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {eventPanels.map((panel) => (
            <div key={panel.title} className="panel p-4">
              <p className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${panel.accent}`}>
                <panel.icon className="size-4" /> {panel.title}
              </p>
              <div className="mt-3 space-y-2">
                {panel.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nada por aqui ainda.</p>
                ) : (
                  panel.items.map((item) => (
                    <div key={item.id} className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
                      <p className="truncate text-sm">{item.primary}</p>
                      <p className="text-[11px] text-muted-foreground">{item.secondary}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel mt-6 p-5">
        <p className="text-sm font-medium">Resumo mensal da receita</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(data?.months ?? []).map((m) => (
            <div key={m.key} className="card-glow rounded-xl border border-border bg-secondary/40 p-3">
              <p className="text-xs capitalize text-muted-foreground">{m.label}</p>
              <p className="mt-1 font-display text-lg font-bold">{formatBRL(m.total)}</p>
              <p className="text-xs text-muted-foreground">{m.count} venda(s)</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-sm font-medium">Histórico de ações</p>
        {(data?.logs.length ?? 0) === 0 ? (
          <EmptyState title="Nenhum evento ainda" description="As ações no painel aparecem aqui." />
        ) : (
          <div className="panel divide-y divide-border">
            {data?.logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm transition-colors hover:bg-secondary/50">
                <span>
                  <span className="text-muted-foreground">{log.entity}</span> · {log.action}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(log.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
