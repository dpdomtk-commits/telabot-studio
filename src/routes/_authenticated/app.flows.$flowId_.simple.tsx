import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bot,
  MessageSquare,
  CreditCard,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Clock,
  Settings,
  Sparkles,
  Save,
  Loader2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Share2,
  Eye,
  CheckCircle2,
  Globe,
  DollarSign,
  Layers,
  Copy,
  Pencil,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  EyeOff,
  Quote,
  BarChart3,
  Calendar,
  Package,
  ExternalLink,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FlowMediaUploader, type FlowMediaItem } from "@/components/app/FlowMediaUploader";
import {
  defaultAdvancedConfig,
  normalizeAdvancedConfig,
  compileAdvancedConfig,
  formatCurrencyPrice,
  type AdvancedFlowConfig,
  type SequenceStep,
} from "@/lib/flow-advanced";
import { syncFlowConfig } from "@/lib/flow.functions";

export const Route = createFileRoute("/_authenticated/app/flows/$flowId_/simple")({
  head: () => ({
    meta: [
      { title: "Editor de Fluxo | CASH BOT" },
      { name: "description", content: "Editor completo de fluxos, ofertas, remarketing e pagamentos." },
    ],
  }),
  component: AdvancedFlowEditorPage,
});

const NAV_SECTIONS = [
  { id: "bots", label: "Bots & Suporte", icon: Bot, category: "ESTRUTURA" },
  { id: "gate", label: "Boas-vindas (/start)", icon: Sparkles, category: "ESTRUTURA" },
  { id: "welcome", label: "Copy & Botões", icon: MessageSquare, category: "ESTRUTURA" },
  { id: "plans", label: "Planos & Entrega", icon: CreditCard, category: "ESTRUTURA" },
  { id: "upsell", label: "Upsell", icon: TrendingUp, category: "CONVERSÃO" },
  { id: "downsell", label: "Downsell", icon: TrendingDown, category: "CONVERSÃO" },
  { id: "orderBump", label: "Order Bump", icon: ShoppingBag, category: "CONVERSÃO" },
  { id: "packs", label: "Packs Avulsos", icon: Package, category: "CONVERSÃO" },
  { id: "previews", label: "Prévias que Somem", icon: Eye, category: "CONVERSÃO" },
  { id: "payments", label: "Pagamentos & PIX", icon: DollarSign, category: "OPERAÇÃO" },
  { id: "subscription", label: "Assinatura", icon: Calendar, category: "OPERAÇÃO" },
  { id: "conversions", label: "Conversões", icon: BarChart3, category: "ANÁLISE E AJUSTES" },
  { id: "remarketing", label: "Remarketing", icon: Clock, category: "ANÁLISE E AJUSTES" },
] as const;

const NAV_CATEGORIES = ["ESTRUTURA", "CONVERSÃO", "OPERAÇÃO", "ANÁLISE E AJUSTES"] as const;

