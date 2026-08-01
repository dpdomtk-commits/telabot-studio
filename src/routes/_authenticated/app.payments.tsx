import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDate, paymentStatusLabels } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/payments")({
  head: () => ({
    meta: [
      { title: "Pagamentos | AURUMBOT" },
      { name: "description", content: "Acompanhe cobranças PIX, situação e receita gerada pelos seus bots." },
      { property: "og:title", content: "Pagamentos | AURUMBOT" },
      { property: "og:description", content: "Acompanhe cobranças PIX e receita gerada pelos seus bots." },
    ],
  }),
  component: PaymentsPage,
});

type PaymentStatus = "pending" | "approved" | "failed" | "refunded";

type Payment = {
  id: string;
  amount_cents: number;
  method: string;
  status: PaymentStatus;
  description: string | null;
  created_at: string;
  paid_at: string | null;
  leads: { name: string | null; telegram_username: string | null } | null;
};

const badgeVariant: Record<PaymentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default",
  pending: "secondary",
  failed: "destructive",
  refunded: "outline",
};

function PaymentsPage() {
  const [status, setStatus] = useState("all");

  const { data: payments, isLoading } = useQuery({
    queryKey: ["payments", status],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("id,amount_cents,method,status,description,created_at,paid_at,leads(name,telegram_username)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (status !== "all") q = q.eq("status", status as PaymentStatus);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Payment[];
    },
  });

  const total = (payments ?? []).filter((p) => p.status === "approved").reduce((s, p) => s + p.amount_cents, 0);

  return (
    <div>
      <PageHeader
        title="Pagamentos"
        description="Estrutura pronta para PIX. A integração com gateway entra numa próxima etapa."
      />

      <div className="panel mb-4 flex flex-wrap items-end justify-between gap-4 p-4">
        <div className="w-56 space-y-2">
          <Label>Situação</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(paymentStatusLabels).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total aprovado</p>
          <p className="font-display text-xl font-bold">{formatBRL(total)}</p>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (payments?.length ?? 0) === 0 ? (
        <EmptyState
          title="Nenhum pagamento registrado"
          description="Cobranças criadas pelas etapas de pagamento aparecem aqui."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>Pago em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.leads?.name ??
                      (p.leads?.telegram_username ? `@${p.leads.telegram_username}` : "—")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.description ?? "—"}</TableCell>
                  <TableCell className="uppercase">{p.method}</TableCell>
                  <TableCell>{formatBRL(p.amount_cents)}</TableCell>
                  <TableCell>
                    <Badge variant={badgeVariant[p.status]}>{paymentStatusLabels[p.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(p.created_at)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(p.paid_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
