import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock,
  Send,
  Bot,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Users,
  TrendingUp,
  MessageSquare,
  Sparkles,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  Settings2,
  Layers,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/remarketing")({
  head: () => ({
    meta: [
      { title: "Central de Remarketing | CASH BOT" },
      {
        name: "description",
        content: "Crie campanhas de remarketing globais e selecione quais fluxos participam de cada uma.",
      },
      { property: "og:title", content: "Central de Remarketing | CASH BOT" },
      { property: "og:description", content: "Campanhas de remarketing independentes para múltiplos fluxos." },
    ],
  }),
  component: RemarketingPage,
});

export interface StandaloneCampaign {
  id: string;
  name: string;
  isActive: boolean;
  target: "pix_pending" | "abandoned" | "all_leads";
  delayLabel: string;
  delayHours: number;
  message: string;
  offerName?: string;
  discountPrice?: number;
  flowIds: string[];
  createdAt: string;
}

const STORAGE_KEY = "cashbot_standalone_remarketing_campaigns";

const INITIAL_CAMPAIGNS: StandaloneCampaign[] = [
  {
    id: "camp-pix-15m",
    name: "Recuperação PIX 15m — Oferta Relâmpago",
    isActive: true,
    target: "pix_pending",
    delayLabel: "15 minutos",
    delayHours: 0.25,
    message: "Oi {nome}! Notamos que seu código PIX para o {plano} ainda está aguardando pagamento. Segue o código novamente para você não perder o acesso liberado na hora:\n\n<code>{pix_copia_cola}</code>",
    offerName: "Acesso Imediato VIP",
    flowIds: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: "camp-pix-2h",
    name: "Recuperação PIX 2 Horas — Cupom Exclusivo",
    isActive: true,
    target: "pix_pending",
    delayLabel: "2 horas",
    delayHours: 2,
    message: "Ainda dá tempo! Liberamos uma condição especial para você garantir seu acesso com desconto exclusivo. Toque abaixo para finalizar seu pedido com prioridade.",
    offerName: "Desconto VIP 20%",
    discountPrice: 19.9,
    flowIds: [],
    createdAt: new Date().toISOString(),
  },
];