function TelegramFormattingToolbar({
  currentText,
  onChange,
}: {
  currentText: string;
  onChange: (next: string) => void;
}) {
  const buttons = [
    { label: "Negrito", icon: Bold, open: "<b>", close: "</b>", sample: "texto" },
    { label: "Itálico", icon: Italic, open: "<i>", close: "</i>", sample: "texto" },
    { label: "Sublinhado", icon: Underline, open: "<u>", close: "</u>", sample: "texto" },
    { label: "Riscado", icon: Strikethrough, open: "<s>", close: "</s>", sample: "texto" },
    { label: "Código", icon: Code, open: "<code>", close: "</code>", sample: "código" },
    { label: "Spoiler", icon: EyeOff, open: "<tg-spoiler>", close: "</tg-spoiler>", sample: "spoiler" },
    { label: "Citação", icon: Quote, open: "<blockquote>", close: "</blockquote>", sample: "citação" },
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-black/60 p-1.5">
      {buttons.map((b) => (
        <button
          key={b.label}
          type="button"
          title={b.label}
          onClick={() => onChange(`${currentText}${currentText && !currentText.endsWith(" ") && !currentText.endsWith("\n") ? " " : ""}${b.open}${b.sample}${b.close}`)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10 hover:text-white transition"
        >
          <b.icon className="size-3" />
          <span className="hidden sm:inline">{b.label}</span>
        </button>
      ))}
    </div>
  );
}

export function AdvancedFlowEditorPage() {
  const { flowId } = useParams({ from: "/_authenticated/app/flows/$flowId_/simple" });
  const qc = useQueryClient();
  const initializedFlowIdRef = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("welcome");
  const [bilingualTab, setBilingualTab] = useState<"pt" | "en">("pt");
  const [previewCurrency, setPreviewCurrency] = useState<"BRL" | "USD" | "EUR" | "GBP">("BRL");
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AdvancedFlowConfig>(defaultAdvancedConfig());
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [editingFlowName, setEditingFlowName] = useState(false);
  const [flowNameDraft, setFlowNameDraft] = useState("");
  const [downsellSubTab, setDownsellSubTab] = useState<"start" | "pix">("start");
  const [paymentsSubTab, setPaymentsSubTab] = useState<"generated" | "approved">("generated");

  // Carrega dados do fluxo e lista de bots do usuário
  const { data: flowData, isLoading } = useQuery({
    queryKey: ["flow", flowId],
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flows")
        .select("id,name,bot_id,user_id,status,mode,simple_config")
        .eq("id", flowId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: userBots = [] } = useQuery({
    queryKey: ["user-bots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bots")
        .select("id,name,telegram_username,status")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: flowStats } = useQuery({
    queryKey: ["flow-stats", flowId, flowData?.bot_id],
    enabled: Boolean(flowId),
    staleTime: 25_000,
    queryFn: async () => {
      const [leadsRes, paymentsRes] = await Promise.all([
        supabase.from("leads").select("id,bot_id").limit(600),
        supabase.from("payments").select("id,bot_id,flow_id,amount_cents,status").limit(600),
      ]);
      const botIds = new Set(
        [...(config.bots.linkedBots || []), ...(flowData?.bot_id ? [flowData.bot_id] : [])].filter(Boolean),
      );
      const leads = (leadsRes.data ?? []).filter((l) => l.bot_id && botIds.has(l.bot_id));
      const payments = (paymentsRes.data ?? []).filter(
        (p) => p.flow_id === flowId || (!p.flow_id && p.bot_id && botIds.has(p.bot_id)),
      );
      const paid = payments.filter((p) => p.status === "approved");
      const paidCents = paid.reduce((s, p) => s + (p.amount_cents || 0), 0);
      const conversionPct = payments.length > 0 ? (paid.length / payments.length) * 100 : 0;
      return {
        leadsCount: leads.length,
        pixGenerated: payments.length,
        pixPaid: paid.length,
        conversionPct,
        revenueCents: paidCents,
      };
    },
  });

  async function handleRenameFlow() {
    const trimmed = flowNameDraft.trim();
    if (trimmed.length < 2) {
      setEditingFlowName(false);
      return;
    }
    const { error } = await supabase.from("flows").update({ name: trimmed }).eq("id", flowId);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.setQueryData(["flow", flowId], (old: any) => (old ? { ...old, name: trimmed } : old));
    void qc.invalidateQueries({ queryKey: ["flows-overview"] });
    setEditingFlowName(false);
    toast.success("Nome do fluxo atualizado!");
  }

  useEffect(() => {
    if (flowData && initializedFlowIdRef.current !== flowId) {
      const normalized = normalizeAdvancedConfig(flowData.simple_config);
      if (
        flowData.bot_id &&
        (!normalized.bots.linkedBots || !normalized.bots.linkedBots.includes(flowData.bot_id))
      ) {
        normalized.bots = {
          ...normalized.bots,
          linkedBots: Array.from(new Set([flowData.bot_id, ...(normalized.bots.linkedBots || [])])),
        };
      }
      setConfig(normalized);
      setFlowNameDraft(flowData.name || "");
      initializedFlowIdRef.current = flowId;
    }
  }, [flowData, flowId]);

  async function handleSave() {
    setSaving(true);
    try {
      const normalizedConfig = normalizeAdvancedConfig(config);
      setConfig(normalizedConfig);

      const targetBotIds = Array.from(
        new Set(
          [
            ...(normalizedConfig.bots.linkedBots || []),
            ...(flowData?.bot_id ? [flowData.bot_id] : []),
            ...(userBots.length === 1 && userBots[0]?.id ? [userBots[0].id] : []),
          ].filter((id): id is string => Boolean(id)),
        ),
      );
      const selectedBotId = targetBotIds[0] || flowData?.bot_id;
      const nowIso = new Date().toISOString();

      // 1. Salva o fluxo como ATIVO e sincroniza o simple_config imediatamente
      const { error } = await supabase
        .from("flows")
        .update({
          simple_config: normalizedConfig as never,
          mode: "simple",
          status: "active",
          is_active: true,
          ...(selectedBotId ? { bot_id: selectedBotId } : {}),
          updated_at: nowIso,
        })
        .eq("id", flowId);

      if (error) throw error;

      // 2. Sincroniza outros fluxos do mesmo bot para evitar conflito de execução
      for (const bId of targetBotIds) {
        await supabase
          .from("flows")
          .update({
            simple_config: normalizedConfig as never,
            status: "draft",
            is_active: false,
            updated_at: nowIso,
          })
          .eq("bot_id", bId)
          .neq("id", flowId);

        await supabase.from("bots").update({ status: "active" }).eq("id", bId);
      }

      // 3. Garante persistência server-side primeiro, atualiza webhook com o fluxo recém-salvo e aquece cache no Telegram
      await syncFlowConfig({
        data: {
          flowId,
          botIds: targetBotIds,
          simpleConfig: normalizedConfig,
        },
      }).catch(() => undefined);

      if (selectedBotId) {
        await fetch("/api/push-subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "invalidate_bot_cache",
            botId: selectedBotId,
            flowId,
            simpleConfig: normalizedConfig,
          }),
        }).catch(() => undefined);
      }

      // 4. Compila nós e conexões reais em bloco protegido para nunca impedir o salvamento
      try {
        const compiled = compileAdvancedConfig(normalizedConfig);
        await supabase.from("flow_connections").delete().eq("flow_id", flowId);
        await supabase.from("flow_steps").delete().eq("flow_id", flowId);

        const idMap = new Map<string, string>();
        for (const step of compiled.steps) {
          const { data: created } = await (supabase.from("flow_steps") as any)
            .insert({
              flow_id: flowId,
              user_id: flowData?.user_id || "",
              type: step.type,
              title: step.title,
              config: step.config,
              position: step.position,
              position_x: step.position_x,
              position_y: step.position_y,
            })
            .select("id")
            .maybeSingle();
          if (created) idMap.set(step.key, created.id);
        }

        const rows = compiled.connections
          .map((c) => ({
            user_id: flowData?.user_id || "",
            flow_id: flowId,
            source_step_id: idMap.get(c.source) ?? null,
            target_step_id: idMap.get(c.target) ?? null,
            source_handle: c.sourceHandle ?? null,
            label: c.label ?? null,
          }))
          .filter((c): c is typeof c & { source_step_id: string; target_step_id: string } =>
            Boolean(c.source_step_id && c.target_step_id),
          );

        if (rows.length > 0) {
          await (supabase.from("flow_connections") as any).insert(rows);
        }
      } catch (compileErr) {
        console.warn("[flow-steps-sync-warn]", compileErr);
      }

      // 5. Atualiza cache local sem perder edições
      qc.setQueryData(["flow", flowId], (old: any) =>
        old
          ? {
              ...old,
              simple_config: normalizedConfig,
              bot_id: selectedBotId ?? old.bot_id,
              status: "active",
            }
          : old,
      );
      void qc.invalidateQueries({ queryKey: ["flows-overview"] });

      toast.success("Fluxo salvo e sincronizado com o Telegram com sucesso!");
    } catch (e) {
      console.error("Erro ao salvar fluxo:", e);
      toast.error(e instanceof Error ? e.message : "Erro ao salvar alterações");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <Skeleton className="h-[80vh] w-full rounded-2xl bg-surface/40" />;
  }

  const activeSectionIdx = Math.max(
    0,
    NAV_SECTIONS.findIndex((s) => s.id === activeTab),
  );
  const formatFlowBRL = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header / Action Bar (Estilo SharkBot) */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/80 bg-surface/50 p-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="hover:bg-surface-hover">
            <Link to="/app/flows">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {editingFlowName ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={flowNameDraft}
                    onChange={(e) => setFlowNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleRenameFlow();
                      if (e.key === "Escape") setEditingFlowName(false);
                    }}
                    className="h-8 w-52 text-sm font-bold bg-black/60 border-cyan-500/40"
                    maxLength={40}
                  />
                  <Button size="icon" variant="secondary" className="size-8" onClick={() => void handleRenameFlow()}>
                    <Check className="size-4 text-emerald-400" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setFlowNameDraft(flowData?.name || "");
                    setEditingFlowName(true);
                  }}
                  className="flex items-center gap-1.5 group"
                  title="Renomear fluxo"
                >
                  <h1 className="font-display text-xl font-bold tracking-tight text-foreground group-hover:text-cyan-300 transition">
                    {flowData?.name || "MODEL"}
                  </h1>
                  <Pencil className="size-3.5 text-zinc-500 group-hover:text-cyan-400" />
                </button>
              )}
              <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-500/10 text-[10px]">
                {activeSectionIdx + 1} / {NAV_SECTIONS.length} SEÇÕES
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Configure toda a jornada do lead em um só lugar</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-black/50 px-3 py-1.5 border border-white/10 text-xs">
            <Globe className="size-3.5 text-cyan-400" />
            <span className="text-zinc-300 font-medium">Tradução automática (PT/EN)</span>
            <Switch
              checked={config.multilingual?.enabled !== false}
              onCheckedChange={(checked) =>
                setConfig({
                  ...config,
                  multilingual: { ...(config.multilingual || defaultAdvancedConfig().multilingual), enabled: checked },
                })
              }
            />
          </div>

          <div className="hidden sm:flex items-center gap-2 rounded-lg bg-black/40 px-3 py-1.5 border border-border text-xs">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-muted-foreground">Tudo salvo</span>
          </div>

          <Button asChild variant="outline" size="sm" className="border-white/10 text-xs">
            <Link to="/app/flows">
              <Share2 className="size-3.5 mr-1.5" /> Compartilhar
            </Link>
          </Button>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium shadow-md shadow-cyan-500/20"
          >
            {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
            Salvar alterações
          </Button>
        </div>
      </div>

      {/* Main Grid: Sidebar Menu Categorizado (13 Seções) + Content Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Navigation Sidebar */}
        <aside className="space-y-5 rounded-2xl border border-border/80 bg-surface/40 p-4 backdrop-blur h-fit">
          <div className="flex items-center justify-between px-1 text-xs font-semibold text-muted-foreground tracking-wider uppercase border-b border-white/5 pb-2.5">
            <span>Navegação</span>
            <span className="text-cyan-400">{activeSectionIdx + 1} de 13 seções</span>
          </div>

          {NAV_CATEGORIES.map((category) => (
            <div key={category} className="space-y-1.5">
              <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                {category}
              </p>
              <div className="space-y-1">
                {NAV_SECTIONS.filter((sec) => sec.category === category).map((sec) => {
                  const Icon = sec.icon;
                  const active = activeTab === sec.id;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setActiveTab(sec.id)}
                      className={`flex items-center gap-2.5 w-full rounded-xl px-3 py-2 text-xs font-medium transition ${
                        active
                          ? "bg-primary/15 text-primary border border-primary/30 shadow-sm font-bold"
                          : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      }`}
                    >
                      <Icon className={`size-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="truncate">{sec.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* Content Section */}
        <main className="space-y-6">
          {/* ABA 1: BOTS & RESUMO DO FLUXO */}
          {activeTab === "bots" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              {/* Card Resumo do Fluxo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-white/10 bg-black/50 p-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Leads no Funil</p>
                  <p className="text-xl font-black text-white mt-0.5">{flowStats?.leadsCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">PIX Gerados</p>
                  <p className="text-xl font-black text-cyan-300 mt-0.5">{flowStats?.pixGenerated ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">PIX Pagos</p>
                  <p className="text-xl font-black text-emerald-400 mt-0.5">{flowStats?.pixPaid ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Receita Aprovada</p>
                  <p className="text-xl font-black text-emerald-300 mt-0.5">
                    {formatFlowBRL(flowStats?.revenueCents ?? 0)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Bot className="size-5 text-primary" /> Bots Vinculados
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Gerencie quais bots executam este fluxo (até 10 bots)
                  </p>
                </div>
                <Badge variant="secondary">{config.bots.linkedBots.length}/10 bots</Badge>
              </div>

              <div className="space-y-4">
                <Label>Selecionar bots para vincular a este fluxo</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {userBots.map((bot) => {
                    const isLinked = config.bots.linkedBots.includes(bot.id);
                    return (
                      <div
                        key={bot.id}
                        className={`flex items-center justify-between p-3.5 rounded-xl border transition ${
                          isLinked ? "border-primary/60 bg-primary/10" : "border-border bg-surface/50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-full bg-black/40 border border-border flex items-center justify-center font-bold text-xs text-primary">
                            {bot.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{bot.name}</p>
                            <p className="text-xs text-muted-foreground">
                              @{bot.telegram_username?.replace("@", "") || "bot"}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={isLinked}
                          onCheckedChange={(checked) => {
                            const updated = checked
                              ? [...config.bots.linkedBots, bot.id]
                              : config.bots.linkedBots.filter((id) => id !== bot.id);
                            setConfig({ ...config, bots: { ...config.bots, linkedBots: updated } });
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="grid gap-4 sm:grid-cols-2 pt-4">
                  <div className="space-y-2">
                    <Label>Canal ou Grupo para Cache de Mídia (Telegram)</Label>
                    <Input
                      placeholder="@seu_canal_cache ou ID"
                      value={config.bots.mediaCacheChannel}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          bots: { ...config.bots, mediaCacheChannel: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>@ Suporte (opcional)</Label>
                    <Input
                      placeholder="@username"
                      value={config.bots.supportUsername}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          bots: { ...config.bots, supportUsername: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA BLOCO INICIAL — BOAS-VINDAS (/start) */}
          {activeTab === "gate" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="size-5 text-[#38BDF8]" /> Bloco Inicial — Boas-vindas (/start)
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Disparado automaticamente quando o lead envia /start. Envia as mídias e a copy única vinculada aos botões de idioma.
                  </p>
                </div>
                {/* Barra de métricas rápidas estilo SharkBot */}
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/50 px-3.5 py-2 text-xs">
                  <span className="text-zinc-400">
                    <strong className="text-white">{flowStats?.pixGenerated ?? 0}</strong> PIX gerados
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-zinc-400">
                    <strong className="text-emerald-400">{flowStats?.pixPaid ?? 0}</strong> pagos
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-zinc-400">
                    <strong className="text-cyan-300">{(flowStats?.conversionPct ?? 0).toFixed(1)}%</strong> conv.
                  </span>
                  <span className="text-zinc-600">•</span>
                  <strong className="text-emerald-300">{formatFlowBRL(flowStats?.revenueCents ?? 0)}</strong>
                </div>
              </div>

              {/* Upload de mídias direto do PC */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-zinc-300">
                  Mídias Iniciais do Start (Fotos / Vídeos)
                </Label>
                <FlowMediaUploader
                  media={config.welcome.media}
                  mode={config.welcome.mediaMode}
                  onModeChange={(m) =>
                    setConfig({ ...config, welcome: { ...config.welcome, mediaMode: m } })
                  }
                  onChange={(items) =>
                    setConfig({ ...config, welcome: { ...config.welcome, media: items } })
                  }
                  maxItems={3}
                />
              </div>

              {/* Bloco Inicial — Boas-vindas (Copy Única, não bilíngue) */}
              <div className="p-5 rounded-2xl border border-white/10 bg-[#09090E]/90 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      Mensagem de Boas-vindas (Copy Única) *
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Campo dedicado e único (não bilíngue). Vinculado automaticamente aos botões de seleção de idioma.
                    </p>
                  </div>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    {(config.welcome.startMessage || config.gate?.welcomeMessagePt || "").length}/4000
                  </span>
                </div>

                <div className="space-y-2">
                  <TelegramFormattingToolbar
                    currentText={config.welcome.startMessage || config.gate?.welcomeMessagePt || ""}
                    onChange={(nextVal) =>
                      setConfig({
                        ...config,
                        welcome: { ...config.welcome, startMessage: nextVal },
                        gate: { ...(config.gate || defaultAdvancedConfig().gate), welcomeMessagePt: nextVal },
                      })
                    }
                  />
                  <Textarea
                    rows={5}
                    value={
                      config.welcome.startMessage ||
                      config.gate?.welcomeMessagePt ||
                      "Olá! Seja muito bem-vindo(a)! 👋\n\nEstamos felizes em ter você aqui.\n\nAntes de continuar, escolha o seu idioma de preferência abaixo / Before continuing, please choose your preferred language below:"
                    }
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        welcome: {
                          ...config.welcome,
                          startMessage: e.target.value,
                        },
                        gate: {
                          ...(config.gate || defaultAdvancedConfig().gate),
                          welcomeMessagePt: e.target.value,
                        },
                      })
                    }
                    placeholder="Olá! Seja muito bem-vindo(a)! Antes de continuar, escolha o seu idioma..."
                    className="bg-black/50 border-white/10 text-white text-xs leading-relaxed focus:border-[#38BDF8]"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {["{nome}", "{saudacao}", "{cidade}", "{uf}", "{bot_name}"].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const current = config.welcome.startMessage || config.gate?.welcomeMessagePt || "";
                          const updated = current + " " + tag;
                          setConfig({
                            ...config,
                            welcome: { ...config.welcome, startMessage: updated },
                            gate: { ...(config.gate || defaultAdvancedConfig().gate), welcomeMessagePt: updated },
                          });
                        }}
                        className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-mono text-zinc-300 hover:bg-white/10 border border-white/10"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Preview no estilo Telegram */}
                <div className="pt-2 border-t border-white/5">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Prévia do /start no Telegram (Copy Única + Botões de Idioma):
                  </p>
                  <div className="max-w-md rounded-2xl bg-[#0e1621] border border-white/10 p-4 space-y-3 shadow-lg">
                    <p className="text-xs text-white whitespace-pre-wrap leading-relaxed">
                      {config.welcome.startMessage ||
                        config.gate?.welcomeMessagePt ||
                        "Olá! Seja muito bem-vindo(a)! 👋\n\nAntes de continuar, escolha o seu idioma / Please choose your language:"}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="py-2 rounded-xl bg-[#2481cc] text-white text-center font-bold text-xs shadow cursor-pointer">
                        🇧🇷 Português
                      </div>
                      <div className="py-2 rounded-xl bg-[#2481cc] text-white text-center font-bold text-xs shadow cursor-pointer">
                        🇺🇸 English
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA BLOCOS PRINCIPAIS DO FLUXO (Inputs Bilíngues) */}
          {activeTab === "welcome" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="border-b border-border/60 pb-4">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <MessageSquare className="size-5 text-primary" /> Copy Principal do Bot (Inputs Bilíngues)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Mensagem exibida imediatamente após o lead selecionar o idioma (a mensagem de boas-vindas anterior é apagada).
                </p>
              </div>

              {/* Alternador Rápido de Idioma da Copy Principal */}
              <div className="rounded-2xl border border-white/10 bg-[#09090E]/90 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      Copy Principal por Idioma
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Configure a copy para cada bifurcação do fluxo.
                    </p>
                  </div>

                  <div className="flex bg-black/60 p-1 rounded-xl border border-white/10">
                    <button
                      type="button"
                      onClick={() => setBilingualTab("pt")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                        bilingualTab === "pt"
                          ? "bg-[#1049B8] text-white shadow-md shadow-[#1049B8]/40"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      🇧🇷 Português (PT-BR)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBilingualTab("en")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                        bilingualTab === "en"
                          ? "bg-[#1049B8] text-white shadow-md shadow-[#1049B8]/40"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      🇺🇸 English (EN-US)
                    </button>
                  </div>
                </div>

                {bilingualTab === "pt" ? (
                  /* Painel PT-BR */
                  <div className="space-y-4">
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-3 text-xs text-emerald-300">
                      ✓ <strong>Fluxo Português:</strong> Ao clicar em Português, a mensagem de boas-vindas é apagada e esta copy é exibida junto com todos os <strong>Planos de Pagamento diretos em PIX (BRL)</strong>, sem etapa intermediária de moeda.
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-zinc-300 font-semibold">
                          Copy Principal (Português) *
                        </Label>
                        <span className="text-[11px] text-zinc-500 font-mono">
                          {(config.welcome.messagePt || config.welcome.message).length}/4000
                        </span>
                      </div>
                      <TelegramFormattingToolbar
                        currentText={config.welcome.messagePt || config.welcome.message}
                        onChange={(nextVal) =>
                          setConfig({
                            ...config,
                            welcome: { ...config.welcome, messagePt: nextVal, message: nextVal },
                          })
                        }
                      />
                      <Textarea
                        rows={5}
                        value={config.welcome.messagePt || config.welcome.message}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            welcome: {
                              ...config.welcome,
                              messagePt: e.target.value,
                              message: e.target.value,
                            },
                          })
                        }
                        placeholder="Olá! Seja muito bem-vindo(a) ao nosso atendimento VIP! Escolha seu plano exclusivo abaixo:"
                        className="bg-black/50 border-white/10 text-white text-xs leading-relaxed focus:border-[#38BDF8]"
                      />
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {["{nome}", "{bot_name}", "{saudacao}", "{cidade}", "{uf}"].map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() =>
                              setConfig({
                                ...config,
                                welcome: {
                                  ...config.welcome,
                                  messagePt: (config.welcome.messagePt || config.welcome.message) + " " + tag,
                                  message: (config.welcome.messagePt || config.welcome.message) + " " + tag,
                                },
                              })
                            }
                            className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-mono text-zinc-300 hover:bg-white/10 border border-white/10"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Painel EN-US */
                  <div className="space-y-4">
                    <div className="rounded-xl border border-blue-500/20 bg-blue-950/15 p-3 text-xs text-blue-300">
                      ✓ <strong>Fluxo Inglês:</strong> Ao clicar em English, a mensagem de boas-vindas é apagada e esta copy é exibida junto com as opções de moeda: <strong>Dólar (USD)</strong>, <strong>Euro (EUR)</strong> e <strong>Libra (GBP)</strong>. Após o lead selecionar a moeda, os planos são exibidos.
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-zinc-300 font-semibold">
                          Main Copy (English) *
                        </Label>
                        <span className="text-[11px] text-zinc-500 font-mono">
                          {(config.welcome.messageEn || "").length}/4000
                        </span>
                      </div>
                      <TelegramFormattingToolbar
                        currentText={config.welcome.messageEn || ""}
                        onChange={(nextVal) =>
                          setConfig({
                            ...config,
                            welcome: { ...config.welcome, messageEn: nextVal },
                          })
                        }
                      />
                      <Textarea
                        rows={5}
                        value={config.welcome.messageEn || ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            welcome: { ...config.welcome, messageEn: e.target.value },
                          })
                        }
                        placeholder="Hello! Welcome to our VIP service. Please choose your preferred currency below to view our plans:"
                        className="bg-black/50 border-white/10 text-white text-xs leading-relaxed focus:border-[#38BDF8]"
                      />
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {["{nome}", "{bot_name}", "{saudacao}"].map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() =>
                              setConfig({
                                ...config,
                                welcome: {
                                  ...config.welcome,
                                  messageEn: (config.welcome.messageEn || "") + " " + tag,
                                },
                              })
                            }
                            className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-mono text-zinc-300 hover:bg-white/10 border border-white/10"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Controles Extras Estilo SharkBot: Mídia da Copy Principal, Mensagem Secundária, CTA, Redirects e Mini App */}
                <div className="grid gap-4 pt-3 border-t border-white/5">
                  <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2">
                    <FlowMediaUploader
                      media={config.welcome.media}
                      mode={config.welcome.mediaMode}
                      onModeChange={(m) =>
                        setConfig({
                          ...config,
                          welcome: { ...config.welcome, mediaMode: m },
                        })
                      }
                      onChange={(items) =>
                        setConfig({
                          ...config,
                          welcome: { ...config.welcome, media: items },
                        })
                      }
                      maxItems={5}
                    />
                  </div>
                  {/* Mensagem Secundária */}
                  <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-white">Mensagem Secundária</p>
                        <p className="text-[11px] text-zinc-400">
                          Envia uma segunda mensagem separada logo abaixo onde os botões dos planos serão anexados.
                        </p>
                      </div>
                      <Switch
                        checked={config.welcome.hasSecondaryMessage}
                        onCheckedChange={(checked) =>
                          setConfig({
                            ...config,
                            welcome: { ...config.welcome, hasSecondaryMessage: checked },
                          })
                        }
                      />
                    </div>
                    {config.welcome.hasSecondaryMessage ? (
                      <Textarea
                        rows={2}
                        value={config.welcome.secondaryMessage}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            welcome: { ...config.welcome, secondaryMessage: e.target.value },
                          })
                        }
                        placeholder="Selecione abaixo o plano ideal para o seu acesso imediato:"
                        className="bg-black/50 border-white/10 text-xs"
                      />
                    ) : null}
                  </div>

                  {/* Botão CTA + Mini App */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-white">Botão CTA Inicial</p>
                          <p className="text-[11px] text-zinc-400">Exibe botão antes de expandir planos</p>
                        </div>
                        <Switch
                          checked={config.welcome.hasCtaButton}
                          onCheckedChange={(checked) =>
                            setConfig({
                              ...config,
                              welcome: { ...config.welcome, hasCtaButton: checked },
                            })
                          }
                        />
                      </div>
                      {config.welcome.hasCtaButton ? (
                        <Input
                          value={config.welcome.ctaButtonText}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              welcome: { ...config.welcome, ctaButtonText: e.target.value },
                            })
                          }
                          placeholder="💎 Ver Planos VIP"
                          className="h-8 text-xs bg-black/60 border-white/10"
                        />
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/40 p-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-white">Experiência Mini App</p>
                          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[9px]">
                            NOVO
                          </Badge>
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          Habilita navegação interativa rápida antes do checkout.
                        </p>
                      </div>
                      <Switch
                        checked={config.welcome.miniAppEnabled}
                        onCheckedChange={(checked) =>
                          setConfig({
                            ...config,
                            welcome: { ...config.welcome, miniAppEnabled: checked },
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Botões Redirect (até 3) */}
                  <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-white">
                          Botões Redirect Externos ({config.welcome.redirectButtons?.length ?? 0}/3)
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          Links externos para canal de prévias, suporte ou checkout mundial.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={(config.welcome.redirectButtons?.length ?? 0) >= 3}
                        onClick={() => {
                          const current = config.welcome.redirectButtons ?? [];
                          if (current.length >= 3) return;
                          setConfig({
                            ...config,
                            welcome: {
                              ...config.welcome,
                              redirectButtons: [
                                ...current,
                                {
                                  id: `redir-${Date.now()}`,
                                  label: "📺 Ver Prévias",
                                  url: "https://t.me/",
                                  active: true,
                                },
                              ],
                            },
                          });
                        }}
                        className="h-7 text-xs border-white/10"
                      >
                        <Plus className="size-3 mr-1" /> Adicionar ({config.welcome.redirectButtons?.length ?? 0}/3)
                      </Button>
                    </div>

                    {(config.welcome.redirectButtons ?? []).map((btn) => (
                      <div
                        key={btn.id}
                        className="grid gap-2 sm:grid-cols-[auto_1fr_1.4fr_auto] items-center rounded-lg border border-white/10 bg-black/50 p-2.5"
                      >
                        <Switch
                          checked={btn.active}
                          onCheckedChange={(checked) => {
                            const updated = (config.welcome.redirectButtons ?? []).map((b) =>
                              b.id === btn.id ? { ...b, active: checked } : b,
                            );
                            setConfig({ ...config, welcome: { ...config.welcome, redirectButtons: updated } });
                          }}
                        />
                        <Input
                          value={btn.label}
                          onChange={(e) => {
                            const updated = (config.welcome.redirectButtons ?? []).map((b) =>
                              b.id === btn.id ? { ...b, label: e.target.value } : b,
                            );
                            setConfig({ ...config, welcome: { ...config.welcome, redirectButtons: updated } });
                          }}
                          placeholder="📺 Ver Prévias"
                          className="h-8 text-xs bg-black/60 border-white/10"
                        />
                        <Input
                          value={btn.url}
                          onChange={(e) => {
                            const updated = (config.welcome.redirectButtons ?? []).map((b) =>
                              b.id === btn.id ? { ...b, url: e.target.value } : b,
                            );
                            setConfig({ ...config, welcome: { ...config.welcome, redirectButtons: updated } });
                          }}
                          placeholder="https://t.me/+..."
                          className="h-8 text-xs font-mono bg-black/60 border-white/10"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 text-zinc-400 hover:text-red-400"
                          onClick={() => {
                            const updated = (config.welcome.redirectButtons ?? []).filter((b) => b.id !== btn.id);
                            setConfig({ ...config, welcome: { ...config.welcome, redirectButtons: updated } });
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Preview no estilo Telegram */}
                <div className="pt-2 border-t border-white/5">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Prévia da Mensagem Principal no Telegram ({bilingualTab === "pt" ? "Português 🇧🇷" : "English 🇺🇸"}):
                  </p>
                  <div className="max-w-md rounded-2xl bg-[#0e1621] border border-white/10 p-4 space-y-3 shadow-lg">
                    <p className="text-xs text-white whitespace-pre-wrap leading-relaxed">
                      {bilingualTab === "pt"
                        ? (config.welcome.messagePt || config.welcome.message || "Olá! Bem-vindo(a) ao nosso atendimento VIP! Escolha seu plano exclusivo abaixo:")
                        : (config.welcome.messageEn || "Hello! Welcome to our VIP service. Please choose your preferred currency below to view our plans:")}
                    </p>

                    {bilingualTab === "pt" ? (
                      /* Em Português: Todos os planos diretamente abaixo da copy */
                      <div className="space-y-1.5">
                        {config.plans.items.slice(0, 3).map((p) => (
                          <div
                            key={p.id}
                            className="w-full py-2 rounded-xl bg-[#2481cc] hover:bg-[#2072b4] text-white text-center font-bold text-xs shadow cursor-pointer transition truncate px-2"
                          >
                            {p.buttonText?.trim() || `${p.emoji || "💎"} ${p.name} por R$ ${Number(p.price || 0).toFixed(2).replace(".", ",")}`}
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* Em Inglês: Moedas Dólar, Euro e Libra abaixo da copy */
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="py-2 rounded-xl bg-[#2481cc] text-white text-center font-bold text-xs shadow cursor-pointer">
                          💵 USD ($)
                        </div>
                        <div className="py-2 rounded-xl bg-[#2481cc] text-white text-center font-bold text-xs shadow cursor-pointer">
                          💶 EUR (€)
                        </div>
                        <div className="py-2 rounded-xl bg-[#2481cc] text-white text-center font-bold text-xs shadow cursor-pointer">
                          💷 GBP (£)
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA PLANOS */}
          {activeTab === "plans" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="flex items-center justify-between border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <CreditCard className="size-5 text-primary" /> Planos de Pagamento
                  </h2>
                  <p className="text-xs text-muted-foreground">Configure os planos e botões do funil</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const newPlan = {
                      id: `plan-${Date.now()}`,
                      name: "NOVO PLANO",
                      price: 19.9,
                      priceUsd: 9.9,
                      priceEur: 8.9,
                      priceGbp: 7.9,
                      duration: "Vitalício",
                      buttonColor: "default" as const,
                      deliveryType: "fallback" as const,
                      hasCustomOrderBump: false,
                      stripeMode: "payment" as const,
                      stripePriceId: "",
                    };
                    setConfig({
                      ...config,
                      plans: { ...config.plans, items: [...config.plans.items, newPlan] },
                    });
                  }}
                >
                  <Plus className="size-4 mr-1" /> Adicionar Plano
                </Button>
              </div>

              <div className="grid gap-6 lg:grid-cols-12">
                {/* Coluna Esquerda: Edição dos Planos (7 cols) */}
                <div className="lg:col-span-7 space-y-4">
                  {config.plans.items.map((plan, idx) => {
                    const priceFormatted = Number(plan.price || 0).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    });
                    const emoji = plan.emoji || (idx === 0 ? "🎗️" : idx === 1 ? "💎" : "👑");
                    const previewText =
                      plan.buttonText?.trim() || `${emoji} ${plan.name} ${emoji} por R$ ${priceFormatted}`;

                    return (
                      <div
                        key={plan.id}
                        className="p-5 rounded-2xl border border-white/10 bg-[#0d0e14]/90 space-y-4 shadow-lg"
                      >
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="flex size-6 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 font-bold text-xs">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-sm text-white">{plan.name}</span>
                            <Badge variant="outline" className="text-[10px] border-cyan-500/40 text-cyan-300">
                              R$ {priceFormatted}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              title="Mover plano para cima"
                              onClick={() => {
                                const arr = [...config.plans.items];
                                const cur = arr[idx];
                                const prevItem = arr[idx - 1];
                                if (cur && prevItem) {
                                  arr[idx] = prevItem;
                                  arr[idx - 1] = cur;
                                  setConfig({ ...config, plans: { ...config.plans, items: arr } });
                                }
                              }}
                              className="p-1 text-zinc-400 hover:text-white disabled:opacity-30"
                            >
                              <ChevronUp className="size-4" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === config.plans.items.length - 1}
                              title="Mover plano para baixo"
                              onClick={() => {
                                const arr = [...config.plans.items];
                                const cur = arr[idx];
                                const nextItem = arr[idx + 1];
                                if (cur && nextItem) {
                                  arr[idx] = nextItem;
                                  arr[idx + 1] = cur;
                                  setConfig({ ...config, plans: { ...config.plans, items: arr } });
                                }
                              }}
                              className="p-1 text-zinc-400 hover:text-white disabled:opacity-30"
                            >
                              <ChevronDown className="size-4" />
                            </button>
                            <button
                              type="button"
                              title="Duplicar plano"
                              onClick={() => {
                                const dup = {
                                  ...plan,
                                  id: `plan-${Date.now()}`,
                                  name: `${plan.name} (Cópia)`,
                                };
                                setConfig({
                                  ...config,
                                  plans: { ...config.plans, items: [...config.plans.items, dup] },
                                });
                                toast.success("Plano duplicado!");
                              }}
                              className="p-1 text-cyan-400 hover:text-cyan-300"
                            >
                              <Copy className="size-3.5" />
                            </button>
                            {config.plans.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfig({
                                    ...config,
                                    plans: {
                                      ...config.plans,
                                      items: config.plans.items.filter((p) => p.id !== plan.id),
                                    },
                                  });
                                }}
                                className="text-red-400 hover:text-red-300 p-1"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <Label className="text-xs text-zinc-300">Nome do Plano</Label>
                            <Input
                              value={plan.name}
                              className="bg-black/40 border-white/10 text-white text-xs h-9"
                              onChange={(e) => {
                                const updated = config.plans.items.map((p) =>
                                  p.id === plan.id ? { ...p, name: e.target.value } : p
                                );
                                setConfig({ ...config, plans: { ...config.plans, items: updated } });
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-zinc-300">Preço (BRL)</Label>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={priceDrafts[`${plan.id}:brl`] ?? String(plan.price ?? "")}
                              className="bg-black/40 border-white/10 text-white text-xs h-9 font-bold text-cyan-300"
                              onChange={(e) => {
                                const raw = e.target.value;
                                setPriceDrafts((prev) => ({ ...prev, [`${plan.id}:brl`]: raw }));
                                const parsed = raw.trim() === "" ? 0 : Number(raw.replace(",", "."));
                                if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
                                  const updated = config.plans.items.map((p) =>
                                    p.id === plan.id ? { ...p, price: Math.max(0, parsed) } : p,
                                  );
                                  setConfig({ ...config, plans: { ...config.plans, items: updated } });
                                }
                              }}
                              onBlur={() => {
                                setPriceDrafts((prev) => {
                                  const next = { ...prev };
                                  delete next[`${plan.id}:brl`];
                                  return next;
                                });
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-zinc-300">Duração</Label>
                            <Input
                              value={plan.duration}
                              className="bg-black/40 border-white/10 text-white text-xs h-9"
                              onChange={(e) => {
                                const updated = config.plans.items.map((p) =>
                                  p.id === plan.id ? { ...p, duration: e.target.value } : p
                                );
                                setConfig({ ...config, plans: { ...config.plans, items: updated } });
                              }}
                            />
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {["7 Dias", "Mensal", "Trimestral", "Anual", "Vitalício"].map((dur) => (
                                <button
                                  key={dur}
                                  type="button"
                                  onClick={() => {
                                    const updated = config.plans.items.map((p) =>
                                      p.id === plan.id ? { ...p, duration: dur } : p,
                                    );
                                    setConfig({ ...config, plans: { ...config.plans, items: updated } });
                                  }}
                                  className={`rounded px-1.5 py-0.5 text-[10px] border transition ${
                                    plan.duration === dur
                                      ? "border-cyan-400 bg-cyan-500/20 text-cyan-300 font-semibold"
                                      : "border-white/10 bg-white/5 text-zinc-400 hover:text-white"
                                  }`}
                                >
                                  {dur}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Cores e Emojis do Botão */}
                        <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-white/5">
                          <div>
                            <Label className="text-xs text-zinc-400">Cor do Botão no Preview</Label>
                            <select
                              value={plan.buttonColor || "blue"}
                              onChange={(e) => {
                                const updated = config.plans.items.map((p) =>
                                  p.id === plan.id ? { ...p, buttonColor: e.target.value as any } : p
                                );
                                setConfig({ ...config, plans: { ...config.plans, items: updated } });
                              }}
                              className="w-full h-9 rounded-xl border border-white/10 bg-black/60 px-3 text-xs text-white"
                            >
                              <option value="blue">🔵 Azul Clássico</option>
                              <option value="green">🟢 Verde Destaque</option>
                              <option value="gold">🟡 Dourado / Âmbar</option>
                              <option value="purple">🟣 Roxo CASH BOT</option>
                              <option value="red">🔴 Vermelho / Marrom</option>
                            </select>
                          </div>

                          <div>
                            <Label className="text-xs text-zinc-400">Emoji do Botão</Label>
                            <div className="flex items-center gap-1.5 mt-1">
                              {["🎗️", "💎", "👑", "🎁", "🔒", "🔥", "⚡"].map((em) => (
                                <button
                                  key={em}
                                  type="button"
                                  onClick={() => {
                                    const updated = config.plans.items.map((p) =>
                                      p.id === plan.id ? { ...p, emoji: em } : p
                                    );
                                    setConfig({ ...config, plans: { ...config.plans, items: updated } });
                                  }}
                                  className={`size-7 text-xs flex items-center justify-center rounded-lg border transition ${
                                    plan.emoji === em
                                      ? "bg-cyan-500/30 border-cyan-400 scale-110"
                                      : "bg-white/5 border-white/10 hover:bg-white/10"
                                  }`}
                                >
                                  {em}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <Label className="text-[11px] text-zinc-400">
                              Texto Exibido no Botão (Com valor ao lado):
                            </Label>
                            {plan.buttonText?.trim() ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = config.plans.items.map((p) =>
                                    p.id === plan.id ? { ...p, buttonText: "" } : p,
                                  );
                                  setConfig({ ...config, plans: { ...config.plans, items: updated } });
                                }}
                                className="text-[10px] font-semibold text-cyan-400 hover:underline"
                              >
                                Restaurar automático (Nome + Preço)
                              </button>
                            ) : null}
                          </div>
                          <Input
                            value={plan.buttonText || ""}
                            placeholder={previewText}
                            className="bg-black/50 border-white/10 text-white text-xs h-8 font-mono"
                            onChange={(e) => {
                              const updated = config.plans.items.map((p) =>
                                p.id === plan.id ? { ...p, buttonText: e.target.value } : p
                              );
                              setConfig({ ...config, plans: { ...config.plans, items: updated } });
                            }}
                          />
                        </div>

                        {/* Moedas Internacionais & Configuração Stripe */}
                        <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <Globe className="size-3.5 text-cyan-400" /> Preços Internacionais & Stripe (Cartão)
                            </span>
                            <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400">
                              USD • EUR • GBP
                            </Badge>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                              <Label className="text-[11px] text-zinc-400">Preço em Dólares ($ USD)</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                placeholder={plan.price ? String(plan.price) : "29.90"}
                                value={priceDrafts[`${plan.id}:usd`] ?? (plan.priceUsd !== undefined ? String(plan.priceUsd) : "")}
                                className="bg-black/60 border-white/10 text-white text-xs h-8 font-mono"
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setPriceDrafts((prev) => ({ ...prev, [`${plan.id}:usd`]: raw }));
                                  const trimmed = raw.trim();
                                  const parsed = trimmed === "" ? undefined : Number(trimmed.replace(",", "."));
                                  if (parsed === undefined || (!Number.isNaN(parsed) && Number.isFinite(parsed))) {
                                    const updated = config.plans.items.map((p) => {
                                      if (p.id !== plan.id) return p;
                                      const { priceUsd: _drop, ...rest } = p;
                                      return parsed !== undefined && parsed >= 0 ? { ...rest, priceUsd: parsed } : rest;
                                    });
                                    setConfig({ ...config, plans: { ...config.plans, items: updated } });
                                  }
                                }}
                                onBlur={() => {
                                  setPriceDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[`${plan.id}:usd`];
                                    return next;
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <Label className="text-[11px] text-zinc-400">Preço em Euros (€ EUR)</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                placeholder={plan.price ? String(plan.price) : "29.90"}
                                value={priceDrafts[`${plan.id}:eur`] ?? (plan.priceEur !== undefined ? String(plan.priceEur) : "")}
                                className="bg-black/60 border-white/10 text-white text-xs h-8 font-mono"
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setPriceDrafts((prev) => ({ ...prev, [`${plan.id}:eur`]: raw }));
                                  const trimmed = raw.trim();
                                  const parsed = trimmed === "" ? undefined : Number(trimmed.replace(",", "."));
                                  if (parsed === undefined || (!Number.isNaN(parsed) && Number.isFinite(parsed))) {
                                    const updated = config.plans.items.map((p) => {
                                      if (p.id !== plan.id) return p;
                                      const { priceEur: _drop, ...rest } = p;
                                      return parsed !== undefined && parsed >= 0 ? { ...rest, priceEur: parsed } : rest;
                                    });
                                    setConfig({ ...config, plans: { ...config.plans, items: updated } });
                                  }
                                }}
                                onBlur={() => {
                                  setPriceDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[`${plan.id}:eur`];
                                    return next;
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <Label className="text-[11px] text-zinc-400">Preço em Libras (£ GBP)</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                placeholder={plan.price ? String(plan.price) : "29.90"}
                                value={priceDrafts[`${plan.id}:gbp`] ?? (plan.priceGbp !== undefined ? String(plan.priceGbp) : "")}
                                className="bg-black/60 border-white/10 text-white text-xs h-8 font-mono"
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setPriceDrafts((prev) => ({ ...prev, [`${plan.id}:gbp`]: raw }));
                                  const trimmed = raw.trim();
                                  const parsed = trimmed === "" ? undefined : Number(trimmed.replace(",", "."));
                                  if (parsed === undefined || (!Number.isNaN(parsed) && Number.isFinite(parsed))) {
                                    const updated = config.plans.items.map((p) => {
                                      if (p.id !== plan.id) return p;
                                      const { priceGbp: _drop, ...rest } = p;
                                      return parsed !== undefined && parsed >= 0 ? { ...rest, priceGbp: parsed } : rest;
                                    });
                                    setConfig({ ...config, plans: { ...config.plans, items: updated } });
                                  }
                                }}
                                onBlur={() => {
                                  setPriceDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[`${plan.id}:gbp`];
                                    return next;
                                  });
                                }}
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2 pt-1 border-t border-white/5">
                            <div>
                              <Label className="text-[11px] text-zinc-400">Tipo de Cobrança Stripe</Label>
                              <select
                                value={plan.stripeMode || "payment"}
                                onChange={(e) => {
                                  const updated = config.plans.items.map((p) =>
                                    p.id === plan.id
                                      ? { ...p, stripeMode: e.target.value as "payment" | "subscription" }
                                      : p
                                  );
                                  setConfig({ ...config, plans: { ...config.plans, items: updated } });
                                }}
                                className="w-full h-8 rounded-lg border border-white/10 bg-black/60 px-2.5 text-xs text-white"
                              >
                                <option value="payment">💳 Pagamento Único (Checkout)</option>
                                <option value="subscription">🔄 Assinatura Recorrente</option>
                              </select>
                            </div>
                            <div>
                              <Label className="text-[11px] text-zinc-400">
                                Price ID Stripe <span className="text-[10px] text-zinc-500">(Opcional)</span>
                              </Label>
                              <Input
                                placeholder="price_1N... (automático se vazio)"
                                value={plan.stripePriceId || ""}
                                className="bg-black/60 border-white/10 text-white text-xs h-8 font-mono"
                                onChange={(e) => {
                                  const updated = config.plans.items.map((p) =>
                                    p.id === plan.id ? { ...p, stripePriceId: e.target.value } : p
                                  );
                                  setConfig({ ...config, plans: { ...config.plans, items: updated } });
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Entrega Padrão (Fallback) — Estilo SharkBot */}
                  <div className="p-5 rounded-2xl border border-emerald-500/25 bg-emerald-950/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-emerald-400" /> Entrega Padrão do Fluxo (Fallback)
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Enviada automaticamente no Telegram após a aprovação do PIX ou Cartão Stripe.
                        </p>
                      </div>
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 text-[10px]">
                        Entrega Automática
                      </Badge>
                    </div>
                    <Textarea
                      rows={3}
                      value={config.plans.deliveryFallback || ""}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          plans: { ...config.plans, deliveryFallback: e.target.value },
                        })
                      }
                      placeholder="🎉 Parabéns! Seu pagamento foi confirmado! Acesse seu conteúdo exclusivo aqui: https://t.me/+..."
                      className="bg-black/50 border-white/10 text-white text-xs"
                    />
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      {[
                        "Grupo / Canal VIP (Link)",
                        "Link Externo / Drive",
                        "Apenas Mensagem",
                        "Chamada de Vídeo",
                        "Estoque (Códigos)",
                        "Grupo Temporário",
                        "Apenas Upsell",
                      ].map((modeLabel) => (
                        <button
                          key={modeLabel}
                          type="button"
                          onClick={() => {
                            if (!config.plans.deliveryFallback?.trim()) {
                              setConfig({
                                ...config,
                                plans: {
                                  ...config.plans,
                                  deliveryFallback:
                                    modeLabel.includes("Grupo")
                                      ? "🎉 Acesso VIP liberado! Entre no canal exclusivo pelo link: https://t.me/+"
                                      : modeLabel.includes("Link")
                                      ? "✅ Compra confirmada! Acesse seu conteúdo agora: https://"
                                      : "🎉 Obrigado pela compra! Seu acesso foi confirmado com sucesso.",
                                },
                              });
                            }
                          }}
                          className="rounded-md border border-white/10 bg-black/40 px-2 py-0.5 text-zinc-300 hover:border-emerald-400/50 hover:text-emerald-300"
                        >
                          {modeLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Coluna Direita: Live Preview dos Botões no Telegram (5 cols) */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="sticky top-6 rounded-2xl border border-white/10 bg-[#090a0f] p-5 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <div className="flex items-center gap-2">
                        <Bot className="size-4 text-cyan-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                          Preview dos Botões no Telegram
                        </h4>
                      </div>
                      <Badge className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px]">
                        Ao Vivo
                      </Badge>
                    </div>

                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Assim que o lead der /start, estes botões com valor e emojis aparecerão para escolha do plano:
                    </p>

                    {/* SELETOR DE MOEDA NO PREVIEW */}
                    <div className="flex items-center gap-1 p-1 bg-black/60 rounded-xl border border-white/10">
                      {(["BRL", "USD", "EUR", "GBP"] as const).map((curr) => (
                        <button
                          key={curr}
                          type="button"
                          onClick={() => setPreviewCurrency(curr)}
                          className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                            previewCurrency === curr
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                              : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          <span>{curr === "BRL" ? "🇧🇷" : curr === "USD" ? "🇺🇸" : curr === "EUR" ? "🇪🇺" : "🇬🇧"}</span>
                          <span>{curr}</span>
                        </button>
                      ))}
                    </div>

                    {/* MOCKUP EXATO DO TELEGRAM COM BOTÕES COLORIDOS */}
                    <div className="rounded-xl border border-white/10 bg-[#161a23]/90 p-3.5 space-y-2.5 shadow-inner">
                      {previewCurrency === "BRL" ? (
                        <>
                          {config.plans.items.map((plan, idx) => {
                            const priceFormatted = Number(plan.price || 0).toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            });
                            const emoji = plan.emoji || (idx === 0 ? "🎗️" : idx === 1 ? "💎" : "👑");
                            const label =
                              plan.buttonText?.trim() || `${emoji} ${plan.name} ${emoji} por R$ ${priceFormatted}`;

                            const colorClasses =
                              plan.buttonColor === "green"
                                ? "bg-[#4b9e67] hover:bg-[#43915d] text-white"
                                : plan.buttonColor === "gold"
                                ? "bg-[#d29922] hover:bg-[#b0801a] text-black font-extrabold"
                                : plan.buttonColor === "red"
                                ? "bg-[#b94a48] hover:bg-[#a33e3c] text-white"
                                : plan.buttonColor === "purple"
                                ? "bg-[#7c3aed] hover:bg-[#6d28d9] text-white"
                                : "bg-[#4693b7] hover:bg-[#3c81a2] text-white";

                            return (
                              <div
                                key={plan.id}
                                className={`w-full py-3 px-4 rounded-xl text-center text-sm font-bold shadow-md transition transform active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${colorClasses}`}
                              >
                                <span>{label}</span>
                              </div>
                            );
                          })}

                          {/* Botão de Redirecionamento Mundial */}
                          <div className="w-full py-3 px-4 rounded-xl text-center text-sm font-bold shadow-md bg-[#b95d52] hover:bg-[#a64e43] text-white cursor-pointer flex items-center justify-center gap-2">
                            <span>PAGAMENTOS MUNDIAIS 🇺🇸 🇬🇧 🇪🇺</span>
                            <span className="text-xs">↗</span>
                          </div>
                        </>
                      ) : (
                        <>
                          {config.plans.items.map((plan, idx) => {
                            const customPrice =
                              previewCurrency === "USD"
                                ? plan.priceUsd
                                : previewCurrency === "EUR"
                                ? plan.priceEur
                                : plan.priceGbp;
                            const conv = formatCurrencyPrice(plan.price, previewCurrency, customPrice);
                            const emoji = plan.emoji ? `${plan.emoji} ` : "⭐ ";
                            const label =
                              plan.buttonText?.trim() || `${emoji}${plan.name} — ${conv.formatted} [ GET ACCESS ]`;

                            return (
                              <div
                                key={plan.id}
                                className="w-full py-3 px-4 rounded-xl text-center text-sm font-bold shadow-md bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:opacity-95 text-white cursor-pointer flex items-center justify-center gap-1.5 transition"
                              >
                                <span>{label}</span>
                              </div>
                            );
                          })}

                          <div className="w-full py-2.5 px-3 rounded-xl text-center text-xs font-semibold bg-white/5 border border-white/10 text-zinc-300 flex items-center justify-center gap-2">
                            <span>🌐 Change Currency</span>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3 text-[11px] text-cyan-300/90 space-y-1">
                      <p className="font-bold flex items-center gap-1">
                        <Sparkles className="size-3.5" /> {previewCurrency === "BRL" ? "PIX Dinâmico Instantâneo:" : "Checkout Stripe Integrado:"}
                      </p>
                      <p>
                        {previewCurrency === "BRL"
                          ? "O lead escolhe o plano clicando no botão. O PIX será gerado com o nome e valor exatos do plano escolhido."
                          : "O lead internacional recebe o link direto com cartão de crédito, Apple Pay e Google Pay na moeda selecionada via Stripe."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA IDIOMAS & MOEDAS INTERNACIONAIS (DESACOPLADA / REDIRECIONADA) */}
          {activeTab === "multilingual" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="rounded-2xl border border-[#1049B8]/40 bg-gradient-to-r from-[#050508] via-[#0B3B99]/20 to-[#1049B8]/30 p-6 text-center space-y-3">
                <Sparkles className="size-8 text-[#38BDF8] mx-auto" />
                <h3 className="font-bold text-white text-base">
                  Idioma e Moeda foram desacoplados do construtor
                </h3>
                <p className="text-xs text-zinc-300 max-w-md mx-auto">
                  A configuração inicial (boas-vindas, escolha de idioma e moeda) agora fica no <strong>Gate de Entrada</strong>, e os textos do funil têm alternância bilíngue direta em <strong>Apresentação & Copy</strong>.
                </p>
                <div className="flex justify-center gap-3 pt-2">
                  <Button
                    onClick={() => setActiveTab("gate")}
                    className="bg-[#1049B8] hover:bg-[#0B3B99] text-white font-bold text-xs"
                  >
                    Abrir Gate de Entrada
                  </Button>
                  <Button
                    onClick={() => setActiveTab("welcome")}
                    variant="outline"
                    className="border-white/10 text-white text-xs"
                  >
                    Ver Apresentação & Copy
                  </Button>
                </div>
              </div>
            </div>
          )}
          {activeTab === "upsell" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <TrendingUp className="size-5 text-cyan-400" /> Sequências de Upsell
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Aumente o ticket médio oferecendo produtos imediatamente após a aprovação (até 20 sequências)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    disabled={(config.upsell.sequences?.length ?? 0) >= 20}
                    onClick={() => {
                      const current = config.upsell.sequences ?? [];
                      const newSeq: SequenceStep = {
                        id: `seq-up-${Date.now()}`,
                        title: `Upsell #${current.length + 1}`,
                        enabled: true,
                        delayValue: 0,
                        delayUnit: "minutes",
                        targetBots: ["all"],
                        media: [],
                        mediaMode: "separated",
                        message:
                          "🔥 Parabéns pela compra! Liberamos uma oferta VIP exclusiva pós-pagamento com 50% de desconto apenas agora:",
                        discountType: "percent",
                        discountValue: 50,
                        plans: [
                          {
                            id: `up-p-${Date.now()}`,
                            name: "ACESSO BÔNUS + UPSELL VIP",
                            duration: "Vitalício",
                            originalPrice: 39.9,
                            discountPrice: 19.9,
                          },
                        ],
                      };
                      setConfig({
                        ...config,
                        upsell: { ...config.upsell, enabled: true, sequences: [...current, newSeq] },
                      });
                      toast.success(`Sequência de Upsell adicionada (${current.length + 1}/20)`);
                    }}
                    className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-xs"
                  >
                    <Plus className="size-3.5 mr-1" /> Adicionar Upsell ({config.upsell.sequences?.length ?? 0}/20)
                  </Button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Ativar Upsell</span>
                    <Switch
                      checked={config.upsell.enabled}
                      onCheckedChange={(checked) =>
                        setConfig({ ...config, upsell: { ...config.upsell, enabled: checked } })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Entrega do Upsell (Estilo SharkBot) */}
              <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300">Entrega do Upsell (Grupo / Canal / Link)</Label>
                  <Input
                    value={config.upsell.deliveryDestination}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        upsell: { ...config.upsell, deliveryDestination: e.target.value },
                      })
                    }
                    placeholder="https://t.me/+... ou @canal_vip"
                    className="h-9 text-xs bg-black/50 border-white/10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300">Mensagem de Entrega do Upsell</Label>
                  <Input
                    value={config.upsell.deliveryMessage}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        upsell: { ...config.upsell, deliveryMessage: e.target.value },
                      })
                    }
                    placeholder="Aqui está o acesso do seu Upsell..."
                    className="h-9 text-xs bg-black/50 border-white/10"
                  />
                </div>
              </div>

              {config.upsell.sequences.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center text-xs text-zinc-400">
                  Nenhuma sequência de Upsell configurada. Clique em <strong>Adicionar Upsell</strong> acima para criar sua primeira oferta pós-compra.
                </div>
              ) : null}

              {config.upsell.sequences.map((seq) => (
                <div key={seq.id} className="space-y-5 rounded-xl border border-border bg-surface/50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-sm text-foreground">
                        {seq.title}
                      </span>
                      <Switch
                        checked={seq.enabled}
                        onCheckedChange={(checked) => {
                          const updated = config.upsell.sequences.map((s) =>
                            s.id === seq.id ? { ...s, enabled: checked } : s
                          );
                          setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Imediato após compra</Badge>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-zinc-400 hover:text-red-400"
                        onClick={() => {
                          const updated = config.upsell.sequences.filter((s) => s.id !== seq.id);
                          setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                          toast.success("Sequência de Upsell removida");
                        }}
                        aria-label="Excluir Upsell"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Upload de mídias direto do PC com preview */}
                  <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                        Mídia do Upsell (Subir Foto, Vídeo ou Áudio do PC — Opcional)
                      </Label>
                      <span className="text-[10px] text-slate-500">Até 3 arquivos</span>
                    </div>
                    <FlowMediaUploader
                      media={seq.media}
                      mode={seq.mediaMode}
                      onModeChange={(mode) => {
                        const updated = config.upsell.sequences.map((s) =>
                          s.id === seq.id ? { ...s, mediaMode: mode } : s
                        );
                        setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                      }}
                      onChange={(items) => {
                        const updated = config.upsell.sequences.map((s) =>
                          s.id === seq.id ? { ...s, media: items } : s
                        );
                        setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                      }}
                      maxItems={3}
                    />
                  </div>

                  {/* Seleção de Bots para este Upsell */}
                  <div className="space-y-2">
                    <Label className="text-xs">Quais bots enviarão este Upsell?</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={seq.targetBots.includes("all") ? "default" : "outline"}
                        onClick={() => {
                          const updated = config.upsell.sequences.map((s) =>
                            s.id === seq.id ? { ...s, targetBots: ["all"] } : s
                          );
                          setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                        }}
                      >
                        Todos os bots
                      </Button>
                      {userBots.map((b) => {
                        const isSelected = seq.targetBots.includes(b.id);
                        return (
                          <Button
                            key={b.id}
                            type="button"
                            size="sm"
                            variant={isSelected ? "secondary" : "outline"}
                            onClick={() => {
                              let next: string[];
                              if (seq.targetBots.includes("all")) {
                                next = [b.id];
                              } else if (isSelected) {
                                next = seq.targetBots.filter((id) => id !== b.id);
                              } else {
                                next = [...seq.targetBots, b.id];
                              }
                              if (next.length === 0) next = ["all"];
                              const updated = config.upsell.sequences.map((s) =>
                                s.id === seq.id ? { ...s, targetBots: next } : s
                              );
                              setConfig({
                                ...config,
                                upsell: { ...config.upsell, sequences: updated },
                              });
                            }}
                          >
                            {b.name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Mensagem do Upsell *</Label>
                    <Textarea
                      rows={4}
                      value={seq.message}
                      onChange={(e) => {
                        const updated = config.upsell.sequences.map((s) =>
                          s.id === seq.id ? { ...s, message: e.target.value } : s
                        );
                        setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                      }}
                      placeholder="Mensagem da oferta especial..."
                    />
                  </div>

                  {/* Botão "Não quero" Opcional no Upsell */}
                  <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-white">Exibir botão &quot;Não quero&quot; (Opcional)</p>
                        <p className="text-[11px] text-zinc-400">
                          Permite que o cliente recuse o Upsell sem atrapalhar ou interromper o acesso que já comprou.
                        </p>
                      </div>
                      <Switch
                        checked={Boolean(seq.showRefuseButton)}
                        onCheckedChange={(checked) => {
                          const updated = config.upsell.sequences.map((s) =>
                            s.id === seq.id
                              ? {
                                  ...s,
                                  showRefuseButton: checked,
                                  refuseButtonText: s.refuseButtonText || "Não quero, obrigado",
                                }
                              : s
                          );
                          setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                        }}
                      />
                    </div>
                    {seq.showRefuseButton ? (
                      <div className="space-y-1">
                        <Label className="text-[11px] text-zinc-400">Texto do botão de recusa</Label>
                        <Input
                          value={seq.refuseButtonText ?? "Não quero, obrigado"}
                          onChange={(e) => {
                            const updated = config.upsell.sequences.map((s) =>
                              s.id === seq.id ? { ...s, refuseButtonText: e.target.value } : s
                            );
                            setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                          }}
                          placeholder="Não quero, obrigado"
                          className="h-8 text-xs bg-black/50 border-white/10"
                        />
                      </div>
                    ) : null}
                  </div>

                  {/* Ofertas / Planos do Upsell (Importar do Fluxo ou Criar Novos) */}
                  <div className="bg-black/30 p-4 rounded-xl border border-border/60 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <Label className="text-xs font-semibold">Planos & Botões de Upsell (do Fluxo ou Novos)</Label>
                        <p className="text-[11px] text-zinc-400">
                          Selecione um plano existente deste fluxo ou crie ofertas novas para o Upsell.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => {
                          const nextPlan = {
                            id: `up-p-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                            name: "NOVO UPSELL VIP",
                            duration: "Vitalício",
                            originalPrice: 39.9,
                            discountPrice: 19.9,
                          };
                          const updated = config.upsell.sequences.map((s) =>
                            s.id === seq.id ? { ...s, plans: [...(s.plans || []), nextPlan] } : s
                          );
                          setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                        }}
                      >
                        <Plus className="size-3 mr-1" /> Criar Novo Plano
                      </Button>
                    </div>

                    {config.plans.items.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {config.plans.items.map((flowPlan) => (
                          <button
                            key={flowPlan.id}
                            type="button"
                            onClick={() => {
                              const imported = {
                                id: `up-fp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                                name: flowPlan.name,
                                duration: flowPlan.duration || "Acesso",
                                originalPrice: Number(flowPlan.price) || 0,
                                discountPrice: Number(flowPlan.price) || 0,
                              };
                              const updated = config.upsell.sequences.map((s) =>
                                s.id === seq.id ? { ...s, plans: [...(s.plans || []), imported] } : s
                              );
                              setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                            }}
                            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-500/20 transition"
                          >
                            + {flowPlan.name} (R$ {Number(flowPlan.price || 0).toFixed(2).replace(".", ",")})
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2">
                      {(seq.plans ?? []).map((upPlan, upIdx) => (
                        <div key={upPlan.id || upIdx} className="grid gap-2 sm:grid-cols-[1fr_140px_34px] items-end">
                          <div>
                            <Label className="text-[11px] text-zinc-400">Nome da Oferta / Botão #{upIdx + 1}</Label>
                            <Input
                              className="h-8 text-xs"
                              value={upPlan.name}
                              onChange={(e) => {
                                const currentPlans = seq.plans.map((p, i) =>
                                  i === upIdx ? { ...p, name: e.target.value } : p
                                );
                                const updated = config.upsell.sequences.map((s) =>
                                  s.id === seq.id ? { ...s, plans: currentPlans } : s
                                );
                                setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-zinc-400">Preço (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-xs"
                              value={upPlan.discountPrice}
                              onChange={(e) => {
                                const currentPlans = seq.plans.map((p, i) =>
                                  i === upIdx ? { ...p, discountPrice: Number(e.target.value) } : p
                                );
                                const updated = config.upsell.sequences.map((s) =>
                                  s.id === seq.id ? { ...s, plans: currentPlans } : s
                                );
                                setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                              }}
                            />
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={seq.plans.length <= 1}
                            onClick={() => {
                              const currentPlans = seq.plans.filter((_, i) => i !== upIdx);
                              const updated = config.upsell.sequences.map((s) =>
                                s.id === seq.id ? { ...s, plans: currentPlans } : s
                              );
                              setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                            }}
                            className="size-8 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ABA DOWNSELL - SUB-ABAS ESTILO SHARKBOT */}
          {activeTab === "downsell" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <TrendingDown className="size-5 text-amber-400" /> Estratégia de Downsell (Até 20 Sequências)
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Recupere leads perdidos com ofertas alternativas divididas por momento de abandono.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-xl border border-white/10 bg-black/50 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setDownsellSubTab("start")}
                      className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                        downsellSubTab === "start"
                          ? "bg-amber-500/25 text-amber-300 border border-amber-500/40"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      1. Geral (/start · {config.downsell.startSequences?.length ?? 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDownsellSubTab("pix")}
                      className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                        downsellSubTab === "pix"
                          ? "bg-red-500/25 text-red-300 border border-red-500/40"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      2. PIX Gerado (Não Pago · {config.downsell.pixSequences?.length ?? 0})
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Ativar Downsell</span>
                    <Switch
                      checked={config.downsell.enabled}
                      onCheckedChange={(checked) =>
                        setConfig({ ...config, downsell: { ...config.downsell, enabled: checked } })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* ÁREA 1: DOWNSELL DE INÍCIO (/START SEM GERAR PIX) */}
              {downsellSubTab === "start" && (
              <div className="space-y-5 rounded-2xl border border-amber-500/30 bg-amber-950/10 p-5 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 text-xs font-bold">
                        1
                      </span>
                      <h3 className="font-bold text-base text-amber-200">
                        Área 1: Downsell de Início (/start sem gerar PIX)
                      </h3>
                      <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px]">
                        {config.downsell.startSequences?.length ?? 0}/20
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Disparado quando o lead deu /start, visualizou a mensagem e os planos, mas NÃO clicou em gerar PIX.
                    </p>
                  </div>

                  <Button
                    size="sm"
                    disabled={(config.downsell.startSequences?.length ?? 0) >= 20}
                    onClick={() => {
                      const current = config.downsell.startSequences ?? [];
                      if (current.length >= 20) return toast.error("Limite máximo de 20 sequências atingido.");
                      const newSeq: SequenceStep = {
                        id: `down-start-${Date.now()}`,
                        title: `Downsell /start #${current.length + 1}`,
                        enabled: true,
                        triggerType: "start",
                        delayValue: 15 * (current.length + 1),
                        delayUnit: "minutes",
                        targetBots: ["all"],
                        media: [],
                        mediaMode: "separated",
                        message: "Ainda está por aí? Preparei uma condição imperdível para você entrar hoje mesmo!",
                        discountType: "fixed",
                        discountValue: 5,
                        plans: [
                          {
                            id: `p-start-${Date.now()}`,
                            name: "PLANO PROMOCIONAL START",
                            duration: "Vitalício",
                            originalPrice: 12.99,
                            discountPrice: 8.99,
                          },
                        ],
                      };
                      const updated = [...current, newSeq];
                      setConfig({
                        ...config,
                        downsell: {
                          ...config.downsell,
                          startSequences: updated,
                          sequences: [...updated, ...(config.downsell.pixSequences ?? [])],
                        },
                      });
                      toast.success(`Sequência de /start adicionada (${updated.length}/20)`);
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs"
                  >
                    <Plus className="size-3.5 mr-1.5" /> Adicionar Sequência ({config.downsell.startSequences?.length ?? 0}/20)
                  </Button>
                </div>

                {(config.downsell.startSequences ?? []).length === 0 ? (
                  <p className="text-center py-6 text-zinc-500 text-xs">
                    Nenhuma sequência de início configurada. Clique em Adicionar Sequência acima.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {(config.downsell.startSequences ?? []).map((seq, index) => (
                      <div key={seq.id} className="space-y-4 rounded-xl border border-white/10 bg-black/40 p-5">
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-amber-300">#{index + 1} {seq.title}</span>
                            <Switch
                              checked={seq.enabled}
                              onCheckedChange={(checked) => {
                                const updated = (config.downsell.startSequences ?? []).map((s) =>
                                  s.id === seq.id ? { ...s, enabled: checked } : s
                                );
                                setConfig({
                                  ...config,
                                  downsell: { ...config.downsell, startSequences: updated },
                                });
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-zinc-400">Disparar após:</Label>
                              <Input
                                type="number"
                                className="w-16 h-8 text-xs bg-zinc-900 border-white/10"
                                value={seq.delayValue}
                                onChange={(e) => {
                                  const updated = (config.downsell.startSequences ?? []).map((s) =>
                                    s.id === seq.id ? { ...s, delayValue: Number(e.target.value) } : s
                                  );
                                  setConfig({
                                    ...config,
                                    downsell: { ...config.downsell, startSequences: updated },
                                  });
                                }}
                              />
                              <select
                                className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
                                value={seq.delayUnit}
                                onChange={(e) => {
                                  const updated = (config.downsell.startSequences ?? []).map((s) =>
                                    s.id === seq.id ? { ...s, delayUnit: e.target.value as any } : s
                                  );
                                  setConfig({
                                    ...config,
                                    downsell: { ...config.downsell, startSequences: updated },
                                  });
                                }}
                              >
                                <option value="minutes">minutos</option>
                                <option value="hours">horas</option>
                                <option value="days">dias</option>
                              </select>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-zinc-500 hover:text-red-400"
                              onClick={() => {
                                const updated = (config.downsell.startSequences ?? []).filter((s) => s.id !== seq.id);
                                setConfig({
                                  ...config,
                                  downsell: { ...config.downsell, startSequences: updated },
                                });
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>

                        <FlowMediaUploader
                          media={seq.media}
                          mode={seq.mediaMode}
                          onChange={(items) => {
                            const updated = (config.downsell.startSequences ?? []).map((s) =>
                              s.id === seq.id ? { ...s, media: items } : s
                            );
                            setConfig({
                              ...config,
                              downsell: { ...config.downsell, startSequences: updated },
                            });
                          }}
                          maxItems={3}
                        />

                        <div className="space-y-2">
                          <Label className="text-xs text-zinc-300">Mensagem da Oferta</Label>
                          <Textarea
                            rows={3}
                            value={seq.message}
                            onChange={(e) => {
                              const updated = (config.downsell.startSequences ?? []).map((s) =>
                                s.id === seq.id ? { ...s, message: e.target.value } : s
                              );
                              setConfig({
                                ...config,
                                downsell: { ...config.downsell, startSequences: updated },
                              });
                            }}
                            className="bg-zinc-900 border-white/10 text-white placeholder:text-zinc-600"
                            placeholder="Copy persuasiva de downsell..."
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 bg-zinc-900/60 p-3 rounded-xl border border-white/5">
                          <div>
                            <Label className="text-[11px] text-zinc-400">Nome do Plano com Desconto</Label>
                            <Input
                              className="h-8 text-xs bg-black/50 border-white/10 text-white"
                              value={seq.plans[0]?.name || ""}
                              onChange={(e) => {
                                const plans = [...seq.plans];
                                if (plans[0]) plans[0].name = e.target.value;
                                const updated = (config.downsell.startSequences ?? []).map((s) =>
                                  s.id === seq.id ? { ...s, plans } : s
                                );
                                setConfig({
                                  ...config,
                                  downsell: { ...config.downsell, startSequences: updated },
                                });
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-zinc-400">Preço com Desconto (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-xs bg-black/50 border-white/10 text-white font-bold text-amber-400"
                              value={seq.plans[0]?.discountPrice || 0}
                              onChange={(e) => {
                                const plans = [...seq.plans];
                                if (plans[0]) plans[0].discountPrice = Number(e.target.value);
                                const updated = (config.downsell.startSequences ?? []).map((s) =>
                                  s.id === seq.id ? { ...s, plans } : s
                                );
                                setConfig({
                                  ...config,
                                  downsell: { ...config.downsell, startSequences: updated },
                                });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}

              {/* ÁREA 2: DOWNSELL DE PIX PENDENTE (PIX GERADO SEM PAGAMENTO) */}
              {downsellSubTab === "pix" && (
              <div className="space-y-5 rounded-2xl border border-red-500/30 bg-red-950/10 p-5 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-red-500/20 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-lg bg-red-500/20 text-red-400 text-xs font-bold">
                        2
                      </span>
                      <h3 className="font-bold text-base text-red-200">
                        Área 2: Downsell de PIX Pendente (PIX Gerado sem Pagamento)
                      </h3>
                      <Badge variant="outline" className="border-red-500/40 text-red-400 text-[10px]">
                        {config.downsell.pixSequences?.length ?? 0}/20
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Disparado quando o lead escolheu o plano e gerou a chave PIX, mas NÃO efetuou o pagamento.
                    </p>
                  </div>

                  <Button
                    size="sm"
                    disabled={(config.downsell.pixSequences?.length ?? 0) >= 20}
                    onClick={() => {
                      const current = config.downsell.pixSequences ?? [];
                      if (current.length >= 20) return toast.error("Limite máximo de 20 sequências atingido.");
                      const newSeq: SequenceStep = {
                        id: `down-pix-${Date.now()}`,
                        title: `Downsell PIX Pendente #${current.length + 1}`,
                        enabled: true,
                        triggerType: "pix_pending",
                        delayValue: 30 * (current.length + 1),
                        delayUnit: "minutes",
                        targetBots: ["all"],
                        media: [],
                        mediaMode: "separated",
                        message: "Notamos que seu PIX está quase expirando! Para liberar seu acesso agora, reduzi para este valor especial:",
                        discountType: "fixed",
                        discountValue: 5,
                        plans: [
                          {
                            id: `p-pix-${Date.now()}`,
                            name: "PIX COM SUPER DESCONTO",
                            duration: "Vitalício",
                            originalPrice: 12.99,
                            discountPrice: 7.99,
                          },
                        ],
                      };
                      const updated = [...current, newSeq];
                      setConfig({
                        ...config,
                        downsell: {
                          ...config.downsell,
                          pixSequences: updated,
                          sequences: [...(config.downsell.startSequences ?? []), ...updated],
                        },
                      });
                      toast.success(`Sequência de PIX Pendente adicionada (${updated.length}/20)`);
                    }}
                    className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold text-xs shadow-md shadow-cyan-950/40"
                  >
                    <Plus className="size-3.5 mr-1.5" /> Adicionar Sequência ({config.downsell.pixSequences?.length ?? 0}/20)
                  </Button>
                </div>

                {(config.downsell.pixSequences ?? []).length === 0 ? (
                  <p className="text-center py-6 text-zinc-500 text-xs">
                    Nenhuma sequência de PIX Pendente configurada. Clique em Adicionar Sequência acima.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {(config.downsell.pixSequences ?? []).map((seq, index) => (
                      <div key={seq.id} className="space-y-4 rounded-xl border border-white/10 bg-black/40 p-5">
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-red-300">#{index + 1} {seq.title}</span>
                            <Switch
                              checked={seq.enabled}
                              onCheckedChange={(checked) => {
                                const updated = (config.downsell.pixSequences ?? []).map((s) =>
                                  s.id === seq.id ? { ...s, enabled: checked } : s
                                );
                                setConfig({
                                  ...config,
                                  downsell: { ...config.downsell, pixSequences: updated },
                                });
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-zinc-400">Disparar após:</Label>
                              <Input
                                type="number"
                                className="w-16 h-8 text-xs bg-zinc-900 border-white/10"
                                value={seq.delayValue}
                                onChange={(e) => {
                                  const updated = (config.downsell.pixSequences ?? []).map((s) =>
                                    s.id === seq.id ? { ...s, delayValue: Number(e.target.value) } : s
                                  );
                                  setConfig({
                                    ...config,
                                    downsell: { ...config.downsell, pixSequences: updated },
                                  });
                                }}
                              />
                              <select
                                className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
                                value={seq.delayUnit}
                                onChange={(e) => {
                                  const updated = (config.downsell.pixSequences ?? []).map((s) =>
                                    s.id === seq.id ? { ...s, delayUnit: e.target.value as any } : s
                                  );
                                  setConfig({
                                    ...config,
                                    downsell: { ...config.downsell, pixSequences: updated },
                                  });
                                }}
                              >
                                <option value="minutes">minutos</option>
                                <option value="hours">horas</option>
                                <option value="days">dias</option>
                              </select>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-zinc-500 hover:text-red-400"
                              onClick={() => {
                                const updated = (config.downsell.pixSequences ?? []).filter((s) => s.id !== seq.id);
                                setConfig({
                                  ...config,
                                  downsell: { ...config.downsell, pixSequences: updated },
                                });
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>

                        <FlowMediaUploader
                          media={seq.media}
                          mode={seq.mediaMode}
                          onChange={(items) => {
                            const updated = (config.downsell.pixSequences ?? []).map((s) =>
                              s.id === seq.id ? { ...s, media: items } : s
                            );
                            setConfig({
                              ...config,
                              downsell: { ...config.downsell, pixSequences: updated },
                            });
                          }}
                          maxItems={3}
                        />

                        <div className="space-y-2">
                          <Label className="text-xs text-zinc-300">Mensagem de Recuperação do PIX</Label>
                          <Textarea
                            rows={3}
                            value={seq.message}
                            onChange={(e) => {
                              const updated = (config.downsell.pixSequences ?? []).map((s) =>
                                s.id === seq.id ? { ...s, message: e.target.value } : s
                              );
                              setConfig({
                                ...config,
                                downsell: { ...config.downsell, pixSequences: updated },
                              });
                            }}
                            className="bg-zinc-900 border-white/10 text-white placeholder:text-zinc-600"
                            placeholder="Seu PIX está vencendo..."
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 bg-zinc-900/60 p-3 rounded-xl border border-white/5">
                          <div>
                            <Label className="text-[11px] text-zinc-400">Nome do Plano Promocional</Label>
                            <Input
                              className="h-8 text-xs bg-black/50 border-white/10 text-white"
                              value={seq.plans[0]?.name || ""}
                              onChange={(e) => {
                                const plans = [...seq.plans];
                                if (plans[0]) plans[0].name = e.target.value;
                                const updated = (config.downsell.pixSequences ?? []).map((s) =>
                                  s.id === seq.id ? { ...s, plans } : s
                                );
                                setConfig({
                                  ...config,
                                  downsell: { ...config.downsell, pixSequences: updated },
                                });
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-zinc-400">Preço com Desconto Especial (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-xs bg-black/50 border-white/10 text-white font-bold text-red-400"
                              value={seq.plans[0]?.discountPrice || 0}
                              onChange={(e) => {
                                const plans = [...seq.plans];
                                if (plans[0]) plans[0].discountPrice = Number(e.target.value);
                                const updated = (config.downsell.pixSequences ?? []).map((s) =>
                                  s.id === seq.id ? { ...s, plans } : s
                                );
                                setConfig({
                                  ...config,
                                  downsell: { ...config.downsell, pixSequences: updated },
                                });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
          )}

          {/* ABA ORDER BUMP */}
          {activeTab === "orderBump" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <ShoppingBag className="size-5 text-primary" /> Order Bump
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Oferta complementar exibida antes da geração do PIX para elevar o ticket médio
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {config.orderBump.initialFlowEnabled ? "Ativado no fluxo inicial" : "Desativado"}
                  </span>
                  <Switch
                    checked={config.orderBump.initialFlowEnabled}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        orderBump: { ...config.orderBump, initialFlowEnabled: checked },
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-12">
                <div className="space-y-5 lg:col-span-7">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Nome do Produto</Label>
                      <Input
                        placeholder="Ex: Acesso VIPVitalício + Bônus"
                        value={config.orderBump.productName}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            orderBump: { ...config.orderBump, productName: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Preço Adicional (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={config.orderBump.price}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            orderBump: { ...config.orderBump, price: Number(e.target.value) },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Mensagem CTA (Chamada da Oferta)</Label>
                    <Textarea
                      rows={3}
                      placeholder="Ex: 🔥 Leve também o Pack Completo com 70% de desconto antes de concluir seu PIX!"
                      value={config.orderBump.ctaMessage}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          orderBump: { ...config.orderBump, ctaMessage: e.target.value },
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Descrição / Detalhes do Order Bump</Label>
                    <Textarea
                      rows={3}
                      placeholder="Descreva os benefícios do adicional..."
                      value={config.orderBump.description}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          orderBump: { ...config.orderBump, description: e.target.value },
                        })
                      }
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Botão Aceitar</Label>
                      <Input
                        placeholder="✅ Sim, quero aproveitar!"
                        value={config.orderBump.acceptButtonText}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            orderBump: { ...config.orderBump, acceptButtonText: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Botão Recusar</Label>
                      <Input
                        placeholder="Não, continuar só com o plano"
                        value={config.orderBump.refuseButtonText}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            orderBump: { ...config.orderBump, refuseButtonText: e.target.value },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Entrega do Order Bump (Link, Grupo ou Texto)</Label>
                    <Input
                      placeholder="https://t.me/+link-exclusivo ou texto entregue após confirmação"
                      value={config.orderBump.deliveryDestination}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          orderBump: { ...config.orderBump, deliveryDestination: e.target.value },
                        })
                      }
                    />
                  </div>

                  <div className="rounded-xl border border-border/70 bg-background/40 p-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Aplicar também em
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface/50 px-3 py-2 text-xs font-medium cursor-pointer">
                        <span>Upsell</span>
                        <Switch
                          checked={config.orderBump.applyToUpsell}
                          onCheckedChange={(checked) =>
                            setConfig({
                              ...config,
                              orderBump: { ...config.orderBump, applyToUpsell: checked },
                            })
                          }
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface/50 px-3 py-2 text-xs font-medium cursor-pointer">
                        <span>Downsell</span>
                        <Switch
                          checked={config.orderBump.applyToDownsell}
                          onCheckedChange={(checked) =>
                            setConfig({
                              ...config,
                              orderBump: { ...config.orderBump, applyToDownsell: checked },
                            })
                          }
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface/50 px-3 py-2 text-xs font-medium cursor-pointer">
                        <span>Packs</span>
                        <Switch
                          checked={config.orderBump.applyToPacks}
                          onCheckedChange={(checked) =>
                            setConfig({
                              ...config,
                              orderBump: { ...config.orderBump, applyToPacks: checked },
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <FlowMediaUploader
                    media={config.orderBump.media}
                    onChange={(items) =>
                      setConfig({
                        ...config,
                        orderBump: { ...config.orderBump, media: items },
                      })
                    }
                    maxItems={2}
                  />
                </div>

                {/* Live Telegram Order Bump Preview */}
                <div className="lg:col-span-5">
                  <div className="sticky top-6 rounded-2xl border border-border/70 bg-[#0e1621] p-4 text-white shadow-xl">
                    <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2 text-xs text-slate-400">
                      <span className="font-semibold text-slate-200">Prévia no Telegram</span>
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        + {formatFlowBRL(Math.round((config.orderBump.price || 0) * 100))}
                      </span>
                    </div>
                    <div className="space-y-2 rounded-xl bg-[#182533] p-3.5 text-sm shadow">
                      {config.orderBump.media.length > 0 && (
                        <div className="rounded-lg bg-black/30 px-3 py-2 text-xs text-sky-300">
                          📎 {config.orderBump.media.length} mídia(s) anexada(s)
                        </div>
                      )}
                      <p className="font-semibold text-amber-300">
                        {config.orderBump.productName.trim() || "Oferta Especial (Order Bump)"}
                      </p>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-200">
                        {config.orderBump.ctaMessage.trim() ||
                          config.orderBump.description.trim() ||
                          "Aproveite esta condição única adicionando ao seu pedido antes do pagamento."}
                      </p>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      <div className="rounded-lg bg-[#2b5278]/80 px-3 py-2 text-center text-xs font-semibold text-white">
                        {config.orderBump.acceptButtonText.trim() || "✅ Sim, adicionar ao pedido"}
                      </div>
                      <div className="rounded-lg bg-white/10 px-3 py-2 text-center text-xs font-medium text-slate-300">
                        {config.orderBump.refuseButtonText.trim() || "Não, obrigado"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA PACKS AVULSOS */}
          {activeTab === "packs" && (() => {
            const cfgAny = config as unknown as Record<string, unknown>;
            const packsState = (cfgAny["packs"] as
              | {
                  enabled?: boolean;
                  items?: Array<{ id: string; name: string; price: number; content: string; media?: FlowMediaItem[] }>;
                }
              | undefined) ?? { enabled: false, items: [] };
            const packItems = packsState.items ?? [];
            const updatePacks = (next: {
              enabled?: boolean;
              items?: Array<{ id: string; name: string; price: number; content: string; media?: FlowMediaItem[] }>;
            }) => {
              setConfig({
                ...config,
                packs: {
                  enabled: next.enabled ?? packsState.enabled ?? false,
                  items: next.items ?? packItems,
                },
              } as unknown as AdvancedFlowConfig);
            };

            return (
              <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      8. Packs Avulsos
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Catálogo de conteúdos e pacotes individuais vendidos direto no bot
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={Boolean(packsState.enabled)}
                      onCheckedChange={(checked) => updatePacks({ enabled: checked })}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        updatePacks({
                          enabled: true,
                          items: [
                            ...packItems,
                            {
                              id:
                                typeof crypto !== "undefined" && "randomUUID" in crypto
                                  ? crypto.randomUUID()
                                  : `pack-${Date.now()}`,
                              name: `Pack Exclusivo #${packItems.length + 1}`,
                              price: 29.9,
                              content: "",
                            },
                          ],
                        })
                      }
                    >
                      + Adicionar Pack
                    </Button>
                  </div>
                </div>

                {packItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 bg-background/30 p-8 text-center">
                    <p className="text-sm font-medium text-foreground">
                      Nenhum pack avulso configurado ainda
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Clique em &quot;+ Adicionar Pack&quot; para criar pacotes com entrega automática via link ou mensagem.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {packItems.map((pack, idx) => (
                      <div
                        key={pack.id}
                        className="rounded-xl border border-border/70 bg-background/40 p-4 space-y-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-primary">
                            Pack #{idx + 1}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() =>
                              updatePacks({
                                items: packItems.filter((item) => item.id !== pack.id),
                              })
                            }
                          >
                            Remover
                          </Button>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Nome do Pack</Label>
                            <Input
                              value={pack.name}
                              onChange={(e) =>
                                updatePacks({
                                  items: packItems.map((item) =>
                                    item.id === pack.id ? { ...item, name: e.target.value } : item
                                  ),
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Valor (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={pack.price}
                              onChange={(e) =>
                                updatePacks({
                                  items: packItems.map((item) =>
                                    item.id === pack.id
                                      ? { ...item, price: Number(e.target.value) }
                                      : item
                                  ),
                                })
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label>Conteúdo / Link de Entrega</Label>
                          <Textarea
                            rows={2}
                            placeholder="https://... ou texto entregue após confirmação do pagamento"
                            value={pack.content}
                            onChange={(e) =>
                              updatePacks({
                                items: packItems.map((item) =>
                                  item.id === pack.id ? { ...item, content: e.target.value } : item
                                ),
                              })
                            }
                          />
                        </div>

                        <FlowMediaUploader
                          media={pack.media ?? []}
                          onChange={(items) =>
                            updatePacks({
                              items: packItems.map((item) =>
                                item.id === pack.id ? { ...item, media: items } : item
                              ),
                            })
                          }
                          maxItems={3}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ABA PRÉVIAS QUE SOMEM */}
          {activeTab === "previews" && (() => {
            const cfgAny = config as unknown as Record<string, unknown>;
            const previewsState = (cfgAny["previews"] as
              | {
                  enabled?: boolean;
                  buttonText?: string;
                  deleteSeconds?: number;
                  conversionCopy?: string;
                  media?: FlowMediaItem[];
                }
              | undefined) ?? {
              enabled: false,
              buttonText: "👀 Ver Prévia Grátis",
              deleteSeconds: 15,
              conversionCopy: "",
              media: [],
            };
            const updatePreviews = (next: Partial<typeof previewsState>) => {
              setConfig({
                ...config,
                previews: {
                  ...previewsState,
                  ...next,
                },
              } as unknown as AdvancedFlowConfig);
            };
            const currentDeleteSec = previewsState.deleteSeconds ?? 15;

            return (
              <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      9. Prévias que Somem
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Envie amostras com autodestruição programada para gerar escassez e conversão imediata
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(previewsState.enabled)}
                    onCheckedChange={(checked) => updatePreviews({ enabled: checked })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Texto do Botão de Prévia</Label>
                    <Input
                      placeholder="👀 Ver Prévia Grátis"
                      value={previewsState.buttonText ?? ""}
                      onChange={(e) => updatePreviews({ buttonText: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tempo até Auto-Exclusão</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      {[10, 15, 30, 60].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => updatePreviews({ deleteSeconds: sec })}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                            currentDeleteSec === sec
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border/70 bg-background/50 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <FlowMediaUploader
                  media={previewsState.media ?? []}
                  onChange={(items) => updatePreviews({ media: items })}
                  maxItems={5}
                />

                <div className="space-y-1.5">
                  <Label>Copy de Conversão (enviada após a prévia sumir)</Label>
                  <Textarea
                    rows={3}
                    placeholder="⏳ A prévia expirou! Garanta seu acesso completo agora mesmo escolhendo um dos planos abaixo."
                    value={previewsState.conversionCopy ?? ""}
                    onChange={(e) => updatePreviews({ conversionCopy: e.target.value })}
                  />
                </div>
              </div>
            );
          })()}

          {/* ABA ASSINATURA & RENOVAÇÃO */}
          {activeTab === "subscription" && (() => {
            const cfgAny = config as unknown as Record<string, unknown>;
            const subState = (cfgAny["subscription"] as
              | {
                  enabled?: boolean;
                  notifyDays?: number[];
                  discountPercent?: number;
                  expiredMessage?: string;
                }
              | undefined) ?? {
              enabled: false,
              notifyDays: [7, 3, 1],
              discountPercent: 20,
              expiredMessage: "",
            };
            const notifyDays = subState.notifyDays ?? [7, 3, 1];
            const updateSub = (next: Partial<typeof subState>) => {
              setConfig({
                ...config,
                subscription: {
                  ...subState,
                  ...next,
                },
              } as unknown as AdvancedFlowConfig);
            };
            const toggleDay = (day: number) => {
              const exists = notifyDays.includes(day);
              const nextDays = exists
                ? notifyDays.filter((d) => d !== day)
                : [...notifyDays, day].sort((a, b) => b - a);
              updateSub({ notifyDays: nextDays });
            };

            return (
              <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      11. Assinatura & Renovação
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Configure lembretes automáticos antes do vencimento e incentivo para retenção VIP
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(subState.enabled)}
                    onCheckedChange={(checked) => updateSub({ enabled: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notificar quantos dias antes de expirar</Label>
                  <div className="flex flex-wrap gap-2">
                    {[14, 7, 5, 3, 2, 1, 0].map((day) => {
                      const active = notifyDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                            active
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border/70 bg-background/50 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {day === 0 ? "No dia (0d)" : `${day} dias`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Desconto na Renovação (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="95"
                      value={subState.discountPercent ?? 0}
                      onChange={(e) => updateSub({ discountPercent: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Mensagem de Expiração / Lembrete de Renovação</Label>
                  <Textarea
                    rows={4}
                    placeholder="⚠️ Sua assinatura VIP está prestes a vencer! Renove agora com desconto exclusivo para não perder o acesso."
                    value={subState.expiredMessage ?? ""}
                    onChange={(e) => updateSub({ expiredMessage: e.target.value })}
                  />
                </div>
              </div>
            );
          })()}

          {/* ABA CONVERSÕES DO FLUXO */}
          {activeTab === "conversions" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="border-b border-border/60 pb-4">
                <h2 className="text-lg font-bold text-foreground">
                  12. Conversões do Fluxo
                </h2>
                <p className="text-xs text-muted-foreground">
                  Métricas em tempo real do funil deste fluxo e atalhos de otimização
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-border/70 bg-background/40 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Starts (/start)
                  </p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {flowStats?.leadsCount ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/40 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    PIX Gerados
                  </p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {flowStats?.pixGenerated ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/40 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    PIX Pagos
                  </p>
                  <p className="mt-1 text-2xl font-bold text-emerald-400">
                    {flowStats?.pixPaid ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/40 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Conversão
                  </p>
                  <p className="mt-1 text-2xl font-bold text-primary">
                    {(flowStats?.conversionPct ?? 0).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/40 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Receita Aprovada
                  </p>
                  <p className="mt-1 text-2xl font-bold text-emerald-400">
                    {formatFlowBRL(flowStats?.revenueCents ?? 0)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/40 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Destaques do Funil</h3>
                    <p className="text-xs text-muted-foreground">
                      Status atual das principais alavancas de conversão configuradas neste fluxo
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 text-xs">
                  <div className="rounded-lg border border-border/60 bg-surface/50 p-3">
                    <p className="text-muted-foreground">Oferta Principal</p>
                    <p className="mt-1 font-semibold text-foreground">
                      {config.plans.length} plano(s) • Upsell{" "}
                      {config.upsell.enabled ? "Ativo" : "Off"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-surface/50 p-3">
                    <p className="text-muted-foreground">Recuperação & Bump</p>
                    <p className="mt-1 font-semibold text-foreground">
                      Downsell {config.downsell.enabled ? "Ativo" : "Off"} • Bump{" "}
                      {config.orderBump.initialFlowEnabled ? "Ativo" : "Off"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-surface/50 p-3">
                    <p className="text-muted-foreground">Remarketing Automático</p>
                    <p className="mt-1 font-semibold text-foreground">
                      {config.remarketing.enabled
                        ? `${config.remarketing.sequences.length} sequência(s)`
                        : "Desativado"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {(
                    [
                      { id: "welcome", label: "Editar Boas-Vindas" },
                      { id: "plans", label: "Editar Planos" },
                      { id: "upsell", label: "Ajustar Upsell" },
                      { id: "downsell", label: "Ajustar Downsell" },
                      { id: "orderBump", label: "Ajustar Order Bump" },
                      { id: "remarketing", label: "Ajustar Remarketing" },
                    ] as const
                  ).map((shortcut) => (
                    <Button
                      key={shortcut.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTab(shortcut.id)}
                    >
                      {shortcut.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ABA REMARKETING */}
          {activeTab === "remarketing" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              {/* Banner Informativo: Remarketing Centralizado & Independente */}
              <div className="rounded-2xl border border-[#1049B8]/40 bg-gradient-to-r from-[#050508] via-[#0B3B99]/20 to-[#1049B8]/30 p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-[#38BDF8] animate-pulse" />
                    <h3 className="font-bold text-white text-base">
                      Remarketing Centralizado & Independente
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-300 max-w-xl">
                    O Remarketing agora é gerenciado fora do fluxo individual. Acesse a Central de Remarketing para criar campanhas globais e selecionar múltiplos fluxos participantes ao mesmo tempo.
                  </p>
                </div>
                <Button
                  asChild
                  className="bg-gradient-to-r from-[#1049B8] to-[#38BDF8] hover:from-[#0B3B99] hover:to-[#0284C7] text-white font-bold rounded-xl shadow-lg shadow-[#1049B8]/30 text-xs shrink-0"
                >
                  <Link to="/app/remarketing">
                    <Layers className="size-3.5 mr-1.5" /> Abrir Central de Remarketing
                  </Link>
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Clock className="size-5 text-[#38BDF8]" /> Configuração Local deste Fluxo
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Defina sequências diretas opcionais para este fluxo específico.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Ativar Campanha Local</span>
                  <Switch
                    checked={config.remarketing.enabled}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        remarketing: { ...config.remarketing, enabled: checked },
                      })
                    }
                  />
                </div>
              </div>

              {/* Painel de Configurações Gerais do Remarketing */}
              <div className="grid gap-4 sm:grid-cols-2 bg-black/40 p-5 rounded-2xl border border-white/10">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-300 font-semibold">
                    Frequência do Disparo Automático
                  </Label>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                    value={config.remarketing.intervalHours ?? 3}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        remarketing: { ...config.remarketing, intervalHours: Number(e.target.value) },
                      })
                    }
                  >
                    <option value={3}>De 3 em 3 horas (Recomendado)</option>
                    <option value={6}>De 6 em 6 horas</option>
                    <option value={9}>De 9 em 9 horas</option>
                    <option value={12}>De 12 em 12 horas</option>
                    <option value={15}>De 15 em 15 horas</option>
                    <option value={18}>De 18 em 18 horas</option>
                    <option value={21}>De 21 em 21 horas</option>
                    <option value={24}>De 24 em 24 horas (Diário)</option>
                  </select>
                  <p className="text-[11px] text-zinc-500">
                    O sistema disparará automaticamente no intervalo selecionado (3h em 3h até 24h em 24h) para os leads elegíveis.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-zinc-300 font-semibold">
                    Bot do Fluxo Destinado à Campanha
                  </Label>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                    value={config.remarketing.targetBotId || "all"}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        remarketing: { ...config.remarketing, targetBotId: e.target.value },
                      })
                    }
                  >
                    <option value="all">Bot Principal do Fluxo</option>
                    {userBots.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} (@{b.telegram_username?.replace("@", "") || "bot"})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-zinc-500">
                    O bot que executará o disparo do remarketing para os leads.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <h3 className="font-bold text-white text-base">Mensagens & Ofertas de Remarketing</h3>
                  <p className="text-xs text-zinc-400">
                    Personalize as copys, mídias enviadas do computador e planos com desconto.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    const current = config.remarketing.sequences ?? [];
                    const newSeq: SequenceStep = {
                      id: `seq-rem-${Date.now()}`,
                      title: `Disparo de Remarketing #${current.length + 1}`,
                      enabled: true,
                      delayValue: 3,
                      delayUnit: "hours",
                      targetBots: ["all"],
                      media: [],
                      mediaMode: "separated",
                      message: "Última chamada! Notamos que você ainda não finalizou seu acesso VIP. Preparei um cupom especial para você:",
                      discountType: "fixed",
                      discountValue: 5,
                      plans: [
                        {
                          id: `rem-p-${Date.now()}`,
                          name: "ACESSO VIP REMARKETING",
                          duration: "Vitalício",
                          originalPrice: 12.99,
                          discountPrice: 8.99,
                        },
                      ],
                    };
                    setConfig({
                      ...config,
                      remarketing: {
                        ...config.remarketing,
                        sequences: [...current, newSeq],
                      },
                    });
                    toast.success("Nova etapa de remarketing criada!");
                  }}
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold text-xs shadow-md shadow-cyan-950/40"
                >
                  <Plus className="size-4 mr-1.5" /> Adicionar Mensagem de Remarketing
                </Button>
              </div>

              {(config.remarketing.sequences ?? []).map((seq, idx) => (
                <div key={seq.id} className="space-y-4 rounded-2xl border border-white/10 bg-black/40 p-5 shadow-lg">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-cyan-400">#{idx + 1} {seq.title}</span>
                      <Switch
                        checked={seq.enabled}
                        onCheckedChange={(checked) => {
                          const updated = config.remarketing.sequences.map((s) =>
                            s.id === seq.id ? { ...s, enabled: checked } : s
                          );
                          setConfig({
                            ...config,
                            remarketing: { ...config.remarketing, sequences: updated },
                          });
                        }}
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-zinc-500 hover:text-red-400"
                      onClick={() => {
                        const updated = config.remarketing.sequences.filter((s) => s.id !== seq.id);
                        setConfig({
                          ...config,
                          remarketing: { ...config.remarketing, sequences: updated },
                        });
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  {/* Upload Direto de Mídias */}
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-300">Mídias do Disparo (Fotos/Vídeos do Computador)</Label>
                    <FlowMediaUploader
                      media={seq.media}
                      mode={seq.mediaMode}
                      onChange={(items) => {
                        const updated = config.remarketing.sequences.map((s) =>
                          s.id === seq.id ? { ...s, media: items } : s
                        );
                        setConfig({
                          ...config,
                          remarketing: { ...config.remarketing, sequences: updated },
                        });
                      }}
                      maxItems={3}
                    />
                  </div>

                  {/* Copy Persuasiva */}
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-300 font-semibold">Copy / Mensagem Persuasiva *</Label>
                    <Textarea
                      rows={4}
                      value={seq.message}
                      onChange={(e) => {
                        const updated = config.remarketing.sequences.map((s) =>
                          s.id === seq.id ? { ...s, message: e.target.value } : s
                        );
                        setConfig({
                          ...config,
                          remarketing: { ...config.remarketing, sequences: updated },
                        });
                      }}
                      className="bg-zinc-900 border-white/10 text-white placeholder:text-zinc-600"
                      placeholder="Olá! Seu acesso está reservado com preço especial exclusivo..."
                    />
                  </div>

                  {/* Ofertas / Planos de Remarketing (do Fluxo ou Novos) */}
                  <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-white/5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <Label className="text-xs text-zinc-200 font-semibold">
                          Planos da Mensagem (do Fluxo ou Novos)
                        </Label>
                        <p className="text-[11px] text-zinc-400">
                          Importe qualquer plano deste fluxo ou crie planos novos com desconto.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] border-white/15"
                        onClick={() => {
                          const newPlan = {
                            id: `rem-p-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                            name: "PLANO RETOMADA VIP",
                            duration: "Vitalício",
                            originalPrice: 29.9,
                            discountPrice: 14.9,
                          };
                          const updated = config.remarketing.sequences.map((s) =>
                            s.id === seq.id ? { ...s, plans: [...(s.plans || []), newPlan] } : s
                          );
                          setConfig({
                            ...config,
                            remarketing: { ...config.remarketing, sequences: updated },
                          });
                        }}
                      >
                        <Plus className="size-3 mr-1" /> Criar Novo Plano
                      </Button>
                    </div>

                    {config.plans.items.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {config.plans.items.map((fp) => (
                          <button
                            key={fp.id}
                            type="button"
                            onClick={() => {
                              const imported = {
                                id: `rem-fp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                                name: fp.name,
                                duration: fp.duration || "Vitalício",
                                originalPrice: Number(fp.price) || 0,
                                discountPrice: Number(fp.price) || 0,
                              };
                              const updated = config.remarketing.sequences.map((s) =>
                                s.id === seq.id ? { ...s, plans: [...(s.plans || []), imported] } : s
                              );
                              setConfig({
                                ...config,
                                remarketing: { ...config.remarketing, sequences: updated },
                              });
                            }}
                            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-500/20 transition"
                          >
                            + {fp.name} (R$ {Number(fp.price || 0).toFixed(2).replace(".", ",")})
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2">
                      {(seq.plans ?? []).map((rmPlan, rmIdx) => (
                        <div key={rmPlan.id || rmIdx} className="grid gap-2 sm:grid-cols-[1fr_130px_34px] items-end">
                          <div>
                            <Label className="text-[11px] text-zinc-400">Nome do Plano #{rmIdx + 1}</Label>
                            <Input
                              className="h-8 text-xs bg-black/50 border-white/10 text-white"
                              value={rmPlan.name}
                              onChange={(e) => {
                                const plans = (seq.plans ?? []).map((p, i) =>
                                  i === rmIdx ? { ...p, name: e.target.value } : p
                                );
                                const updated = config.remarketing.sequences.map((s) =>
                                  s.id === seq.id ? { ...s, plans } : s
                                );
                                setConfig({
                                  ...config,
                                  remarketing: { ...config.remarketing, sequences: updated },
                                });
                              }}
                              placeholder="EX: PLANO RETOMADA VIP"
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-zinc-400">Preço (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-xs bg-black/50 border-white/10 text-white font-bold text-emerald-400"
                              value={rmPlan.discountPrice}
                              onChange={(e) => {
                                const plans = (seq.plans ?? []).map((p, i) =>
                                  i === rmIdx ? { ...p, discountPrice: Number(e.target.value) } : p
                                );
                                const updated = config.remarketing.sequences.map((s) =>
                                  s.id === seq.id ? { ...s, plans } : s
                                );
                                setConfig({
                                  ...config,
                                  remarketing: { ...config.remarketing, sequences: updated },
                                });
                              }}
                              placeholder="14.90"
                            />
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={(seq.plans ?? []).length <= 1}
                            onClick={() => {
                              const plans = (seq.plans ?? []).filter((_, i) => i !== rmIdx);
                              const updated = config.remarketing.sequences.map((s) =>
                                s.id === seq.id ? { ...s, plans } : s
                              );
                              setConfig({
                                ...config,
                                remarketing: { ...config.remarketing, sequences: updated },
                              });
                            }}
                            className="size-8 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ABA PAGAMENTOS (ESTILO SHARKBOT COM SUB-ABAS + PREVIEW AO VIVO) */}
          {activeTab === "payments" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <CreditCard className="size-5 text-primary" /> Configuração do PIX & Preview ao Vivo
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Personalize a cobrança PIX, confirmação de plano e mensagem pós-aprovação no Telegram
                  </p>
                </div>

                <div className="inline-flex rounded-xl border border-white/10 bg-black/50 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setPaymentsSubTab("generated")}
                    className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                      paymentsSubTab === "generated"
                        ? "bg-[#1049B8] text-white"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    Pagamento Gerado
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentsSubTab("approved")}
                    className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                      paymentsSubTab === "approved"
                        ? "bg-emerald-600 text-white"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    Pagamento Aprovado
                  </button>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                {paymentsSubTab === "generated" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Layout do Bloco de Pagamento</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { id: "standard", label: "Padrão (Completo)" },
                            { id: "compact", label: "Compacto" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setConfig({
                                ...config,
                                payments: { ...config.payments, layout: opt.id },
                              })
                            }
                            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                              config.payments.layout === opt.id
                                ? "border-cyan-400 bg-cyan-500/15 text-cyan-300"
                                : "border-white/10 bg-black/40 text-zinc-400 hover:text-white"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Instruções do PIX</Label>
                      <Textarea
                        rows={5}
                        value={config.payments.pixInstructions}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            payments: { ...config.payments, pixInstructions: e.target.value },
                          })
                        }
                        className="bg-black/50 border-white/10 text-xs"
                      />
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-black/40">
                        <div>
                          <p className="text-xs font-semibold text-white">Confirmação do Plano</p>
                          <p className="text-[11px] text-zinc-400">Exibe resumo do plano antes de enviar o PIX</p>
                        </div>
                        <Switch
                          checked={config.payments.showPlanConfirmation}
                          onCheckedChange={(checked) =>
                            setConfig({
                              ...config,
                              payments: { ...config.payments, showPlanConfirmation: checked },
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-black/40">
                        <div>
                          <p className="text-xs font-semibold text-white">Copie o código abaixo (Mensagem Separada)</p>
                          <p className="text-[11px] text-zinc-400">
                            Envia o PIX Copia e Cola em mensagem isolada com botão de cópia rápida
                          </p>
                        </div>
                        <Switch
                          checked={config.payments.messageBeforePixCode}
                          onCheckedChange={(checked) =>
                            setConfig({
                              ...config,
                              payments: { ...config.payments, messageBeforePixCode: checked },
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-black/40">
                        <div>
                          <p className="text-xs font-semibold text-white">Mensagem antes dos botões</p>
                          <p className="text-[11px] text-zinc-400">Instrução rápida de verificação pós-pagamento</p>
                        </div>
                        <Switch
                          checked={config.payments.messageBeforeButtons}
                          onCheckedChange={(checked) =>
                            setConfig({
                              ...config,
                              payments: { ...config.payments, messageBeforeButtons: checked },
                            })
                          }
                        />
                      </div>
                    </div>

                    <FlowMediaUploader
                      media={config.payments.media}
                      onChange={(items) =>
                        setConfig({
                          ...config,
                          payments: { ...config.payments, media: items },
                        })
                      }
                      maxItems={2}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-4 text-xs text-emerald-200">
                      Assim que a OmegaPay ou Stripe aprovar a venda, o lead recebe a entrega automática e o botão de acesso ao canal/grupo VIP.
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Mensagem de Entrega / Acesso Liberado</Label>
                      <Textarea
                        rows={4}
                        value={config.payments.approvedMessagePt ?? config.plans.deliveryFallback ?? ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            payments: { ...config.payments, approvedMessagePt: e.target.value },
                            plans: { ...config.plans, deliveryFallback: e.target.value },
                          })
                        }
                        placeholder="🎉 Pagamento aprovado com sucesso! Acesse agora pelo link exclusivo:"
                        className="bg-black/50 border-white/10 text-xs"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Texto do Botão VIP Pós-Aprovação (Opcional)</Label>
                        <Input
                          value={config.payments.approvedButtonText ?? ""}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              payments: { ...config.payments, approvedButtonText: e.target.value },
                            })
                          }
                          placeholder="🔓 Entrar no Grupo VIP"
                          className="bg-black/50 border-white/10 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Link VIP Pós-Aprovação (Opcional)</Label>
                        <Input
                          value={config.payments.approvedButtonUrl ?? ""}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              payments: { ...config.payments, approvedButtonUrl: e.target.value },
                            })
                          }
                          placeholder="https://t.me/+seu-grupo-vip"
                          className="bg-black/50 border-white/10 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview Telegram Card ao Vivo */}
                <div className="rounded-2xl border border-white/10 bg-[#0e1621] p-5 space-y-4 shadow-xl h-fit">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-300 font-bold text-xs">
                        BOT
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Preview do Telegram</p>
                        <p className="text-[10px] text-zinc-400">
                          {paymentsSubTab === "generated" ? "Fluxo: PIX Gerado" : "Fluxo: Pagamento Aprovado"}
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-[10px]">
                      Ao Vivo
                    </Badge>
                  </div>

                  {paymentsSubTab === "generated" ? (
                    <div className="space-y-3 font-sans text-xs">
                      <div className="rounded-xl bg-[#182533] p-3.5 border border-white/10 space-y-2">
                        <p className="font-semibold text-emerald-400">⭐ {config.plans.items[0]?.name || "VITALÍCIO"}</p>
                        <p className="font-bold text-white">
                          💰 Valor: R$ {Number(config.plans.items[0]?.price || 19.9).toFixed(2).replace(".", ",")}
                        </p>
                        <p className="whitespace-pre-wrap text-zinc-300 leading-relaxed">
                          {config.payments.pixInstructions}
                        </p>
                      </div>

                      {config.payments.messageBeforePixCode && (
                        <div className="rounded-xl bg-[#182533] p-3 border border-white/10">
                          <p className="text-zinc-300 mb-1.5 font-medium text-[11px]">
                            📋 Código PIX Copia e Cola (Mensagem Isolada):
                          </p>
                          <div className="p-2 rounded bg-black/60 font-mono text-[10px] break-all border border-white/10 text-cyan-200 select-all">
                            00020126580014br.gov.bcb.pix0136ebqpealelsdxzvsxbeej5204000053039865802BR...
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5 pt-1">
                        <div className="w-full py-2.5 rounded-xl bg-[#2481cc] text-white text-center font-bold text-xs">
                          📋 Copiar Código PIX
                        </div>
                        <div className="w-full py-2.5 rounded-xl bg-white/10 text-white text-center font-semibold text-xs">
                          ✅ Já realizei o pagamento
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 font-sans text-xs">
                      <div className="rounded-xl bg-[#182533] p-3.5 border border-emerald-500/30 space-y-2">
                        <p className="font-bold text-emerald-400">✅ Pagamento Confirmado!</p>
                        <p className="whitespace-pre-wrap text-zinc-200 leading-relaxed">
                          {config.plans.deliveryFallback || "🎉 Seu acesso VIP foi liberado com sucesso!"}
                        </p>
                      </div>
                      <div className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-center font-bold text-xs">
                        🔓 Acessar Conteúdo VIP ↗
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
