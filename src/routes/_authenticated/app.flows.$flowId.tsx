import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowDown, ChevronUp, ChevronDown, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { stepLabels } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/flows/$flowId")({
  head: () => ({
    meta: [
      { title: "Editor de fluxo | AURUMBOT" },
      { name: "description", content: "Adicione e ordene as etapas do fluxo do seu bot." },
      { property: "og:title", content: "Editor de fluxo | AURUMBOT" },
      { property: "og:description", content: "Adicione e ordene as etapas do fluxo do seu bot." },
    ],
  }),
  component: FlowEditor,
});

type StepType = "message" | "image" | "button" | "delay" | "payment" | "delivery";

type Step = {
  id: string;
  position: number;
  type: StepType;
  config: Record<string, unknown>;
};

const fieldsByType: Record<StepType, { key: string; label: string; kind: "text" | "textarea" | "number" }[]> = {
  message: [{ key: "text", label: "Texto da mensagem", kind: "textarea" }],
  image: [
    { key: "url", label: "URL da imagem", kind: "text" },
    { key: "caption", label: "Legenda", kind: "text" },
  ],
  button: [
    { key: "label", label: "Texto do botão", kind: "text" },
    { key: "action", label: "Ação (ex.: comprar)", kind: "text" },
  ],
  delay: [{ key: "seconds", label: "Segundos de espera", kind: "number" }],
  payment: [
    { key: "amount", label: "Valor em reais", kind: "number" },
    { key: "description", label: "Descrição da cobrança", kind: "text" },
  ],
  delivery: [
    { key: "content", label: "Conteúdo entregue (link ou texto)", kind: "textarea" },
  ],
};

function FlowEditor() {
  const { flowId } = Route.useParams();
  const qc = useQueryClient();
  const [newType, setNewType] = useState<StepType>("message");

  const { data: flow } = useQuery({
    queryKey: ["flow", flowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flows")
        .select("id,name,is_active,bots(name)")
        .eq("id", flowId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { id: string; name: string; is_active: boolean; bots: { name: string } | null } | null;
    },
  });

  const { data: steps, isLoading } = useQuery({
    queryKey: ["flow-steps", flowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flow_steps")
        .select("id,position,type,config")
        .eq("flow_id", flowId)
        .order("position");
      if (error) throw error;
      return (data ?? []) as unknown as Step[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["flow-steps", flowId] });

  const addStep = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada");
      const position = (steps?.length ?? 0) + 1;
      const { error } = await supabase
        .from("flow_steps")
        .insert({ flow_id: flowId, user_id: userData.user.id, type: newType, position, config: {} });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error("Não foi possível adicionar a etapa"),
  });

  const saveConfig = useMutation({
    mutationFn: async ({ id, config }: { id: string; config: Record<string, unknown> }) => {
      const { error } = await supabase.from("flow_steps").update({ config: config as never }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etapa salva");
      invalidate();
    },
    onError: () => toast.error("Não foi possível salvar"),
  });

  const removeStep = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("flow_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const move = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const list = steps ?? [];
      const a = list[index];
      const b = list[index + dir];
      if (!a || !b) return;
      await supabase.from("flow_steps").update({ position: b.position }).eq("id", a.id);
      await supabase.from("flow_steps").update({ position: a.position }).eq("id", b.id);
    },
    onSuccess: invalidate,
  });

  const toggleActive = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase.from("flows").update({ is_active: value }).eq("id", flowId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow", flowId] });
      qc.invalidateQueries({ queryKey: ["flows"] });
    },
  });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/app/flows">
          <ArrowLeft /> Fluxos
        </Link>
      </Button>

      <PageHeader
        title={flow?.name ?? "Fluxo"}
        description={flow?.bots?.name ? `Bot: ${flow.bots.name}` : ""}
        action={
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Ativo</span>
            <Switch checked={!!flow?.is_active} onCheckedChange={(v) => toggleActive.mutate(v)} aria-label="Ativar fluxo" />
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (steps?.length ?? 0) === 0 ? (
        <EmptyState title="Fluxo vazio" description="Adicione a primeira etapa abaixo." />
      ) : (
        <div className="space-y-3">
          {steps?.map((step, i) => (
            <div key={step.id}>
              <StepCard
                step={step}
                index={i}
                total={steps.length}
                onSave={(config) => saveConfig.mutate({ id: step.id, config })}
                onRemove={() => removeStep.mutate(step.id)}
                onMove={(dir) => move.mutate({ index: i, dir })}
              />
              {i < steps.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDown className="size-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="panel mt-6 flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-48 space-y-2">
          <Label>Tipo da etapa</Label>
          <Select value={newType} onValueChange={(v) => setNewType(v as StepType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(stepLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => addStep.mutate()} disabled={addStep.isPending}>
          <Plus /> Adicionar etapa
        </Button>
      </div>
    </div>
  );
}

function StepCard({
  step,
  index,
  total,
  onSave,
  onRemove,
  onMove,
}: {
  step: Step;
  index: number;
  total: number;
  onSave: (config: Record<string, unknown>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [config, setConfig] = useState<Record<string, unknown>>(step.config ?? {});
  const fields = fieldsByType[step.type];

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-7 items-center justify-center rounded-md bg-secondary text-xs font-medium">
            {index + 1}
          </span>
          <Badge variant="secondary">{stepLabels[step.type]}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Subir etapa">
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label="Descer etapa"
          >
            <ChevronDown />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remover etapa">
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key} className={field.kind === "textarea" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
            <Label htmlFor={`${step.id}-${field.key}`}>{field.label}</Label>
            {field.kind === "textarea" ? (
              <Textarea
                id={`${step.id}-${field.key}`}
                value={String(config[field.key] ?? "")}
                maxLength={2000}
                onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
              />
            ) : (
              <Input
                id={`${step.id}-${field.key}`}
                type={field.kind === "number" ? "number" : "text"}
                value={String(config[field.key] ?? "")}
                maxLength={500}
                onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Button size="sm" variant="secondary" onClick={() => onSave(config)}>
          Salvar etapa
        </Button>
      </div>
    </div>
  );
}
