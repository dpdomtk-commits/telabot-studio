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
        .select("id,name,bot_id,user_id,status,settings")
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
    if (flowData?.settings) {
      setConfig(normalizeAdvancedConfig(flowData.settings));
    }
  }, [flowData]);

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("flows")
        .update({
          settings: config as never,
          updated_at: new Date().toISOString(),
        })
        .eq("id", flowId);

      if (error) throw error;
      toast.success("Todas as alterações foram salvas com sucesso!");
    } catch (e) {
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

          {/* ABA DOWNSELL */}
          {activeTab === "downsell" && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-surface/40 p-6 backdrop-blur">
              <div className="flex items-center justify-between border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <TrendingDown className="size-5 text-amber-400" /> Sequências de Downsell
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Recupere vendas com ofertas alternativas caso o lead não compre
                  </p>
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

              {config.downsell.sequences.map((seq) => (
                <div key={seq.id} className="space-y-5 rounded-xl border border-border bg-surface/50 p-5">
                  <div className="flex items-center justify-between border-b border-border/50 pb-3">
                    <span className="font-semibold text-sm text-foreground">{seq.title}</span>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Disparar após:</Label>
                      <Input
                        type="number"
                        className="w-20 h-8 text-xs"
                        value={seq.delayValue}
                        onChange={(e) => {
                          const updated = config.downsell.sequences.map((s) =>
                            s.id === seq.id ? { ...s, delayValue: Number(e.target.value) } : s
                          );
                          setConfig({ ...config, downsell: { ...config.downsell, sequences: updated } });
                        }}
                      />
                      <span className="text-xs text-muted-foreground">minutos</span>
                    </div>
                  </div>

                  <FlowMediaUploader
                    media={seq.media}
                    mode={seq.mediaMode}
                    onChange={(items) => {
                      const updated = config.downsell.sequences.map((s) =>
                        s.id === seq.id ? { ...s, media: items } : s
                      );
                      setConfig({ ...config, downsell: { ...config.downsell, sequences: updated } });
                    }}
                    maxItems={3}
                  />

                  {/* Seleção de Bots */}
                  <div className="space-y-2">
                    <Label className="text-xs">Quais bots enviarão este Downsell?</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={seq.targetBots.includes("all") ? "default" : "outline"}
                        onClick={() => {
                          const updated = config.downsell.sequences.map((s) =>
                            s.id === seq.id ? { ...s, targetBots: ["all"] } : s
                          );
                          setConfig({ ...config, downsell: { ...config.downsell, sequences: updated } });
                        }}
                      >
                        Todos os bots
                      </Button>
                      {userBots.map((b) => (
                        <Button
                          key={b.id}
                          type="button"
                          size="sm"
                          variant={seq.targetBots.includes(b.id) ? "secondary" : "outline"}
                          onClick={() => {
                            const next = seq.targetBots.includes(b.id)
                              ? seq.targetBots.filter((id) => id !== b.id)
                              : [...seq.targetBots.filter((id) => id !== "all"), b.id];
                            const updated = config.downsell.sequences.map((s) =>
                              s.id === seq.id ? { ...s, targetBots: next.length ? next : ["all"] } : s
                            );
                            setConfig({ ...config, downsell: { ...config.downsell, sequences: updated } });
                          }}
                        >
                          {b.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Mensagem de Recuperação *</Label>
                    <Textarea
                      rows={4}
                      value={seq.message}
                      onChange={(e) => {
                        const updated = config.downsell.sequences.map((s) =>
                          s.id === seq.id ? { ...s, message: e.target.value } : s
                        );
                        setConfig({ ...config, downsell: { ...config.downsell, sequences: updated } });
                      }}
                      placeholder="Preparei um valor menor para você aproveitar hoje..."
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 bg-black/30 p-4 rounded-xl border border-border/60">
                    <div>
                      <Label className="text-xs">Nome do Plano Reduzido</Label>
                      <Input
                        value={seq.plans[0]?.name || ""}
                        onChange={(e) => {
                          const currentPlans = [...seq.plans];
                          if (currentPlans[0]) currentPlans[0].name = e.target.value;
                          const updated = config.downsell.sequences.map((s) =>
                            s.id === seq.id ? { ...s, plans: currentPlans } : s
                          );
                          setConfig({ ...config, downsell: { ...config.downsell, sequences: updated } });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Preço Reduzido (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={seq.plans[0]?.discountPrice || 0}
                        onChange={(e) => {
                          const currentPlans = [...seq.plans];
                          if (currentPlans[0]) currentPlans[0].discountPrice = Number(e.target.value);
                          const updated = config.downsell.sequences.map((s) =>
                            s.id === seq.id ? { ...s, plans: currentPlans } : s
                          );
                          setConfig({ ...config, downsell: { ...config.downsell, sequences: updated } });
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
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
              <div className="flex items-center justify-between border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Clock className="size-5 text-indigo-400" /> Campanhas de Remarketing
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Envie mensagens automáticas para leads com PIX pendente ou abandonados
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Ativar Remarketing</span>
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

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const newSeq: SequenceStep = {
                    id: `seq-rem-${Date.now()}`,
                    title: `Disparo #${config.remarketing.sequences.length + 1}`,
                    enabled: true,
                    delayValue: 30,
                    delayUnit: "minutes",
                    targetBots: ["all"],
                    media: [],
                    mediaMode: "separated",
                    message: "Olá! Notei que você não concluiu seu acesso. Quer ajuda?",
                    discountType: "none",
                    discountValue: 0,
                    plans: [],
                  };
                  setConfig({
                    ...config,
                    remarketing: {
                      ...config.remarketing,
                      sequences: [...config.remarketing.sequences, newSeq],
                    },
                  });
                }}
              >
                <Plus className="size-4 mr-1" /> Adicionar Disparo de Remarketing
              </Button>

              {config.remarketing.sequences.map((seq) => (
                <div key={seq.id} className="space-y-5 rounded-xl border border-border bg-surface/50 p-5">
                  <div className="flex items-center justify-between border-b border-border/50 pb-3">
                    <span className="font-semibold text-sm text-foreground">{seq.title}</span>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Enviar após:</Label>
                      <Input
                        type="number"
                        className="w-20 h-8 text-xs"
                        value={seq.delayValue}
                        onChange={(e) => {
                          const updated = config.remarketing.sequences.map((s) =>
                            s.id === seq.id ? { ...s, delayValue: Number(e.target.value) } : s
                          );
                          setConfig({
                            ...config,
                            remarketing: { ...config.remarketing, sequences: updated },
                          });
                        }}
                      />
                      <select
                        className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground"
                        value={seq.delayUnit}
                        onChange={(e) => {
                          const updated = config.remarketing.sequences.map((s) =>
                            s.id === seq.id
                              ? { ...s, delayUnit: e.target.value as SequenceStep["delayUnit"] }
                              : s
                          );
                          setConfig({
                            ...config,
                            remarketing: { ...config.remarketing, sequences: updated },
                          });
                        }}
                      >
                        <option value="minutes">Minutos</option>
                        <option value="hours">Horas</option>
                        <option value="days">Dias</option>
                      </select>
                    </div>
                  </div>

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

                  {/* Seleção de Bots de Remarketing */}
                  <div className="space-y-2">
                    <Label className="text-xs">Quais bots enviarão este Remarketing?</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={seq.targetBots.includes("all") ? "default" : "outline"}
                        onClick={() => {
                          const updated = config.remarketing.sequences.map((s) =>
                            s.id === seq.id ? { ...s, targetBots: ["all"] } : s
                          );
                          setConfig({
                            ...config,
                            remarketing: { ...config.remarketing, sequences: updated },
                          });
                        }}
                      >
                        Todos os bots
                      </Button>
                      {userBots.map((b) => (
                        <Button
                          key={b.id}
                          type="button"
                          size="sm"
                          variant={seq.targetBots.includes(b.id) ? "secondary" : "outline"}
                          onClick={() => {
                            const next = seq.targetBots.includes(b.id)
                              ? seq.targetBots.filter((id) => id !== b.id)
                              : [...seq.targetBots.filter((id) => id !== "all"), b.id];
                            const updated = config.remarketing.sequences.map((s) =>
                              s.id === seq.id ? { ...s, targetBots: next.length ? next : ["all"] } : s
                            );
                            setConfig({
                              ...config,
                              remarketing: { ...config.remarketing, sequences: updated },
                            });
                          }}
                        >
                          {b.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Mensagem do Disparo *</Label>
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
                      placeholder="Mensagem de persuasão para o lead finalizar..."
                    />
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
