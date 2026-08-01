import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL, formatDate, paymentStatusLabels } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/admin")({
  head: () => ({
    meta: [
      { title: "Admin | AURUMBOT" },
      { name: "description", content: "Painel administrativo: usuários, bots, leads, pagamentos e logs." },
      { property: "og:title", content: "Admin | AURUMBOT" },
      { property: "og:description", content: "Painel administrativo do AURUMBOT." },
    ],
  }),
  component: AdminPage,
});

function useAdminData() {
  return useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const [profiles, bots, leads, payments, logs] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("bots").select("id,name,status,created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("leads").select("id,first_name,telegram_user_id,created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("payments").select("id,amount_cents,status,created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("activity_logs").select("id,entity,action,created_at").order("created_at", { ascending: false }).limit(100),
      ]);
      return {
        profiles: profiles.data ?? [],
        bots: bots.data ?? [],
        leads: leads.data ?? [],
        payments: payments.data ?? [],
        logs: logs.data ?? [],
      };
    },
  });
}

function List({ rows }: { rows: { id: string; primary: string; secondary: string }[] }) {
  if (rows.length === 0) return <EmptyState title="Sem registros" description="Nada para exibir por aqui ainda." />;
  return (
    <div className="panel divide-y divide-border">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
          <span>{r.primary}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{r.secondary}</span>
        </div>
      ))}
    </div>
  );
}

function AdminPage() {
  const { data, isLoading } = useAdminData();

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div>
      <PageHeader title="Admin" description="Visão global da plataforma (somente administradores)." />
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="bots">Bots</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <List
            rows={(data?.profiles ?? []).map((p) => ({
              id: p.id,
              primary: p.full_name ?? p.email ?? "Sem nome",
              secondary: formatDate(p.created_at),
            }))}
          />
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
              primary: l.first_name ?? l.telegram_user_id,
              secondary: formatDate(l.created_at),
            }))}
          />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <List
            rows={(data?.payments ?? []).map((p) => ({
              id: p.id,
              primary: `${formatBRL(p.amount_cents)} · ${paymentStatusLabels[p.status]}`,
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
    </div>
  );
}
