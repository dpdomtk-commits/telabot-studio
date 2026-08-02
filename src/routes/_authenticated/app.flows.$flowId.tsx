import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Save, Trash2, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { flowNodeTypes, type FlowNodeData } from "@/components/app/flow/FlowNodes";
import { nodeDefinitions, nodeGroups, nodeByType } from "@/lib/flow-nodes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Database } from "@/integrations/supabase/types";

type StepType = Database["public"]["Enums"]["flow_node_type"];

export const Route = createFileRoute("/_authenticated/app/flows/$flowId")({
  head: () => ({
    meta: [
      { title: "Editor de fluxo | AURUMBOT" },
      {
        name: "description",
        content: "Editor visual de fluxos: arraste nós de mensagem, PIX, assinatura e acesso VIP e conecte a jornada.",
      },
      { property: "og:title", content: "Editor de fluxo | AURUMBOT" },
      { property: "og:description", content: "Editor visual de fluxos para bots do Telegram." },
    ],
  }),
  component: () => (
    <ReactFlowProvider>
      <FlowEditorPage />
    </ReactFlowProvider>
  ),
});

type FlowNodeType = Node<FlowNodeData>;

let tempCounter = 0;
const tempId = () => `tmp-${Date.now()}-${tempCounter++}`;

function FlowEditorPage() {
  const { flowId } = useParams({ from: "/_authenticated/app/flows/$flowId" });
  const qc = useQueryClient();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removedSteps, setRemovedSteps] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["flow-editor", flowId],
    queryFn: async () => {
      const [flow, steps, connections] = await Promise.all([
        supabase.from("flows").select("id,name,description,status,bots(name)").eq("id", flowId).maybeSingle(),
        supabase.from("flow_steps").select("id,type,title,config,position,position_x,position_y").eq("flow_id", flowId),
        supabase
          .from("flow_connections")
          .select("id,source_step_id,target_step_id,source_handle,label")
          .eq("flow_id", flowId),
      ]);
      if (flow.error) throw flow.error;
      return { flow: flow.data, steps: steps.data ?? [], connections: connections.data ?? [] };
    },
  });

  useEffect(() => {
    if (!data) return;
    setNodes(
      data.steps.map((s, index) => ({
        id: s.id,
        type: "flowNode",
        position: { x: s.position_x ?? 80 + index * 40, y: s.position_y ?? 80 + index * 140 },
        data: {
          type: s.type as string,
          title: s.title ?? nodeByType[s.type as string]?.label ?? s.type,
          config: (s.config ?? {}) as Record<string, unknown>,
        },
      })),
    );
    setEdges(
      data.connections.map((c) => ({
        id: c.id,
        source: c.source_step_id,
        target: c.target_step_id,
        sourceHandle: c.source_handle,
        label: c.label ?? undefined,
        animated: true,
      })),
    );
    setRemovedSteps([]);
  }, [data, setNodes, setEdges]);

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);
  const selectedDef = selected ? nodeByType[selected.data.type] : undefined;

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, id: tempId(), animated: true }, eds)),
    [setEdges],
  );

  const addNode = useCallback(
    (type: string, clientPosition?: { x: number; y: number }) => {
      const def = nodeByType[type];
      if (!def) return;
      const position = clientPosition
        ? screenToFlowPosition(clientPosition)
        : { x: 200 + Math.random() * 200, y: 120 + Math.random() * 240 };
      const id = tempId();
      setNodes((prev) => [
        ...prev,
        { id, type: "flowNode", position, data: { type, title: def.label, config: {} } },
      ]);
      setSelectedId(id);
    },
    [screenToFlowPosition, setNodes],
  );

  const updateSelected = useCallback(
    (patch: Partial<FlowNodeData>) => {
      if (!selectedId) return;
      setNodes((prev) =>
        prev.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [selectedId, setNodes],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    if (!selectedId.startsWith("tmp-")) setRemovedSteps((prev) => [...prev, selectedId]);
    setNodes((prev) => prev.filter((n) => n.id !== selectedId));
    setEdges((prev) => prev.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }, [selectedId, setNodes, setEdges]);

  async function save() {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      if (removedSteps.length > 0) {
        const { error } = await supabase.from("flow_steps").delete().in("id", removedSteps);
        if (error) throw error;
      }

      const idMap = new Map<string, string>();
      let index = 0;
      for (const node of nodes) {
        const payload = {
          flow_id: flowId,
          user_id: userId,
          type: node.data.type as StepType,
          title: node.data.title,
          config: node.data.config as never,
          position: index++,
          position_x: Math.round(node.position.x),
          position_y: Math.round(node.position.y),
        };
        if (node.id.startsWith("tmp-")) {
          const { data: created, error } = await supabase
            .from("flow_steps")
            .insert(payload)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (created) idMap.set(node.id, created.id);
        } else {
          const { error } = await supabase.from("flow_steps").update(payload).eq("id", node.id);
          if (error) throw error;
          idMap.set(node.id, node.id);
        }
      }

      const { error: delError } = await supabase.from("flow_connections").delete().eq("flow_id", flowId);
      if (delError) throw delError;

      const rows = edges
        .map((e) => ({
          user_id: userId,
          flow_id: flowId,
          source_step_id: idMap.get(e.source),
          target_step_id: idMap.get(e.target),
          source_handle: e.sourceHandle ?? "saída",
          label: typeof e.label === "string" ? e.label : null,
        }))
        .filter((r) => r.source_step_id && r.target_step_id);
      if (rows.length > 0) {
        const { error } = await supabase.from("flow_connections").insert(rows as never);
        if (error) throw error;
      }

      toast.success("Fluxo salvo");
      setRemovedSteps([]);
      await qc.invalidateQueries({ queryKey: ["flow-editor", flowId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const palette = nodeGroups.map((group) => ({
    group,
    items: nodeDefinitions.filter(
      (d) =>
        d.group === group &&
        d.type !== "payment" &&
        d.label.toLowerCase().includes(search.trim().toLowerCase()),
    ),
  }));

  if (isLoading) return <Skeleton className="h-[70vh] w-full" />;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="secondary" size="sm">
            <Link to="/app/flows">
              <ArrowLeft /> Fluxos
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-xl font-bold">{data?.flow?.name ?? "Fluxo"}</h1>
            <p className="text-xs text-muted-foreground">
              {data?.flow?.bots?.name ?? "Bot"} · {nodes.length} nós · {edges.length} conexões
            </p>
          </div>
          <Badge variant="secondary">{data?.flow?.status ?? "draft"}</Badge>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar fluxo
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_1fr_300px]">
        <aside className="panel hidden min-h-0 flex-col overflow-hidden p-0 lg:flex">
          <div className="border-b border-border/60 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar nó"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            {palette.map(
              (section) =>
                section.items.length > 0 && (
                  <div key={section.group}>
                    <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">{section.group}</p>
                    <div className="space-y-1.5">
                      {section.items.map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("application/aurumbot-node", item.type)}
                          onClick={() => addNode(item.type)}
                          className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-left text-sm transition-colors hover:border-primary/60 hover:bg-secondary"
                        >
                          <item.icon className="size-4 text-primary" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ),
            )}
          </div>
        </aside>

        <div ref={wrapperRef} className="panel min-h-[420px] overflow-hidden p-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={flowNodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const type = e.dataTransfer.getData("application/aurumbot-node");
              if (type) addNode(type, { x: e.clientX, y: e.clientY });
            }}
            fitView
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            className="bg-background"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} className="opacity-40" />
            <Controls className="!border-border !bg-card" />
            <MiniMap pannable zoomable className="!border !border-border !bg-card" maskColor="rgba(0,0,0,.6)" />
          </ReactFlow>
        </div>

        <aside className="panel min-h-0 overflow-y-auto p-4">
          {!selected ? (
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Nenhum nó selecionado</p>
              <p className="mt-2">
                Arraste um nó da barra lateral para o canvas, conecte as saídas e clique em um nó para configurar.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{selectedDef?.label}</p>
                <Button variant="destructive" size="sm" onClick={deleteSelected} aria-label="Excluir nó">
                  <Trash2 />
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="node-title">Título</Label>
                <Input
                  id="node-title"
                  maxLength={60}
                  value={selected.data.title}
                  onChange={(e) => updateSelected({ title: e.target.value })}
                />
              </div>

              {(selectedDef?.fields ?? []).map((field) => {
                const value = selected.data.config?.[field.key];
                const stringValue = typeof value === "string" || typeof value === "number" ? String(value) : "";
                const onChange = (v: string) =>
                  updateSelected({
                    config: { ...(selected.data.config ?? {}), [field.key]: field.kind === "number" ? Number(v) : v },
                  });
                return (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={`f-${field.key}`}>{field.label}</Label>
                    {field.kind === "media" ? (
                      <MediaPicker
                        kind={field.mediaKind ?? "document"}
                        value={stringValue}
                        onSelect={(asset) =>
                          updateSelected({
                            config: {
                              ...(selected.data.config ?? {}),
                              [field.key]: asset.telegram_file_id,
                              file_name: asset.file_name,
                            },
                          })
                        }
                      />
                    ) : field.kind === "textarea" ? (
                      <Textarea
                        id={`f-${field.key}`}
                        maxLength={2000}
                        value={stringValue}
                        placeholder={field.placeholder ?? ""}
                        onChange={(e) => onChange(e.target.value)}
                      />
                    ) : (
                      <Input
                        id={`f-${field.key}`}
                        type={field.kind === "number" ? "number" : "text"}
                        maxLength={300}
                        value={stringValue}
                        placeholder={field.placeholder ?? ""}
                        onChange={(e) => onChange(e.target.value)}
                      />
                    )}
                  </div>
                );
              })}

              {selectedDef?.outputs && selectedDef.outputs.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Este nó possui as saídas: {selectedDef.outputs.join(", ")}. Conecte cada uma a um caminho diferente.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
