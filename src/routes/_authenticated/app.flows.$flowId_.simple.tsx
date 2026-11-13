import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  type AdvancedFlowConfig,
  type SequenceStep,
} from "@/lib/flow-advanced";

export const Route = createFileRoute("/_authenticated/app/flows/$flowId_/simple")({
  head: () => ({
    meta: [
      { title: "Editor de Fluxo | Gerenciador de Bot" },
      { name: "description", content: "Editor completo de fluxos, ofertas, remarketing e pagamentos." },
    ],
  }),
  component: AdvancedFlowEditorPage,
});

const NAV_SECTIONS = [
  { id: "bots", label: "Bots", icon: Bot, category: "ESTRUTURA" },
  { id: "welcome", label: "Boas-vindas", icon: MessageSquare, category: "ESTRUTURA" },
  { id: "plans", label: "Planos", icon: CreditCard, category: "ESTRUTURA" },
  { id: "upsell", label: "Upsell", icon: TrendingUp, category: "CONVERSÃO" },
  { id: "downsell", label: "Downsell", icon: TrendingDown, category: "CONVERSÃO" },
  { id: "orderBump", label: "Order Bump", icon: ShoppingBag, category: "CONVERSÃO" },
  { id: "remarketing", label: "Remarketing", icon: Clock, category: "CONVERSÃO" },
  { id: "payments", label: "Pagamentos", icon: CreditCard, category: "OPERAÇÃO" },
];

