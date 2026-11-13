import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBots } from "./app.bots";
import { Download } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/leads")({
  head: () => ({
    meta: [
      { title: "Leads | AURUMBOT" },
      { name: "description", content: "Todos os contatos capturados pelos seus bots do Telegram." },
      { property: "og:title", content: "Leads | AURUMBOT" },
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", botId, status, from, to],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("id,name,telegram_id,telegram_username,status,created_at,bots(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (botId !== "all") q = q.eq("bot_id", botId);
      if (status !== "all") q = q.eq("status", status as "new" | "engaged" | "converted");
      if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Lead[];
    },
  });

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Contatos que interagiram com seus bots."
        action={
          <Button
            variant="secondary"
            disabled={(leads?.length ?? 0) === 0}
            onClick={() =>
              downloadCsv(
                `leads-${new Date().toISOString().slice(0, 10)}.csv`,
                ["Nome", "Telegram ID", "Usuário", "Bot", "Situação", "Entrada"],
                (leads ?? []).map((l) => [
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

      <div className="panel mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>Bot</Label>
          <Select value={botId} onValueChange={setBotId}>
            <SelectTrigger>
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
        <div className="space-y-2">
          <Label>Situação</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
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
        <div className="space-y-2">
          <Label htmlFor="from">De</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">Até</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (leads?.length ?? 0) === 0 ? (
        <EmptyState title="Nenhum lead encontrado" description="Ajuste os filtros ou aguarde novas interações." />
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telegram ID</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Bot</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Entrada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads?.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{lead.telegram_id ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.telegram_username ? `@${lead.telegram_username}` : "—"}
                  </TableCell>
                  <TableCell>{lead.bots?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{statusLabels[lead.status] ?? lead.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(lead.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
