import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Copy,
  Archive,
  ArchiveRestore,
  Workflow,
  Users,
  Target,
  Wallet,
  Repeat,
  TrendingUp,
  PencilLine,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBots } from "./app.bots";
import { duplicateFlow } from "@/lib/flow.functions";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL, formatDate } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/flows/")({
  head: () => ({
    meta: [
      { title: "Fluxos | AURUMBOT" },
      {
        name: "description",
        content: "Crie fluxos visuais de venda no Telegram com PIX, assinaturas, upsell e liberação de acesso VIP.",
      },
      { property: "og:title", content: "Fluxos | AURUMBOT" },
      { property: "og:description", content: "Fluxos visuais de venda no Telegram com PIX e assinaturas." },
    ],
  }),
  component: FlowsPage,
});

type FlowStatus = "draft" | "active" | "archived";

export type FlowRow = {
  id: string;
  name: string;
  description: string | null;
  bot_id: string;
  status: FlowStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  bots: { name: string } | null;
};

const statusLabels: Record<FlowStatus, string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};

const statusVariant: Record<FlowStatus, "default" | "secondary" | "outline"> = {
  active: "default",
  draft: "secondary",
  archived: "outline",
};

function FlowsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: bots } = useBots();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [botId, setBotId] = useState("");
  const [filter, setFilter] = useState<"live" | "archived">("live");

  const { data, isLoading } = useQuery({
    queryKey: ["flows-overview"],
    queryFn: async () => {
      const [flows, leads, payments, subscriptions] = await Promise.all([
        supabase
          .from("flows")
          .select("id,name,description,bot_id,status,is_active,created_at,updated_at,bots(name)")
          .order("updated_at", { ascending: false }),
        supabase.from("leads").select("id,status"),
        supabase.from("payments").select("amount_cents,net_cents,status"),
        supabase.from("subscriptions").select("id,amount_cents,interval_days,status"),
      ]);
      const approved = (payments.data ?? []).filter((p) => p.status === "approved");
      const activeSubs = (subscriptions.data ?? []).filter((s) => s.status === "active");
      return {
        flows: (flows.data ?? []) as unknown as FlowRow[],
        leads: leads.data ?? [],
        conversions: (leads.data ?? []).filter((l) => l.status === "converted").length,
        revenue: approved.reduce((s, p) => s + (p.net_cents ?? p.amount_cents), 0),
        subscribers: activeSubs.length,
        mrr: activeSubs.reduce(
          (s, sub) => s + Math.round((sub.amount_cents * 30) / Math.max(sub.interval_days, 1)),
          0,
        ),
      };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = z
        .object({
          name: z.string().trim().min(2, "Informe um nome").max(80),
          description: z.string().trim().max(280).optional(),
          botId: z.string().uuid("Escolha um bot"),
        })
        .parse({ name, description: description.trim() || undefined, botId });
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada");
      const { data: flow, error } = await supabase
        .from("flows")
        .insert({
          name: parsed.name,
          description: parsed.description ?? null,
          bot_id: parsed.botId,
          user_id: userData.user.id,
          status: "draft",
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;

      if (flow) {
        await supabase.from("flow_steps").insert({
          flow_id: flow.id,
          user_id: userData.user.id,
          type: "start",
          title: "Início",
          position: 0,
          position_x: 80,
          position_y: 120,
          config: { trigger: "/start" },
        });
      }
      return flow?.id ?? null;
    },
    onSuccess: (flowId) => {
      toast.success("Fluxo criado");
      setOpen(false);
      setName("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["flows-overview"] });
      if (flowId) navigate({ to: "/app/flows/$flowId", params: { flowId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (vars: { id: string; status: FlowStatus }) => {
      const { error } = await supabase
        .from("flows")
        .update({ status: vars.status, is_active: vars.status === "active" })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fluxo atualizado");
      qc.invalidateQueries({ queryKey: ["flows-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async (flowId: string) => {
      const result = await duplicateFlow({ data: { flowId } });
      if (!result.ok) throw new Error(result.message);
    },
    onSuccess: () => {
      toast.success("Fluxo duplicado");
      qc.invalidateQueries({ queryKey: ["flows-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("flows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fluxo excluído");
      qc.invalidateQueries({ queryKey: ["flows-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const flows = (data?.flows ?? []).filter((f) =>
    filter === "archived" ? f.status === "archived" : f.status !== "archived",
  );

  const metrics = [
    { label: "Total de fluxos", value: String(data?.flows.length ?? 0), icon: Workflow },
    { label: "Total de leads", value: String(data?.leads.length ?? 0), icon: Users },
    { label: "Conversões", value: String(data?.conversions ?? 0), icon: Target },
    { label: "Receita", value: formatBRL(data?.revenue ?? 0), icon: Wallet },
    { label: "Assinantes", value: String(data?.subscribers ?? 0), icon: Repeat },
    { label: "Receita recorrente", value: formatBRL(data?.mrr ?? 0), icon: TrendingUp },
  ];

  return (
    <div>
      <PageHeader
        title="Fluxos"
        description="Monte a jornada completa do lead: boas-vindas, planos, PIX, assinatura e liberação de acesso."
        action={
          <Button onClick={() => setOpen(true)} disabled={(bots?.length ?? 0) === 0}>
            <Plus /> Criar fluxo
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map((m) => (
          <div key={m.label} className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</span>
              <m.icon className="size-4 text-primary" />
            </div>
            {isLoading ? (
              <Skeleton className="mt-3 h-7 w-20" />
            ) : (
              <p className="mt-2 font-display text-xl font-bold">{m.value}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Button variant={filter === "live" ? "default" : "secondary"} size="sm" onClick={() => setFilter("live")}>
          Ativos e rascunhos
        </Button>
        <Button
          variant={filter === "archived" ? "default" : "secondary"}
          size="sm"
          onClick={() => setFilter("archived")}
        >
          Arquivados
        </Button>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (bots?.length ?? 0) === 0 ? (
          <EmptyState
            title="Cadastre um bot primeiro"
            description="Todo fluxo roda dentro de um bot do Telegram."
          />
        ) : flows.length === 0 ? (
          <EmptyState
            title={filter === "archived" ? "Nenhum fluxo arquivado" : "Nenhum fluxo ainda"}
            description="Crie um fluxo e abra o editor visual para montar a jornada."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {flows.map((flow) => (
              <div key={flow.id} className="panel flex flex-col justify-between p-5">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-bold">{flow.name}</p>
                      <p className="text-xs text-muted-foreground">{flow.bots?.name ?? "Bot removido"}</p>
                    </div>
                    <Badge variant={statusVariant[flow.status]}>{statusLabels[flow.status]}</Badge>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {flow.description ?? "Sem descrição."}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Criado em {formatDate(flow.created_at)} · Editado em {formatDate(flow.updated_at)}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button asChild size="sm">
                    <Link to="/app/flows/$flowId" params={{ flowId: flow.id }}>
                      <PencilLine /> Editor visual
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={duplicate.isPending}
                    onClick={() => duplicate.mutate(flow.id)}
                  >
                    <Copy /> Duplicar
                  </Button>
                  {flow.status === "archived" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setStatus.mutate({ id: flow.id, status: "draft" })}
                    >
                      <ArchiveRestore /> Restaurar
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setStatus.mutate({
                            id: flow.id,
                            status: flow.status === "active" ? "draft" : "active",
                          })
                        }
                      >
                        {flow.status === "active" ? "Pausar" : "Ativar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setStatus.mutate({ id: flow.id, status: "archived" })}
                      >
                        <Archive /> Arquivar
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(flow.id)}
                    aria-label={`Excluir fluxo ${flow.name}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo fluxo</DialogTitle>
            <DialogDescription>Escolha o bot que vai executar esta jornada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="flow-name">Nome</Label>
              <Input
                id="flow-name"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Funil VIP mensal"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flow-desc">Descrição</Label>
              <Textarea
                id="flow-desc"
                maxLength={280}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Boas-vindas, oferta do plano mensal e liberação do grupo VIP."
              />
            </div>
            <div className="space-y-2">
              <Label>Bot</Label>
              <Select value={botId} onValueChange={setBotId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um bot" />
                </SelectTrigger>
                <SelectContent>
                  {(bots ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              Criar fluxo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