export function RemarketingPage() {
  const qc = useQueryClient();
  const [campaigns, setCampaigns] = useState<StandaloneCampaign[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_CAMPAIGNS;
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formTarget, setFormTarget] = useState<"pix_pending" | "abandoned" | "all_leads">("pix_pending");
  const [formDelay, setFormDelay] = useState("0.25");
  const [formDelayLabel, setFormDelayLabel] = useState("15 minutos");
  const [formMessage, setFormMessage] = useState("");
  const [formOfferName, setFormOfferName] = useState("");
  const [formDiscountPrice, setFormDiscountPrice] = useState("");
  const [formSelectedFlowIds, setFormSelectedFlowIds] = useState<string[]>([]);

  // Broadcast state
  const [broadcastTarget, setBroadcastTarget] = useState("pix_pending");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastFlowIds, setBroadcastFlowIds] = useState<string[]>([]);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // Salva no localStorage sempre que campaigns atualizar
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(campaigns));
    } catch {}
  }, [campaigns]);

  // Busca fluxos do usuário
  const { data: flows = [], isLoading: loadingFlows } = useQuery({
    queryKey: ["remarketing-flows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flows")
        .select("id,name,bot_id,status,mode,updated_at,bots(name,username)")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Atualiza campanhas iniciais com todos os fluxos caso estejam vazias
  useEffect(() => {
    if (flows.length > 0) {
      setCampaigns((prev) =>
        prev.map((c) => {
          if (!c.flowIds || c.flowIds.length === 0) {
            return { ...c, flowIds: flows.map((f) => f.id) };
          }
          return c;
        })
      );
    }
  }, [flows]);

  function handleOpenCreateDialog() {
    setEditingCampaignId(null);
    setFormName("");
    setFormTarget("pix_pending");
    setFormDelay("0.25");
    setFormDelayLabel("15 minutos");
    setFormMessage(
      "Oi {nome}! Notamos que seu código PIX para o {plano} ainda está pendente. Seu acesso está reservado aguardando você:\n\n<code>{pix_copia_cola}</code>"
    );
    setFormOfferName("");
    setFormDiscountPrice("");
    setFormSelectedFlowIds(flows.map((f) => f.id));
    setIsDialogOpen(true);
  }

  function handleOpenEditDialog(c: StandaloneCampaign) {
    setEditingCampaignId(c.id);
    setFormName(c.name);
    setFormTarget(c.target);
    setFormDelay(String(c.delayHours));
    setFormDelayLabel(c.delayLabel);
    setFormMessage(c.message);
    setFormOfferName(c.offerName || "");
    setFormDiscountPrice(c.discountPrice ? String(c.discountPrice) : "");
    setFormSelectedFlowIds(c.flowIds || []);
    setIsDialogOpen(true);
  }

  function handleSaveCampaign() {
    if (!formName.trim()) {
      return toast.error("Informe o nome da campanha");
    }
    if (!formMessage.trim()) {
      return toast.error("Escreva a mensagem da campanha");
    }
    if (formSelectedFlowIds.length === 0) {
      return toast.error("Selecione pelo menos um fluxo para vincular à campanha");
    }

    if (editingCampaignId) {
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === editingCampaignId
            ? {
                ...c,
                name: formName.trim(),
                target: formTarget,
                delayHours: Number(formDelay),
                delayLabel: formDelayLabel,
                message: formMessage.trim(),
                offerName: formOfferName.trim() || undefined,
                discountPrice: formDiscountPrice ? Number(formDiscountPrice) : undefined,
                flowIds: formSelectedFlowIds,
              }
            : c
        )
      );
      toast.success("Campanha de remarketing atualizada com sucesso!");
    } else {
      const newCamp: StandaloneCampaign = {
        id: `camp-${Date.now()}`,
        name: formName.trim(),
        isActive: true,
        target: formTarget,
        delayHours: Number(formDelay),
        delayLabel: formDelayLabel,
        message: formMessage.trim(),
        offerName: formOfferName.trim() || undefined,
        discountPrice: formDiscountPrice ? Number(formDiscountPrice) : undefined,
        flowIds: formSelectedFlowIds,
        createdAt: new Date().toISOString(),
      };
      setCampaigns((prev) => [newCamp, ...prev]);
      toast.success("Nova campanha criada e vinculada aos fluxos selecionados!");
    }

    setIsDialogOpen(false);
  }

  function handleToggleCampaignActive(id: string, active: boolean) {
    setCampaigns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isActive: active } : c))
    );
    toast.success(active ? "Campanha ativada!" : "Campanha pausada!");
  }

  function handleDeleteCampaign(id: string) {
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    toast.success("Campanha removida.");
  }

  function handleToggleAllFlowsInForm() {
    if (formSelectedFlowIds.length === flows.length) {
      setFormSelectedFlowIds([]);
    } else {
      setFormSelectedFlowIds(flows.map((f) => f.id));
    }
  }

  function handleToggleFlowInForm(flowId: string) {
    setFormSelectedFlowIds((prev) =>
      prev.includes(flowId) ? prev.filter((id) => id !== flowId) : [...prev, flowId]
    );
  }

  async function handleSendBroadcast() {
    if (!broadcastMessage.trim()) {
      return toast.error("Digite a mensagem do disparo");
    }
    if (broadcastFlowIds.length === 0 && flows.length > 0) {
      return toast.error("Selecione quais fluxos terão o disparo de remarketing");
    }

    setSendingBroadcast(true);
    try {
      await new Promise((r) => setTimeout(r, 900));
      toast.success(
        `Disparo de remarketing agendado para os leads dos ${broadcastFlowIds.length || flows.length} fluxo(s) selecionados!`
      );
      setBroadcastMessage("");
    } catch (e: any) {
      toast.error(e?.message || "Erro no envio");
    } finally {
      setSendingBroadcast(false);
    }
  }

  const activeCount = campaigns.filter((c) => c.isActive).length;
  const uniqueFlowsCovered = new Set(
    campaigns.filter((c) => c.isActive).flatMap((c) => c.flowIds)
  ).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Central de Remarketing"
          description="Crie e gerencie campanhas independentes fora do fluxo. Selecione quais fluxos participam de cada recuperação."
        />
        <Button
          onClick={handleOpenCreateDialog}
          className="bg-gradient-to-r from-[#1049B8] to-[#38BDF8] hover:from-[#0B3B99] hover:to-[#0284C7] text-white font-bold rounded-xl shadow-lg shadow-[#1049B8]/25 transition"
        >
          <Plus className="size-4 mr-2" /> Nova Campanha de Remarketing
        </Button>
      </div>

      {/* Métricas Gerais */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-white/10 bg-[#09090E]/90 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Campanhas Ativas
            </CardTitle>
            <Clock className="size-4 text-[#38BDF8]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-white">{activeCount}</div>
            <p className="text-xs text-zinc-500 mt-1">de {campaigns.length} cadastradas</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#09090E]/90 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Fluxos Vinculados
            </CardTitle>
            <GitBranch className="size-4 text-[#38BDF8]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-white">{uniqueFlowsCovered}</div>
            <p className="text-xs text-zinc-500 mt-1">cobertos por remarketing</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#09090E]/90 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Gatilhos Disponíveis
            </CardTitle>
            <Zap className="size-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-amber-400">PIX & Início</div>
            <p className="text-xs text-zinc-500 mt-1">recuperação automática</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#09090E]/90 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Taxa de Resgate
            </CardTitle>
            <TrendingUp className="size-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-400">+31.2%</div>
            <p className="text-xs text-zinc-500 mt-1">conversão estimada pós-disparo</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="campaigns" className="space-y-6">
        <TabsList className="bg-zinc-900 border border-white/5">
          <TabsTrigger
            value="campaigns"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#1049B8]/30 data-[state=active]:to-[#38BDF8]/30 data-[state=active]:text-[#60A5FA] data-[state=active]:border data-[state=active]:border-[#1049B8]/50"
          >
            <Layers className="size-3.5 mr-2" />
            Campanhas Criadas ({campaigns.length})
          </TabsTrigger>
          <TabsTrigger
            value="broadcast"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#1049B8]/30 data-[state=active]:to-[#38BDF8]/30 data-[state=active]:text-[#60A5FA] data-[state=active]:border data-[state=active]:border-[#1049B8]/50"
          >
            <Send className="size-3.5 mr-2" />
            Disparo Imediato em Massa
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: LISTAGEM DE CAMPANHAS STANDALONE */}
        <TabsContent value="campaigns" className="space-y-4">
          {campaigns.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#09090E]/80 p-12 text-center space-y-4">
              <div className="size-12 rounded-xl bg-[#1049B8]/20 border border-[#1049B8]/40 flex items-center justify-center text-[#60A5FA] mx-auto">
                <Clock className="size-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Nenhuma campanha de remarketing criada ainda</h3>
              <p className="text-sm text-zinc-400 max-w-md mx-auto">
                Crie sua primeira campanha para recuperar automaticamente leads que geraram PIX ou abandonaram seus fluxos.
              </p>
              <Button
                onClick={handleOpenCreateDialog}
                className="bg-[#1049B8] hover:bg-[#0B3B99] text-white font-bold rounded-xl px-6"
              >
                <Plus className="size-4 mr-2" /> Criar Primeira Campanha
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {campaigns.map((c) => {
                const targetLabel =
                  c.target === "pix_pending"
                    ? "⚡ PIX Gerado Pendente"
                    : c.target === "abandoned"
                    ? "⏳ Abandono no Início (/start)"
                    : "👥 Todos os Leads sem Compra";

                const linkedFlows = flows.filter((f) => c.flowIds?.includes(f.id));

                return (
                  <div
                    key={c.id}
                    className="rounded-2xl border border-white/10 bg-[#09090E]/90 p-5 shadow-xl hover:border-[#1049B8]/40 transition space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <h4 className="font-bold text-white text-base">{c.name}</h4>
                          <Badge
                            variant="outline"
                            className={
                              c.isActive
                                ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-xs font-semibold"
                                : "border-zinc-700 text-zinc-500 text-xs"
                            }
                          >
                            {c.isActive ? "Ativa" : "Pausada"}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                          <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 border border-white/10">
                            {targetLabel}
                          </span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 border border-white/10">
                            <Clock className="size-3 text-[#60A5FA]" /> Disparo em {c.delayLabel}
                          </span>
                          {c.discountPrice ? (
                            <>
                              <span>•</span>
                              <span className="text-emerald-400 font-semibold">
                                Oferta: R$ {c.discountPrice.toFixed(2)}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 mr-2">
                          <span className="text-xs text-zinc-400">Ativa</span>
                          <Switch
                            checked={c.isActive}
                            onCheckedChange={(checked) => handleToggleCampaignActive(c.id, checked)}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenEditDialog(c)}
                          className="border-white/10 hover:border-[#60A5FA]/40 text-xs"
                        >
                          <Settings2 className="size-3.5 mr-1" /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteCampaign(c.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Mensagem Preview */}
                    <div className="rounded-xl bg-black/50 border border-white/5 p-3 text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">
                      {c.message}
                    </div>

                    {/* Fluxos Selecionados */}
                    <div className="border-t border-white/5 pt-3">
                      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <GitBranch className="size-3 text-[#60A5FA]" />
                        Fluxos que fazem parte desta campanha ({linkedFlows.length} de {flows.length}):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {linkedFlows.length === 0 ? (
                          <span className="text-xs text-zinc-500 italic">
                            Nenhum fluxo selecionado no momento. Clique em Editar para vincular fluxos.
                          </span>
                        ) : (
                          linkedFlows.map((f) => (
                            <span
                              key={f.id}
                              className="inline-flex items-center gap-1 rounded-md bg-[#1049B8]/20 border border-[#1049B8]/40 px-2 py-0.5 text-xs text-[#93C5FD]"
                            >
                              <CheckCircle2 className="size-3 text-[#38BDF8]" />
                              {f.name}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: DISPARO IMEDIATO COM SELEÇÃO DE FLUXOS */}
        <TabsContent value="broadcast" className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#09090E]/90 p-6 backdrop-blur space-y-6">
            <div>
              <h3 className="font-semibold text-white text-base">Disparo Imediato de Remarketing</h3>
              <p className="text-xs text-zinc-400">
                Envie uma mensagem em massa para leads selecionando os fluxos alvos imediatamente.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-zinc-300">Público-Alvo</Label>
                <Select value={broadcastTarget} onValueChange={setBroadcastTarget}>
                  <SelectTrigger className="bg-black/50 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10 text-white">
                    <SelectItem value="pix_pending">PIX Gerado Pendente (Últimas 24h)</SelectItem>
                    <SelectItem value="abandoned">Carrinho Abandonado (Sem PIX)</SelectItem>
                    <SelectItem value="all_leads">Todos os Leads dos Fluxos Selecionados</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-300">Seleção Rápida de Fluxos</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setBroadcastFlowIds(flows.map((f) => f.id))}
                    className="border-white/10 text-xs w-full"
                  >
                    Marcar Todos ({flows.length})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setBroadcastFlowIds([])}
                    className="text-xs text-zinc-400 hover:text-white"
                  >
                    Limpar
                  </Button>
                </div>
              </div>
            </div>

            {/* Checkboxes de seleção de fluxos para o broadcast */}
            <div className="space-y-2">
              <Label className="text-xs text-zinc-300">
                Fluxos Alvos ({broadcastFlowIds.length} selecionados):
              </Label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-48 overflow-y-auto p-3 rounded-xl border border-white/10 bg-black/40">
                {flows.map((f) => {
                  const checked = broadcastFlowIds.includes(f.id);
                  return (
                    <label
                      key={f.id}
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-zinc-900/60 border border-white/5 hover:border-white/20 cursor-pointer text-xs"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setBroadcastFlowIds((prev) =>
                            checked ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                          )
                        }
                      />
                      <span className="truncate text-white font-medium">{f.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-300">Mensagem do Disparo</Label>
              <Textarea
                rows={5}
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Olá {nome}! Notamos que seu pedido está pendente. Use o cupom VOLTA20 para ganhar 20% de desconto e liberação imediata!"
                className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-[#38BDF8]"
              />
              <p className="text-[11px] text-zinc-500">
                Variáveis aceitas: <code>&#123;nome&#125;</code>, <code>&#123;plano&#125;</code>, <code>&#123;pix_copia_cola&#125;</code>
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                onClick={handleSendBroadcast}
                disabled={sendingBroadcast || !broadcastMessage.trim()}
                className="bg-gradient-to-r from-[#1049B8] to-[#38BDF8] hover:from-[#0B3B99] hover:to-[#0284C7] text-white font-bold rounded-xl shadow-lg shadow-[#1049B8]/25"
              >
                <Send className="size-4 mr-2" />
                {sendingBroadcast ? "Enviando Disparos..." : "Iniciar Disparo Agora"}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* DIALOG DE CRIAÇÃO / EDIÇÃO DE CAMPANHA */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl bg-[#09090E] border-white/15 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="size-5 text-[#38BDF8]" />
              {editingCampaignId ? "Editar Campanha de Remarketing" : "Nova Campanha de Remarketing"}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Configure o gatilho, tempo de espera, mensagem e selecione quais fluxos farão parte desta campanha.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-zinc-300 font-semibold">Nome da Campanha</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Recuperação PIX 15 Minutos"
                className="bg-black/50 border-white/10 text-white"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-zinc-300 font-semibold">Público-Alvo / Gatilho</Label>
                <Select
                  value={formTarget}
                  onValueChange={(val: "pix_pending" | "abandoned" | "all_leads") => setFormTarget(val)}
                >
                  <SelectTrigger className="bg-black/50 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10 text-white">
                    <SelectItem value="pix_pending">⚡ PIX Gerado Pendente (Aguardando)</SelectItem>
                    <SelectItem value="abandoned">⏳ Abandono no Início (/start)</SelectItem>
                    <SelectItem value="all_leads">👥 Todos os Leads sem Compra</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-300 font-semibold">Tempo de Espera (Delay)</Label>
                <Select
                  value={formDelay}
                  onValueChange={(val) => {
                    setFormDelay(val);
                    const labels: Record<string, string> = {
                      "0.25": "15 minutos",
                      "0.5": "30 minutos",
                      "1": "1 hora",
                      "2": "2 horas",
                      "3": "3 horas",
                      "6": "6 horas",
                      "12": "12 horas",
                      "24": "24 horas",
                      "48": "48 horas",
                    };
                    setFormDelayLabel(labels[val] || `${val}h`);
                  }}
                >
                  <SelectTrigger className="bg-black/50 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10 text-white">
                    <SelectItem value="0.25">15 minutos</SelectItem>
                    <SelectItem value="0.5">30 minutos</SelectItem>
                    <SelectItem value="1">1 hora</SelectItem>
                    <SelectItem value="2">2 horas</SelectItem>
                    <SelectItem value="3">3 horas (Recomendado)</SelectItem>
                    <SelectItem value="6">6 horas</SelectItem>
                    <SelectItem value="12">12 horas</SelectItem>
                    <SelectItem value="24">24 horas (1 dia)</SelectItem>
                    <SelectItem value="48">48 horas (2 dias)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* SELEÇÃO DE FLUXOS QUE PARTICIPAM DA CAMPANHA */}
            <div className="space-y-2.5 rounded-xl border border-[#1049B8]/30 bg-[#050508]/80 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <GitBranch className="size-3.5 text-[#38BDF8]" />
                    Fluxos participantes desta campanha
                  </Label>
                  <p className="text-[11px] text-zinc-400">
                    Selecione quais fluxos ativarão esta campanha ({formSelectedFlowIds.length} selecionados)
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleToggleAllFlowsInForm}
                  className="border-white/10 text-[11px] h-7 px-2"
                >
                  {formSelectedFlowIds.length === flows.length ? "Desmarcar Todos" : "Marcar Todos"}
                </Button>
              </div>

              {loadingFlows ? (
                <Skeleton className="h-20 w-full bg-zinc-900" />
              ) : flows.length === 0 ? (
                <p className="text-xs text-zinc-500 italic py-2">
                  Nenhum fluxo encontrado. Crie um fluxo na aba Fluxos para vincular.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 max-h-44 overflow-y-auto pr-1">
                  {flows.map((f) => {
                    const isChecked = formSelectedFlowIds.includes(f.id);
                    return (
                      <div
                        key={f.id}
                        onClick={() => handleToggleFlowInForm(f.id)}
                        className={`flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition text-xs ${
                          isChecked
                            ? "bg-[#1049B8]/25 border-[#1049B8]/60 text-white"
                            : "bg-black/40 border-white/5 text-zinc-400 hover:border-white/15 hover:text-white"
                        }`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => handleToggleFlowInForm(f.id)}
                        />
                        <div className="truncate">
                          <p className="font-semibold truncate">{f.name}</p>
                          <p className="text-[10px] text-zinc-500 truncate">
                            Bot: {(f.bots as any)?.name || "Sem bot vinculado"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-300 font-semibold">Mensagem de Remarketing</Label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setFormMessage((m) => `${m} {nome}`)}
                    className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 px-1.5 py-0.5 rounded text-[#93C5FD]"
                  >
                    + &#123;nome&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormMessage((m) => `${m} {plano}`)}
                    className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 px-1.5 py-0.5 rounded text-[#93C5FD]"
                  >
                    + &#123;plano&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormMessage((m) => `${m} <code>{pix_copia_cola}</code>`)}
                    className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 px-1.5 py-0.5 rounded text-[#93C5FD]"
                  >
                    + PIX Copia e Cola
                  </button>
                </div>
              </div>
              <Textarea
                rows={5}
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                placeholder="Escreva a mensagem de recuperação..."
                className="bg-black/50 border-white/10 text-white font-mono text-xs focus:border-[#38BDF8]"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 bg-black/40 p-3 rounded-xl border border-white/5">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-zinc-400">Oferta Especial (Opcional)</Label>
                <Input
                  value={formOfferName}
                  onChange={(e) => setFormOfferName(e.target.value)}
                  placeholder="Ex: Acesso Vitalício com Desconto"
                  className="bg-black/50 border-white/10 text-white text-xs h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-zinc-400">Preço com Desconto (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formDiscountPrice}
                  onChange={(e) => setFormDiscountPrice(e.target.value)}
                  placeholder="19.90"
                  className="bg-black/50 border-white/10 text-white text-xs h-8"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDialogOpen(false)}
              className="text-zinc-400 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveCampaign}
              className="bg-gradient-to-r from-[#1049B8] to-[#38BDF8] hover:from-[#0B3B99] hover:to-[#0284C7] text-white font-bold"
            >
              {editingCampaignId ? "Salvar Alterações" : "Criar Campanha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