export function AdvancedFlowEditorPage() {
  const { flowId } = useParams({ from: "/_authenticated/app/flows/$flowId_/simple" });
  const [activeTab, setActiveTab] = useState<string>("welcome");
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AdvancedFlowConfig>(defaultAdvancedConfig());

  // Carrega dados do fluxo e lista de bots do usuário
  const { data: flowData, isLoading } = useQuery({
    queryKey: ["flow", flowId],
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
        .select("id,name,username,status")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (flowData?.simple_config) {
      setConfig(normalizeAdvancedConfig(flowData.simple_config));
    }
  }, [flowData]);

  async function handleSave() {
    setSaving(true);
    try {
      const selectedBotId = config.bots.linkedBots[0] || flowData?.bot_id;

      // 1. Compila a configuração avançada em grafo de etapas reais do motor Telegram
      const compiled = compileAdvancedConfig(config);

      // 2. Limpa nós e conexões anteriores para garantir sincronização 100% limpa
      await supabase.from("flow_connections").delete().eq("flow_id", flowId);
      await supabase.from("flow_steps").delete().eq("flow_id", flowId);

      // 3. Insere os novos nós compilados no banco de dados
      const idMap = new Map<string, string>();
      for (const step of compiled.steps) {
        const { data: created } = await (supabase
          .from("flow_steps") as any)
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

      // 4. Insere as novas conexões vinculando o menu aos nós PIX correspondentes
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

      // 5. Salva o fluxo como ATIVO e sincroniza com o bot
      const { error } = await supabase
        .from("flows")
        .update({
          simple_config: config as never,
          mode: "simple",
          status: "active",
          is_active: true,
          ...(selectedBotId ? { bot_id: selectedBotId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", flowId);

      if (error) throw error;

      // 6. Desativa outros fluxos do mesmo bot para evitar conflito de execução
      if (selectedBotId) {
        await supabase
          .from("flows")
          .update({ status: "draft", is_active: false })
          .eq("bot_id", selectedBotId)
          .neq("id", flowId);

        await supabase
          .from("bots")
          .update({ status: "active" })
          .eq("id", selectedBotId);
      }

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

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header / Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/80 bg-surface/50 p-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="hover:bg-surface-hover">
            <Link to="/app/flows">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
                {flowData?.name || "MODEL"}
              </h1>
              <Badge variant="outline" className="border-pink-500/30 text-pink-400 bg-pink-500/10 text-xs">
                EDITOR DE FLUXO
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Configure toda a jornada do lead em um só lugar</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-black/40 px-3 py-1.5 border border-border text-xs">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-muted-foreground">Tudo salvo</span>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-medium shadow-md shadow-pink-500/20"
          >
            {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
            Salvar alterações
          </Button>
        </div>
      </div>

      {/* Main Grid: Sidebar Menu + Content Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Navigation Sidebar */}
        <aside className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-4 backdrop-blur h-fit">
          <div>
            <div className="flex items-center justify-between mb-3 px-1 text-xs font-semibold text-muted-foreground tracking-wider uppercase">
              <span>Navegação</span>
              <span>1 de 8 seções</span>
            </div>

            <div className="space-y-1">
              {NAV_SECTIONS.map((sec) => {
                const Icon = sec.icon;
                const active = activeTab === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setActiveTab(sec.id)}
                    className={`flex items-center gap-3 w-full rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                      active
                        ? "bg-pink-500/15 text-pink-400 border border-pink-500/30 shadow-sm"
                        : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    <Icon className={`size-4.5 ${active ? "text-pink-400" : "text-muted-foreground"}`} />
                    <span>{sec.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Content Section */}
        <main className="space-y-6">
          {/* ABA BOTS */}
          {activeTab === "bots" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="flex items-center justify-between border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Bot className="size-5 text-primary" /> Bots Vinculados
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Gerencie quais bots executam este fluxo
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
                            <p className="text-xs text-muted-foreground">@{bot.username || "bot"}</p>
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

          {/* ABA BOAS-VINDAS */}
          {activeTab === "welcome" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="border-b border-border/60 pb-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <MessageSquare className="size-5 text-primary" /> Boas-vindas
                </h2>
                <p className="text-xs text-muted-foreground">
                  Primeira mensagem enviada quando o lead clica em Iniciar (/start)
                </p>
              </div>

              {/* Upload de mídias direto do PC */}
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Mensagem de Boas-vindas *</Label>
                  <span className="text-[11px] text-muted-foreground">
                    {config.welcome.message.length}/4000 caracteres
                  </span>
                </div>
                <Textarea
                  rows={6}
                  value={config.welcome.message}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      welcome: { ...config.welcome, message: e.target.value },
                    })
                  }
                  placeholder="Escreva a mensagem que seu bot vai enviar..."
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
                            message: config.welcome.message + " " + tag,
                          },
                        })
                      }
                      className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:bg-surface-hover hover:text-foreground border border-border"
                    >
                      {tag}
                    </button>
                  ))}
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
                      duration: "Vitalício",
                      buttonColor: "default" as const,
                      deliveryType: "fallback" as const,
                      hasCustomOrderBump: false,
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

              <div className="space-y-4">
                {config.plans.items.map((plan, idx) => (
                  <div
                    key={plan.id}
                    className="p-4 rounded-xl border border-border/80 bg-surface/50 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground">
                        Plano #{idx + 1} — {plan.name} (R$ {plan.price.toFixed(2)})
                      </span>
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
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <Label className="text-xs">Nome do Plano</Label>
                        <Input
                          value={plan.name}
                          onChange={(e) => {
                            const updated = config.plans.items.map((p) =>
                              p.id === plan.id ? { ...p, name: e.target.value } : p
                            );
                            setConfig({ ...config, plans: { ...config.plans, items: updated } });
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Preço (BRL)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={plan.price}
                          onChange={(e) => {
                            const updated = config.plans.items.map((p) =>
                              p.id === plan.id ? { ...p, price: Number(e.target.value) } : p
                            );
                            setConfig({ ...config, plans: { ...config.plans, items: updated } });
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Duração</Label>
                        <Input
                          value={plan.duration}
                          onChange={(e) => {
                            const updated = config.plans.items.map((p) =>
                              p.id === plan.id ? { ...p, duration: e.target.value } : p
                            );
                            setConfig({ ...config, plans: { ...config.plans, items: updated } });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABA UPSELL */}
          {activeTab === "upsell" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="flex items-center justify-between border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <TrendingUp className="size-5 text-pink-400" /> Sequências de Upsell
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Aumente o ticket médio oferecendo produtos imediatamente após a aprovação
                  </p>
                </div>
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

              {config.upsell.sequences.map((seq, seqIdx) => (
                <div key={seq.id} className="space-y-5 rounded-xl border border-border bg-surface/50 p-5">
                  <div className="flex items-center justify-between border-b border-border/50 pb-3">
                    <span className="font-semibold text-sm text-foreground">
                      {seq.title}
                    </span>
                    <Badge variant="outline" className="text-xs">Imediato após compra</Badge>
                  </div>

                  {/* Upload de mídias direto do PC com preview */}
                  <FlowMediaUploader
                    media={seq.media}
                    mode={seq.mediaMode}
                    onChange={(items) => {
                      const updated = config.upsell.sequences.map((s) =>
                        s.id === seq.id ? { ...s, media: items } : s
                      );
                      setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                    }}
                    maxItems={3}
                  />

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

                  {/* Oferta / Preço com Desconto */}
                  <div className="grid gap-4 sm:grid-cols-2 bg-black/30 p-4 rounded-xl border border-border/60">
                    <div>
                      <Label className="text-xs">Nome da Oferta / Botão</Label>
                      <Input
                        value={seq.plans[0]?.name || ""}
                        onChange={(e) => {
                          const currentPlans = [...seq.plans];
                          if (currentPlans[0]) currentPlans[0].name = e.target.value;
                          const updated = config.upsell.sequences.map((s) =>
                            s.id === seq.id ? { ...s, plans: currentPlans } : s
                          );
                          setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Preço com Desconto (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={seq.plans[0]?.discountPrice || 0}
                        onChange={(e) => {
                          const currentPlans = [...seq.plans];
                          if (currentPlans[0]) currentPlans[0].discountPrice = Number(e.target.value);
                          const updated = config.upsell.sequences.map((s) =>
                            s.id === seq.id ? { ...s, plans: currentPlans } : s
                          );
                          setConfig({ ...config, upsell: { ...config.upsell, sequences: updated } });
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ABA DOWNSELL - 2 ÁREAS SEPARADAS */}
          {activeTab === "downsell" && (
            <div className="space-y-8 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="flex items-center justify-between border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <TrendingDown className="size-5 text-amber-400" /> Estratégia de Downsell (Até 20 Sequências)
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Recupere leads perdidos com ofertas alternativas divididas por momento de abandono.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Ativar Downsell Geral</span>
                  <Switch
                    checked={config.downsell.enabled}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, downsell: { ...config.downsell, enabled: checked } })
                    }
                  />
                </div>
              </div>

              {/* ÁREA 1: DOWNSELL DE INÍCIO (/START SEM GERAR PIX) */}
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

              {/* ÁREA 2: DOWNSELL DE PIX PENDENTE (PIX GERADO SEM PAGAMENTO) */}
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
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs"
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
            </div>
          )}

          {/* ABA ORDER BUMP */}
          {activeTab === "orderBump" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="flex items-center justify-between border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <ShoppingBag className="size-5 text-primary" /> Order Bump
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Produto adicional oferecido no checkout antes da conclusão
                  </p>
                </div>
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Nome do Produto</Label>
                  <Input
                    value={config.orderBump.productName}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        orderBump: { ...config.orderBump, productName: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Preço (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
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

              <div className="space-y-2">
                <Label>Descrição / Mensagem do Order Bump</Label>
                <Textarea
                  rows={4}
                  value={config.orderBump.description}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      orderBump: { ...config.orderBump, description: e.target.value },
                    })
                  }
                />
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
          )}

          {/* ABA REMARKETING */}
          {activeTab === "remarketing" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Clock className="size-5 text-red-500" /> Área Exclusiva de Remarketing
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Configure mensagens automáticas de recuperação periódicas com mídias, ofertas e copys.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Ativar Campanha</span>
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
                    <option value={1}>A cada 1 hora</option>
                    <option value={2}>A cada 2 horas</option>
                    <option value={3}>A cada 3 horas (Recomendado)</option>
                    <option value={6}>A cada 6 horas</option>
                    <option value={12}>A cada 12 horas</option>
                    <option value={24}>A cada 24 horas (Diário)</option>
                  </select>
                  <p className="text-[11px] text-zinc-500">
                    O sistema disparará automaticamente no intervalo selecionado para os leads elegíveis.
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
                        {b.name} (@{b.username || "bot"})
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
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs"
                >
                  <Plus className="size-4 mr-1.5" /> Adicionar Mensagem de Remarketing
                </Button>
              </div>

              {(config.remarketing.sequences ?? []).map((seq, idx) => (
                <div key={seq.id} className="space-y-4 rounded-2xl border border-white/10 bg-black/40 p-5 shadow-lg">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-red-400">#{idx + 1} {seq.title}</span>
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

                  {/* Oferta / Plano de Remarketing */}
                  <div className="grid gap-3 sm:grid-cols-2 bg-zinc-900/60 p-3.5 rounded-xl border border-white/5">
                    <div>
                      <Label className="text-[11px] text-zinc-400">Nome do Plano de Remarketing</Label>
                      <Input
                        className="h-8 text-xs bg-black/50 border-white/10 text-white"
                        value={seq.plans?.[0]?.name || ""}
                        onChange={(e) => {
                          const plans = [...(seq.plans ?? [{ id: "p1", name: "", duration: "Vitalício", originalPrice: 0, discountPrice: 0 }])];
                          if (plans[0]) plans[0].name = e.target.value;
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
                      <Label className="text-[11px] text-zinc-400">Preço com Desconto (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 text-xs bg-black/50 border-white/10 text-white font-bold text-red-400"
                        value={seq.plans?.[0]?.discountPrice || 0}
                        onChange={(e) => {
                          const plans = [...(seq.plans ?? [{ id: "p1", name: "", duration: "Vitalício", originalPrice: 0, discountPrice: 0 }])];
                          if (plans[0]) plans[0].discountPrice = Number(e.target.value);
                          const updated = config.remarketing.sequences.map((s) =>
                            s.id === seq.id ? { ...s, plans } : s
                          );
                          setConfig({
                            ...config,
                            remarketing: { ...config.remarketing, sequences: updated },
                          });
                        }}
                        placeholder="9.90"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ABA PAGAMENTOS */}
          {activeTab === "payments" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="border-b border-border/60 pb-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <CreditCard className="size-5 text-primary" /> Configuração do PIX & Preview
                </h2>
                <p className="text-xs text-muted-foreground">
                  Personalize as instruções de pagamento e como o código PIX será entregue
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label>Instruções do PIX</Label>
                    <Textarea
                      rows={5}
                      value={config.payments.pixInstructions}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          payments: { ...config.payments, pixInstructions: e.target.value },
                        })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-surface/50">
                    <div>
                      <p className="text-sm font-medium">Copie o código abaixo</p>
                      <p className="text-xs text-muted-foreground">Mensagem antes da chave PIX copia e cola</p>
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
                </div>

                {/* Preview Telegram Card */}
                <div className="rounded-2xl border border-border bg-black/60 p-5 space-y-4 shadow-xl">
                  <div className="flex items-center gap-3 border-b border-border/40 pb-3">
                    <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                      BOT
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Seu Bot Telegram</p>
                      <p className="text-[10px] text-muted-foreground">bot</p>
                    </div>
                  </div>

                  <div className="space-y-3 font-sans text-xs">
                    <div className="rounded-xl bg-surface/70 p-3.5 border border-border space-y-2">
                      <p className="font-semibold text-emerald-400">✅ Como realizar o pagamento:</p>
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {config.payments.pixInstructions}
                      </p>
                    </div>

                    {config.payments.messageBeforePixCode && (
                      <div className="rounded-xl bg-surface/70 p-3 border border-border">
                        <p className="text-muted-foreground mb-1.5 font-medium">Copie o código abaixo:</p>
                        <div className="p-2 rounded bg-black/80 font-mono text-[10px] break-all border border-border/80 text-muted-foreground select-all">
                          00020126580014br.gov.bcb.pix0136ebqpealelsdxzvsxbeej5204000053039865802BR5925PAGAMENTO6009SAO...
                        </div>
                      </div>
                    )}

                    <div className="pt-2">
                      <Button className="w-full bg-primary/20 text-primary hover:bg-primary/30 border border-primary/40 text-xs">
                        📋 Copiar Código PIX
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
