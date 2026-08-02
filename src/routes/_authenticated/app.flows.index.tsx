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
  Download,
  Upload,
  Share2,
  Store,
  LayoutList,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBots } from "./app.bots";
import { duplicateFlow } from "@/lib/flow.functions";
import { exportFlow, importFlow, shareFlow, publishToMarketplace } from "@/lib/flow-share.functions";
import { defaultSimpleConfig } from "@/lib/flow-simple";
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
        content:
          "Crie fluxos no modo simples por páginas ou no editor visual avançado, com exportação, importação e marketplace.",
      },
      { property: "og:title", content: "Fluxos | AURUMBOT" },
      { property: "og:description", content: "Fluxos simples e avançados para vendas no Telegram com PIX." },
    ],
  }),
  component: FlowsPage,
});

type FlowStatus = "draft" | "active" | "archived";
type FlowMode = "simple" | "advanced";

export type FlowRow = {
  id: string;
  name: string;
  description: string | null;
  bot_id: string;
  status: FlowStatus;
  mode: FlowMode;
  share_code: string | null;
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
  const [mode, setMode] = useState<FlowMode>("simple");
  const [filter, setFilter] = useState<"live" | "archived">("live");

  const [importOpen, setImportOpen] = useState(false);
  const [importBotId, setImportBotId] = useState("");
  const [importCode, setImportCode] = useState("");
  const [importJson, setImportJson] = useState("");

  const [shareFlowRow, setShareFlowRow] = useState<FlowRow | null>(null);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishSummary, setPublishSummary] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["flows-overview"],
    queryFn: async () => {
      const [flows, leads, payments, subscriptions] = await Promise.all([
        supabase
          .from("flows")
          .select(
            "id,name,description,bot_id,status,mode,share_code,is_active,created_at,updated_at,bots(name)",
          )
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
          mode,
          simple_config: mode === "simple" ? (defaultSimpleConfig() as never) : ({} as never),
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
      if (!flowId) return;
      if (mode === "simple") navigate({ to: "/app/flows/$flowId/simple", params: { flowId } });
      else navigate({ to: "/app/flows/$flowId", params: { flowId } });
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

  const switchMode = useMutation({
    mutationFn: async (vars: { id: string; mode: FlowMode }) => {
      const { error } = await supabase.from("flows").update({ mode: vars.mode }).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["flows-overview"] });
      if (vars.mode === "simple") navigate({ to: "/app/flows/$flowId/simple", params: { flowId: vars.id } });
      else navigate({ to: "/app/flows/$flowId", params: { flowId: vars.id } });
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

  const exportOne = useMutation({
    mutationFn: async (flow: FlowRow) => {
      const result = await exportFlow({ data: { flowId: flow.id } });
      if (!result.ok || !result.payload) throw new Error(result.message);
      const blob = new Blob([JSON.stringify(result.payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${flow.name.replace(/[^\w-]+/g, "-").toLowerCase()}.aurumflow.json`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success("Fluxo exportado"),
    onError: (e: Error) => toast.error(e.message),
  });

  const share = useMutation({
    mutationFn: async (flowId: string) => {
      const result = await shareFlow({ data: { flowId } });
      if (!result.ok || !result.code) throw new Error(result.message);
      return result.code;
    },
    onSuccess: (code) => {
      setShareCode(code);
      qc.invalidateQueries({ queryKey: ["flows-overview"] });
      toast.success("Código de compartilhamento pronto");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publish = useMutation({
    mutationFn: async (flowId: string) => {
      const result = await publishToMarketplace({
        data: { flowId, title: publishTitle.trim(), summary: publishSummary.trim() || undefined, category: "geral" },
      });
      if (!result.ok) throw new Error(result.message);
    },
    onSuccess: () => {
      toast.success("Enviado para o marketplace");
      setPublishTitle("");
      setPublishSummary("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runImport = useMutation({
    mutationFn: async () => {
      if (!importBotId) throw new Error("Escolha o bot de destino");
      const payload = importJson.trim() ? JSON.parse(importJson) : undefined;
      const result: { ok: boolean; message: string; flowId?: string } = await importFlow({
        data: {
          botId: importBotId,
          ...(importCode.trim() ? { code: importCode.trim().toUpperCase() } : {}),
          ...(payload ? { payload } : {}),
        },
      });
      if (!result.ok) throw new Error(result.message);
      return result.flowId ?? null;
    },
    onSuccess: (flowId) => {
      toast.success("Fluxo importado");
      setImportOpen(false);
      setImportCode("");
      setImportJson("");
      qc.invalidateQueries({ queryKey: ["flows-overview"] });
      if (flowId) navigate({ to: "/app/flows/$flowId", params: { flowId } });
    },
    onError: (e: Error) => toast.error(e instanceof SyntaxError ? "JSON inválido" : e.message),
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
        description="Modo simples para começar rápido ou modo avançado com editor visual. Exporte, importe e compartilhe."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <Link to="/app/marketplace">
                <Store /> Marketplace
              </Link>
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen(true)} disabled={(bots?.length ?? 0) === 0}>
              <Upload /> Importar
            </Button>
            <Button onClick={() => setOpen(true)} disabled={(bots?.length ?? 0) === 0}>
              <Plus /> Criar fluxo
            </Button>
          </div>
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
            description="Crie um fluxo simples por páginas ou abra o editor visual avançado."
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
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant={statusVariant[flow.status]}>{statusLabels[flow.status]}</Badge>
                      <Badge variant={flow.mode === "simple" ? "secondary" : "outline"}>
                        {flow.mode === "simple" ? "Simples" : "Avançado"}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {flow.description ?? "Sem descrição."}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Criado em {formatDate(flow.created_at)} · Editado em {formatDate(flow.updated_at)}
                    {flow.share_code ? ` · ${flow.share_code}` : ""}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {flow.mode === "simple" ? (
                    <>
                      <Button asChild size="sm">
                        <Link to="/app/flows/$flowId/simple" params={{ flowId: flow.id }}>
                          <LayoutList /> Editar páginas
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => switchMode.mutate({ id: flow.id, mode: "advanced" })}
                      >
                        <Workflow /> Modo avançado
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button asChild size="sm">
                        <Link to="/app/flows/$flowId" params={{ flowId: flow.id }}>
                          <PencilLine /> Editor visual
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => switchMode.mutate({ id: flow.id, mode: "simple" })}
                      >
                        <LayoutList /> Modo simples
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={duplicate.isPending}
                    onClick={() => duplicate.mutate(flow.id)}
                  >
                    <Copy /> Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={exportOne.isPending}
                    onClick={() => exportOne.mutate(flow)}
                  >
                    <Download /> Exportar
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShareFlowRow(flow);
                      setShareCode(flow.share_code);
                      setPublishTitle(flow.name);
                    }}
                  >
                    <Share2 /> Compartilhar
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
            <DialogDescription>Escolha o modo de edição e o bot que vai executar esta jornada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { value: "simple", title: "Fluxo simples", hint: "Configuração por páginas, ideal para começar." },
                  { value: "advanced", title: "Fluxo avançado", hint: "Editor visual com nós e conexões." },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  className={`rounded-xl border p-4 text-left transition ${
                    mode === option.value
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface/60 hover:bg-surface-hover"
                  }`}
                >
                  <p className="font-display text-sm font-bold">{option.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{option.hint}</p>
                </button>
              ))}
            </div>
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

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar fluxo</DialogTitle>
            <DialogDescription>
              Use um código FLOW-XXXXXX ou cole o JSON exportado. Tokens, chaves PIX, dados financeiros e leads não
              são importados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Bot de destino</Label>
              <Select value={importBotId} onValueChange={setImportBotId}>
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
            <div className="space-y-2">
              <Label htmlFor="flow-code">Código do fluxo</Label>
              <Input
                id="flow-code"
                value={importCode}
                maxLength={20}
                onChange={(e) => setImportCode(e.target.value.toUpperCase())}
                placeholder="FLOW-A1B2C3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flow-json">Ou arquivo JSON</Label>
              <Input
                id="flow-json"
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setImportJson(await file.text());
                }}
              />
              <Textarea
                rows={4}
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder='{"version":1,...}'
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={runImport.isPending} onClick={() => runImport.mutate()}>
              Importar fluxo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(shareFlowRow)} onOpenChange={(o) => !o && setShareFlowRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compartilhar fluxo</DialogTitle>
            <DialogDescription>
              Gere um código único para que qualquer usuário importe este fluxo — sem seus dados sensíveis.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-surface/60 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Código de compartilhamento</p>
              <p className="mt-2 font-display text-2xl font-bold text-gradient-neon">{shareCode ?? "—"}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  disabled={share.isPending || !shareFlowRow}
                  onClick={() => shareFlowRow && share.mutate(shareFlowRow.id)}
                >
                  {shareCode ? "Atualizar código" : "Gerar código"}
                </Button>
                {shareCode ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(shareCode);
                      toast.success("Código copiado");
                    }}
                  >
                    <Copy /> Copiar
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-surface/60 p-4">
              <p className="font-display text-sm font-bold">Publicar no marketplace</p>
              <Input
                value={publishTitle}
                maxLength={80}
                onChange={(e) => setPublishTitle(e.target.value)}
                placeholder="Título do modelo"
              />
              <Textarea
                rows={2}
                maxLength={280}
                value={publishSummary}
                onChange={(e) => setPublishSummary(e.target.value)}
                placeholder="Resumo do que este funil faz"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={publish.isPending || publishTitle.trim().length < 3 || !shareFlowRow}
                onClick={() => shareFlowRow && publish.mutate(shareFlowRow.id)}
              >
                <Store /> Enviar para aprovação
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShareFlowRow(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
