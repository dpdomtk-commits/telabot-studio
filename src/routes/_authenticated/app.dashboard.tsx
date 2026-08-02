import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Users, CheckCircle2, Wallet } from "lucide-react";
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
      { name: "description", content: "Acompanhe bots, leads, pagamentos e receita em tempo real." },
      { property: "og:title", content: "Dashboard | AURUMBOT" },
      { property: "og:description", content: "Acompanhe bots, leads, pagamentos e receita." },
    ],
  }),
  component: Dashboard,
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const since = new Date(Date.now() - 13 * 86400000);
      since.setHours(0, 0, 0, 0);

      const [bots, leadsToday, payments, leads, logs] = await Promise.all([
        supabase.from("bots").select("id", { count: "exact", head: true }),
        supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", startOfToday()),
        supabase.from("payments").select("amount_cents,status,created_at"),
        supabase.from("leads").select("created_at").gte("created_at", since.toISOString()),
        supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(8),
      ]);

      const approved = (payments.data ?? []).filter((p) => p.status === "approved");
      const revenue = approved.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);

      const days: { day: string; leads: number; vendas: number }[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        d.setHours(0, 0, 0, 0);
        const key = d.toISOString().slice(0, 10);
        days.push({
          day: formatDay(d.toISOString()),
          leads: (leads.data ?? []).filter((l) => l.created_at.slice(0, 10) === key).length,
          vendas: approved.filter((p) => p.created_at.slice(0, 10) === key).length,
        });
      }

      const months: { key: string; label: string; total: number; count: number }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const rows = approved.filter((p) => p.created_at.slice(0, 7) === key);
        months.push({
          key,
          label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
          total: rows.reduce((s, p) => s + (p.amount_cents ?? 0), 0),
          count: rows.length,
        });
      }

      return {
        bots: bots.count ?? 0,
        leadsToday: leadsToday.count ?? 0,
        approved: approved.length,
        revenue,
        days,
        months,
        logs: logs.data ?? [],
      };
    },
  });

  const cards = [
    { label: "Bots cadastrados", value: data?.bots ?? 0, icon: Bot },
    { label: "Leads hoje", value: data?.leadsToday ?? 0, icon: Users },
    { label: "Pagamentos aprovados", value: data?.approved ?? 0, icon: CheckCircle2 },
    { label: "Receita total", value: formatBRL(data?.revenue ?? 0), icon: Wallet },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="Visão geral da sua operação." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</span>
              <c.icon className="size-4 text-primary" />
            </div>
            {isLoading ? (
              <Skeleton className="mt-3 h-8 w-24" />
            ) : (
              <p className="mt-2 font-display text-2xl font-bold">{c.value}</p>
            )}
          </div>
        ))}
      </div>

      <div className="panel mt-6 p-5">
        <p className="text-sm font-medium">Atividade dos últimos 14 dias</p>
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

      <div className="panel mt-6 p-5">
        <p className="text-sm font-medium">Resumo mensal da receita</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(data?.months ?? []).map((m) => (
            <div key={m.key} className="rounded-md border border-border p-3">
              <p className="text-xs capitalize text-muted-foreground">{m.label}</p>
              <p className="mt-1 font-display text-lg font-bold">{formatBRL(m.total)}</p>
              <p className="text-xs text-muted-foreground">{m.count} venda(s)</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-sm font-medium">Últimos eventos</p>
        {(data?.logs.length ?? 0) === 0 ? (
          <EmptyState title="Nenhum evento ainda" description="As ações no painel aparecem aqui." />
        ) : (
          <div className="panel divide-y divide-border">
            {data?.logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
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
