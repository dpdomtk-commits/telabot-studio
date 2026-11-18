import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock,
  Send,
  GitBranch,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Plus,
  Trash2,
  Settings2,
  Layers,
  Zap,
  Image as ImageIcon,
  Video,
  RefreshCw,
  Flame,
  DollarSign,
  ListOrdered,
  Play,
  Upload,
  Loader2,
  Repeat,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendRemarketingBroadcast, triggerDownsellQueueNow } from "@/lib/telegram.functions";
import { normalizeAdvancedConfig } from "@/lib/flow-advanced";
import { uploadMedia, kindFromFile } from "@/lib/media";
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

export interface StandaloneCampaignPlan {
  id: string;
  name: string;
  price: number;
}

export interface StandaloneCampaign {
  id: string;
  name: string;
  isActive: boolean;
  target: "pix_pending" | "abandoned" | "all_leads";
  delayLabel: string;
  delayHours: number;
  recurrenceHours?: number | undefined;
  recurrenceLabel?: string | undefined;
  message: string;
  offerName?: string | undefined;
  discountPrice?: number | undefined;
  plans?: StandaloneCampaignPlan[] | undefined;
  mediaUrl?: string | undefined;
  mediaKind?: "image" | "video" | undefined;
  sentCount?: number | undefined;
  lastSentAt?: string | undefined;
  flowIds: string[];
  createdAt: string;
}

const RECURRENCE_OPTIONS: Array<{ value: string; hours: number; label: string }> = [
  { value: "0", hours: 0, label: "Sem recorrência (Apenas 1 disparo)" },
  { value: "3", hours: 3, label: "De 3 em 3 horas" },
  { value: "6", hours: 6, label: "De 6 em 6 horas" },
  { value: "9", hours: 9, label: "De 9 em 9 horas" },
  { value: "12", hours: 12, label: "De 12 em 12 horas" },
  { value: "15", hours: 15, label: "De 15 em 15 horas" },
  { value: "18", hours: 18, label: "De 18 em 18 horas" },
  { value: "21", hours: 21, label: "De 21 em 21 horas" },
  { value: "24", hours: 24, label: "De 24 em 24 horas (Diário)" },
];

const SHARKBOT_PRESETS: Array<{
  badge: string;
  name: string;
  target: "pix_pending" | "abandoned" | "all_leads";
  delayHours: number;
  delayLabel: string;
  message: string;
  offerName?: string;
  discountPrice?: number;
}> = [
  {
    badge: "+5 min · Lembrete PIX",
    name: "Shark 5min — Reenvio Direto PIX Copia e Cola",
    target: "pix_pending",
    delayHours: 0.08,
    delayLabel: "5 minutos",
    message:
      "⚡ Ei {nome}! Seu PIX para o <b>{plano}</b> ainda está aguardando confirmação.\n\nCopie o código abaixo no app do seu banco para liberar seu acesso automaticamente:\n\n<code>{pix_copia_cola}</code>",
    offerName: "Liberar Acesso Agora",
  },
  {
    badge: "+15 min · Downsell -20%",
    name: "Shark 15min — Downsell Relâmpago (-20% OFF)",
    target: "pix_pending",
    delayHours: 0.25,
    delayLabel: "15 minutos",
    message:
      "🔥 <b>CONDIÇÃO RELÂMPAGO PARA VOCÊ, {nome}!</b>\n\nLiberamos um desconto exclusivo de <b>20% OFF</b> apenas pelos próximos 15 minutos para finalizar o <b>{plano}</b>.\n\nToque no botão abaixo para gerar o PIX já com desconto:",
    offerName: "Garantir VIP -20% OFF",
    discountPrice: 19.9,
  },
  {
    badge: "+1h · Última Chamada -40%",
    name: "Shark 1h — Última Chamada Abandono (-40%)",
    target: "abandoned",
    delayHours: 1,
    delayLabel: "1 hora",
    message:
      "⏳ <b>ÚLTIMA CHAMADA, {nome}!</b>\n\nVi que você iniciou o atendimento e não garantiu sua vaga. Restam pouquíssimos acessos hoje — toque abaixo e pague menos agora:",
    offerName: "Acesso VIP -40% OFF",
    discountPrice: 14.9,
  },
  {
    badge: "+24h · Reengajamento VIP",
    name: "Shark 24h — Reengajamento + Bônus Exclusivo",
    target: "all_leads",
    delayHours: 24,
    delayLabel: "24 horas",
    message:
      "🎁 <b>Presente especial para você voltar hoje, {nome}!</b>\n\nAtivamos novamente sua oferta com prioridade + bônus exclusivos para liberação imediata.",
    offerName: "Resgatar Oferta VIP",
    discountPrice: 24.9,
  },
];

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
  const [formRecurrenceHours, setFormRecurrenceHours] = useState("3");
  const [formRecurrenceLabel, setFormRecurrenceLabel] = useState("De 3 em 3 horas");
  const [formMessage, setFormMessage] = useState("");
  const [formOfferName, setFormOfferName] = useState("");
  const [formDiscountPrice, setFormDiscountPrice] = useState("");
  const [formPlans, setFormPlans] = useState<StandaloneCampaignPlan[]>([]);
  const [formMediaUrl, setFormMediaUrl] = useState("");
  const [formMediaKind, setFormMediaKind] = useState<"image" | "video">("image");
  const [formSelectedFlowIds, setFormSelectedFlowIds] = useState<string[]>([]);
  const [uploadingFormMedia, setUploadingFormMedia] = useState(false);
  const formMediaInputRef = useRef<HTMLInputElement>(null);

  // Broadcast state
  const [broadcastTarget, setBroadcastTarget] = useState<"pix_pending" | "abandoned" | "all_leads">("pix_pending");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastMediaUrl, setBroadcastMediaUrl] = useState("");
  const [broadcastMediaKind, setBroadcastMediaKind] = useState<"image" | "video">("image");
  const [broadcastOfferName, setBroadcastOfferName] = useState("");
  const [broadcastDiscountPrice, setBroadcastDiscountPrice] = useState("");
  const [broadcastPlans, setBroadcastPlans] = useState<StandaloneCampaignPlan[]>([]);
  const [broadcastFlowIds, setBroadcastFlowIds] = useState<string[]>([]);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [uploadingBroadcastMedia, setUploadingBroadcastMedia] = useState(false);
  const broadcastMediaInputRef = useRef<HTMLInputElement>(null);
  const [dispatchingCampaignId, setDispatchingCampaignId] = useState<string | null>(null);

  // Salva no localStorage sempre que campaigns atualizar
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(campaigns));
    } catch {}
  }, [campaigns]);

  // Busca fluxos do usuário (usando coluna real telegram_username + fallback sem join)
  const { data: flows = [], isLoading: loadingFlows } = useQuery({
    queryKey: ["remarketing-flows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flows")
        .select("id,name,bot_id,status,mode,simple_config,updated_at,bots(name,telegram_username)")
        .neq("status", "archived")
        .order("name", { ascending: true });
      if (!error && data) return data;

      const fallback = await supabase
        .from("flows")
        .select("id,name,bot_id,status,mode,simple_config,updated_at")
        .order("name", { ascending: true });
      if (fallback.error) throw fallback.error;
      return (fallback.data ?? []).map((f) => ({ ...f, bots: null }));
    },
  });

  // Extrai planos configurados dos fluxos selecionados (para importar com 1 clique)
  const extractFlowPlans = (selectedIds: string[]) => {
    const scopeFlows =
      selectedIds.length > 0 ? flows.filter((f) => selectedIds.includes(f.id)) : flows;
    const list: Array<{ id: string; name: string; price: number; duration: string; flowName: string }> = [];
    for (const f of scopeFlows) {
      if (!f.simple_config) continue;
      try {
        const cfg = normalizeAdvancedConfig(f.simple_config as Record<string, unknown>);
        for (const p of cfg.plans?.items ?? []) {
          list.push({
            id: `${f.id}-${p.id}`,
            name: p.name,
            price: Number(p.price) || 0,
            duration: p.duration || "Acesso",
            flowName: f.name,
          });
        }
      } catch {}
    }
    return list;
  };

  const availableDialogPlans = useMemo(
    () => extractFlowPlans(formSelectedFlowIds),
    [flows, formSelectedFlowIds],
  );
  const availableBroadcastPlans = useMemo(
    () => extractFlowPlans(broadcastFlowIds),
    [flows, broadcastFlowIds],
  );

  // Métricas reais do funil (Leads /start, PIX pendentes/pagos e Fila de Downsell)
  const { data: liveStats, isFetching: loadingStats } = useQuery({
    queryKey: ["remarketing-live-stats"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const [leadsRes, paymentsRes, logsRes] = await Promise.all([
        supabase
          .from("leads")
          .select("id,status,bot_id,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("payments")
          .select("id,status,amount_cents,lead_id,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("activity_logs")
          .select("id,action,metadata,created_at")
          .eq("entity", "scheduled_downsell")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      return {
        leads: leadsRes.data ?? [],
        payments: paymentsRes.data ?? [],
        downsellLogs: logsRes.data ?? [],
      };
    },
  });

  const processQueueMutation = useMutation({
    mutationFn: () => triggerDownsellQueueNow(),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["remarketing-live-stats"] });
      toast.success(
        `Fila processada: ${res.sent} enviado(s), ${res.cancelled} cancelado(s), ${res.processed} verificado(s).`,
      );
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao processar fila"),
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

  async function handlePcMediaUpload(
    file: File | undefined,
    target: "form" | "broadcast",
  ) {
    if (!file) return;
    const rawKind = kindFromFile(file);
    const resolvedKind: "image" | "video" = rawKind === "video" ? "video" : "image";
    if (target === "form") setUploadingFormMedia(true);
    else setUploadingBroadcastMedia(true);

    try {
      const asset = await uploadMedia(file, resolvedKind);
      if (target === "form") {
        setFormMediaUrl(asset.telegram_file_id);
        setFormMediaKind(resolvedKind);
      } else {
        setBroadcastMediaUrl(asset.telegram_file_id);
        setBroadcastMediaKind(resolvedKind);
      }
      toast.success("Mídia carregada do computador com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar mídia do computador");
    } finally {
      if (target === "form") {
        setUploadingFormMedia(false);
        if (formMediaInputRef.current) formMediaInputRef.current.value = "";
      } else {
        setUploadingBroadcastMedia(false);
        if (broadcastMediaInputRef.current) broadcastMediaInputRef.current.value = "";
      }
    }
  }

  function handleOpenCreateDialog() {
    setEditingCampaignId(null);
    setFormName("");
    setFormTarget("pix_pending");
    setFormDelay("0.25");
    setFormDelayLabel("15 minutos");
    setFormRecurrenceHours("3");
    setFormRecurrenceLabel("De 3 em 3 horas");
    setFormMessage(
      "Oi {nome}! Notamos que seu código PIX para o {plano} ainda está pendente. Seu acesso está reservado aguardando você:\n\n<code>{pix_copia_cola}</code>",
    );
    setFormOfferName("");
    setFormDiscountPrice("");
    setFormPlans([]);
    setFormMediaUrl("");
    setFormMediaKind("image");
    setFormSelectedFlowIds(flows.map((f) => f.id));
    setIsDialogOpen(true);
  }

  function handleOpenEditDialog(c: StandaloneCampaign) {
    setEditingCampaignId(c.id);
    setFormName(c.name);
    setFormTarget(c.target);
    setFormDelay(String(c.delayHours));
    setFormDelayLabel(c.delayLabel);
    const recHours = c.recurrenceHours ?? 3;
    const recOpt = RECURRENCE_OPTIONS.find((r) => r.hours === recHours);
    setFormRecurrenceHours(String(recHours));
    setFormRecurrenceLabel(c.recurrenceLabel || recOpt?.label || `De ${recHours} em ${recHours} horas`);
    setFormMessage(c.message);
    setFormOfferName(c.offerName || "");
    setFormDiscountPrice(c.discountPrice ? String(c.discountPrice) : "");
    setFormPlans(
      c.plans && c.plans.length > 0
        ? c.plans
        : c.offerName && c.discountPrice
        ? [{ id: `legacy-${c.id}`, name: c.offerName, price: c.discountPrice }]
        : [],
    );
    setFormMediaUrl(c.mediaUrl || "");
    setFormMediaKind(c.mediaKind || "image");
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
    if (flows.length > 0 && formSelectedFlowIds.length === 0) {
      return toast.error("Selecione pelo menos um fluxo para vincular à campanha");
    }

    const offer = formOfferName.trim();
    const parsedDiscount = formDiscountPrice ? Number(formDiscountPrice) : 0;
    const cleanedPlans = formPlans.filter((p) => p.name.trim().length > 0);
    const media = formMediaUrl.trim();
    const recHours = Number(formRecurrenceHours) || 0;
    const recOpt = RECURRENCE_OPTIONS.find((r) => r.value === formRecurrenceHours);
    const recLabel = recOpt?.label ?? (recHours > 0 ? `De ${recHours} em ${recHours} horas` : "Disparo único");

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
                recurrenceHours: recHours,
                recurrenceLabel: recLabel,
                message: formMessage.trim(),
                offerName: offer || undefined,
                discountPrice: parsedDiscount > 0 ? parsedDiscount : undefined,
                plans: cleanedPlans.length > 0 ? cleanedPlans : undefined,
                mediaUrl: media || undefined,
                mediaKind: media ? formMediaKind : undefined,
                flowIds: formSelectedFlowIds,
              }
            : c,
        ),
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
        recurrenceHours: recHours,
        recurrenceLabel: recLabel,
        message: formMessage.trim(),
        ...(offer ? { offerName: offer } : {}),
        ...(parsedDiscount > 0 ? { discountPrice: parsedDiscount } : {}),
        ...(cleanedPlans.length > 0 ? { plans: cleanedPlans } : {}),
        ...(media ? { mediaUrl: media, mediaKind: formMediaKind } : {}),
        flowIds: formSelectedFlowIds,
        createdAt: new Date().toISOString(),
      };
      setCampaigns((prev) => [newCamp, ...prev]);
      toast.success("Nova campanha criada e vinculada aos fluxos selecionados!");
    }

    setIsDialogOpen(false);
  }

  function handleAddPreset(preset: (typeof SHARKBOT_PRESETS)[number]) {
    const newCamp: StandaloneCampaign = {
      id: `camp-shark-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: preset.name,
      isActive: true,
      target: preset.target,
      delayHours: preset.delayHours,
      delayLabel: preset.delayLabel,
      recurrenceHours: 3,
      recurrenceLabel: "De 3 em 3 horas",
      message: preset.message,
      ...(preset.offerName ? { offerName: preset.offerName } : {}),
      ...(preset.discountPrice ? { discountPrice: preset.discountPrice } : {}),
      flowIds: flows.map((f) => f.id),
      createdAt: new Date().toISOString(),
    };
    setCampaigns((prev) => [newCamp, ...prev]);
    toast.success(`Etapa "${preset.badge}" adicionada e vinculada a ${flows.length} fluxo(s)!`);
  }

  async function handleDispatchCampaignNow(c: StandaloneCampaign) {
    setDispatchingCampaignId(c.id);
    try {
      const validPlans = (c.plans ?? []).filter((p) => p.name.trim().length > 0);
      const res = await sendRemarketingBroadcast({
        data: {
          target: c.target,
          flowIds: c.flowIds,
          message: c.message,
          ...(c.mediaUrl ? { mediaUrl: c.mediaUrl, mediaKind: c.mediaKind ?? "image" } : {}),
          ...(c.offerName ? { offerName: c.offerName } : {}),
          ...(c.discountPrice && c.discountPrice > 0 ? { discountPrice: c.discountPrice } : {}),
          ...(validPlans.length > 0 ? { plans: validPlans } : {}),
        },
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      if (res.sent > 0) {
        setCampaigns((prev) =>
          prev.map((item) =>
            item.id === c.id
              ? {
                  ...item,
                  sentCount: (item.sentCount ?? 0) + res.sent,
                  lastSentAt: new Date().toISOString(),
                }
              : item,
          ),
        );
        toast.success(res.message);
      } else {
        toast.info(res.message);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao disparar campanha no Telegram");
    } finally {
      setDispatchingCampaignId(null);
    }
  }

  function handleToggleCampaignActive(id: string, active: boolean) {
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, isActive: active } : c)));
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
      prev.includes(flowId) ? prev.filter((id) => id !== flowId) : [...prev, flowId],
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
      const parsedDiscount = broadcastDiscountPrice ? Number(broadcastDiscountPrice) : 0;
      const media = broadcastMediaUrl.trim();
      const offer = broadcastOfferName.trim();
      const validBroadcastPlans = broadcastPlans.filter((p) => p.name.trim().length > 0);

      const res = await sendRemarketingBroadcast({
        data: {
          target: broadcastTarget,
          flowIds: broadcastFlowIds,
          message: broadcastMessage.trim(),
          ...(media ? { mediaUrl: media, mediaKind: broadcastMediaKind } : {}),
          ...(offer ? { offerName: offer } : {}),
          ...(parsedDiscount > 0 ? { discountPrice: parsedDiscount } : {}),
          ...(validBroadcastPlans.length > 0 ? { plans: validBroadcastPlans } : {}),
        },
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      if (res.sent > 0) {
        toast.success(res.message);
        setBroadcastMessage("");
      } else {
        toast.info(res.message);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro no envio em massa");
    } finally {
      setSendingBroadcast(false);
    }
  }

  const activeCount = campaigns.filter((c) => c.isActive).length;
  const allLeads = liveStats?.leads ?? [];
  const allPayments = liveStats?.payments ?? [];
  const downsellLogs = liveStats?.downsellLogs ?? [];
  const paidPayments = allPayments.filter((p) => p.status === "approved");
  const paidLeadIds = new Set(paidPayments.map((p) => p.lead_id).filter(Boolean));
  const pendingRecoveryPix = allPayments.filter(
    (p) => p.status === "pending" && (!p.lead_id || !paidLeadIds.has(p.lead_id)),
  );
  const pendingRecoveryCents = pendingRecoveryPix.reduce((s, p) => s + (p.amount_cents || 0), 0);
  const conversionRate = allPayments.length > 0 ? (paidPayments.length / allPayments.length) * 100 : 0;
  const pendingQueueCount = downsellLogs.filter((d) => d.action === "pending").length;
  const sentQueueCount = downsellLogs.filter((d) => d.action === "sent").length;
  const formatCurrencyBRL = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

      {/* Métricas Gerais do Funil & Resgate */}
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
              Leads & PIX Pendentes
            </CardTitle>
            <DollarSign className="size-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-amber-400">
              {pendingRecoveryPix.length}{" "}
              <span className="text-sm font-semibold text-zinc-400">/ {allLeads.length} leads</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {formatCurrencyBRL(pendingRecoveryCents)} aguardando resgate
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#09090E]/90 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Taxa de Conversão & Resgate
            </CardTitle>
            <TrendingUp className="size-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-400">{conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-zinc-500 mt-1">
              {paidPayments.length} pago(s) de {allPayments.length} PIX gerado(s)
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#09090E]/90 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Fila de Downsell Automático
            </CardTitle>
            <Zap className="size-4 text-[#38BDF8]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-white">{pendingQueueCount} na fila</div>
            <p className="text-xs text-zinc-500 mt-1">
              {sentQueueCount} downsell(s) enviado(s) recentemente
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="campaigns" className="space-y-6">
        <TabsList className="bg-zinc-900 border border-white/5 flex-wrap h-auto gap-1">
          <TabsTrigger
            value="campaigns"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#1049B8]/30 data-[state=active]:to-[#38BDF8]/30 data-[state=active]:text-[#60A5FA] data-[state=active]:border data-[state=active]:border-[#1049B8]/50"
          >
            <Layers className="size-3.5 mr-2" />
            Campanhas & Escada ({campaigns.length})
          </TabsTrigger>
          <TabsTrigger
            value="broadcast"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#1049B8]/30 data-[state=active]:to-[#38BDF8]/30 data-[state=active]:text-[#60A5FA] data-[state=active]:border data-[state=active]:border-[#1049B8]/50"
          >
            <Send className="size-3.5 mr-2" />
            Disparo Imediato em Massa
          </TabsTrigger>
          <TabsTrigger
            value="queue"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#1049B8]/30 data-[state=active]:to-[#38BDF8]/30 data-[state=active]:text-[#60A5FA] data-[state=active]:border data-[state=active]:border-[#1049B8]/50"
          >
            <ListOrdered className="size-3.5 mr-2" />
            Fila de Downsell em Tempo Real ({pendingQueueCount})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: LISTAGEM DE CAMPANHAS + ESCADA DE RECUPERAÇÃO 1-CLIQUE */}
        <TabsContent value="campaigns" className="space-y-4">
          <div className="rounded-2xl border border-[#1049B8]/30 bg-[#09090E]/90 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Flame className="size-4 text-amber-400" />
                  Escada de Recuperação Automática (Templates 1-Clique)
                </h3>
                <p className="text-xs text-zinc-400">
                  Adicione etapas prontas de recuperação progressiva vinculadas aos seus fluxos em segundos.
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {SHARKBOT_PRESETS.map((preset) => (
                <Button
                  key={preset.badge}
                  type="button"
                  variant="outline"
                  onClick={() => handleAddPreset(preset)}
                  className="justify-start h-auto py-2.5 px-3 border-white/10 bg-black/50 hover:border-[#38BDF8]/60 hover:bg-[#1049B8]/20 text-left flex flex-col items-start gap-0.5"
                >
                  <span className="text-xs font-bold text-[#60A5FA]">{preset.badge}</span>
                  <span className="text-[11px] text-zinc-400 truncate w-full">
                    {preset.discountPrice
                      ? `Botão PIX R$ ${preset.discountPrice.toFixed(2)}`
                      : "Reenvio do Copia e Cola"}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          {campaigns.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#09090E]/80 p-12 text-center space-y-4">
              <div className="size-12 rounded-xl bg-[#1049B8]/20 border border-[#1049B8]/40 flex items-center justify-center text-[#60A5FA] mx-auto">
                <Clock className="size-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Nenhuma campanha de remarketing criada ainda</h3>
              <p className="text-sm text-zinc-400 max-w-md mx-auto">
                Crie sua primeira campanha ou use um dos templates 1-clique acima para recuperar leads que geraram PIX ou abandonaram seus fluxos.
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
                const isDispatching = dispatchingCampaignId === c.id;

                return (
                  <div
                    key={c.id}
                    className="rounded-2xl border border-white/10 bg-[#09090E]/90 p-5 shadow-xl hover:border-[#1049B8]/40 transition space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center flex-wrap gap-2.5">
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
                          {c.sentCount ? (
                            <Badge variant="outline" className="border-[#38BDF8]/30 text-[#60A5FA] text-xs">
                              {c.sentCount} disparo(s)
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                          <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 border border-white/10">
                            {targetLabel}
                          </span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 border border-white/10">
                            <Clock className="size-3 text-[#60A5FA]" /> Disparo em {c.delayLabel}
                          </span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 rounded bg-[#1049B8]/15 px-2 py-0.5 border border-[#1049B8]/30 text-[#93C5FD]">
                            <Repeat className="size-3" /> {c.recurrenceLabel || "De 3 em 3 horas"}
                          </span>
                          {c.plans && c.plans.length > 0 ? (
                            <>
                              <span>•</span>
                              <span className="text-emerald-400 font-semibold">
                                {c.plans.length} plano(s) no botão
                              </span>
                            </>
                          ) : null}
                          {c.mediaUrl ? (
                            <>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1 text-[#93C5FD]">
                                {c.mediaKind === "video" ? <Video className="size-3" /> : <ImageIcon className="size-3" />}
                                Com mídia
                              </span>
                            </>
                          ) : null}
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

                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="flex items-center gap-2 mr-1">
                          <span className="text-xs text-zinc-400">Ativa</span>
                          <Switch
                            checked={c.isActive}
                            onCheckedChange={(checked) => handleToggleCampaignActive(c.id, checked)}
                          />
                        </div>
                        <Button
                          size="sm"
                          disabled={isDispatching}
                          onClick={() => void handleDispatchCampaignNow(c)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                        >
                          <Play className="size-3 mr-1" />
                          {isDispatching ? "Disparando..." : "Disparar Agora"}
                        </Button>
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
                <Select
                  value={broadcastTarget}
                  onValueChange={(val: "pix_pending" | "abandoned" | "all_leads") =>
                    setBroadcastTarget(val)
                  }
                >
                  <SelectTrigger className="bg-black/50 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10 text-white">
                    <SelectItem value="pix_pending">PIX Gerado Pendente (Para Resgate)</SelectItem>
                    <SelectItem value="abandoned">Leads que Não Compraram (Abandono)</SelectItem>
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
                placeholder="Olá {nome}! Notamos que seu pedido está pendente. Aproveite esta condição relâmpago!"
                className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-[#38BDF8]"
              />
              <p className="text-[11px] text-zinc-500">
                Variáveis aceitas: <code>&#123;nome&#125;</code>, <code>&#123;plano&#125;</code>, <code>&#123;pix_copia_cola&#125;</code>
              </p>
            </div>

            {/* Mídia Direta do PC / URL e Planos do Fluxo ou Novos */}
            <div className="space-y-4 bg-black/40 p-4 rounded-xl border border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs font-semibold text-zinc-200">
                  Mídia da Campanha (Subir do PC ou URL — Opcional)
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={broadcastMediaInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => void handlePcMediaUpload(e.target.files?.[0], "broadcast")}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploadingBroadcastMedia}
                    onClick={() => broadcastMediaInputRef.current?.click()}
                    className="h-8 text-xs border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                  >
                    {uploadingBroadcastMedia ? (
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Upload className="size-3.5 mr-1.5" />
                    )}
                    {uploadingBroadcastMedia ? "Enviando do PC..." : "Subir Foto/Vídeo do PC"}
                  </Button>
                  {broadcastMediaUrl && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setBroadcastMediaUrl("")}
                      className="h-8 text-xs text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="size-3.5 mr-1" /> Remover
                    </Button>
                  )}
                </div>
              </div>

              {broadcastMediaUrl && (
                <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/50 p-2">
                  {broadcastMediaKind === "video" ? (
                    <video src={broadcastMediaUrl} className="size-14 rounded object-cover bg-black" />
                  ) : (
                    <img src={broadcastMediaUrl} alt="Prévia" className="size-14 rounded object-cover bg-black" />
                  )}
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-semibold text-emerald-400">
                      Mídia anexada ({broadcastMediaKind === "video" ? "Vídeo" : "Imagem"})
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {broadcastMediaUrl.startsWith("data:") ? "Arquivo carregado do computador" : broadcastMediaUrl}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">URL / file_id manual (opcional)</Label>
                  <Input
                    value={broadcastMediaUrl.startsWith("data:") ? "" : broadcastMediaUrl}
                    onChange={(e) => setBroadcastMediaUrl(e.target.value)}
                    placeholder="https://... ou file_id do Telegram"
                    className="bg-black/50 border-white/10 text-white text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Tipo da Mídia</Label>
                  <Select
                    value={broadcastMediaKind}
                    onValueChange={(val: "image" | "video") => setBroadcastMediaKind(val)}
                  >
                    <SelectTrigger className="bg-black/50 border-white/10 text-white h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-white/10 text-white">
                      <SelectItem value="image">Imagem / Foto</SelectItem>
                      <SelectItem value="video">Vídeo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Planos do Fluxo Selecionado ou Novos Planos */}
            <div className="space-y-3 bg-black/40 p-4 rounded-xl border border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label className="text-xs font-semibold text-zinc-200">
                    Planos & Ofertas do Disparo (do Fluxo ou Novos)
                  </Label>
                  <p className="text-[11px] text-zinc-400">
                    Escolha planos já existentes dos fluxos marcados ou crie ofertas novas para aparecerem como botões no Telegram.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setBroadcastPlans((prev) => [
                      ...prev,
                      { id: `bplan-${Date.now()}`, name: "Oferta VIP Especial", price: 19.9 },
                    ])
                  }
                  className="h-8 text-xs border-white/15"
                >
                  <Plus className="size-3.5 mr-1" /> Criar Novo Plano
                </Button>
              </div>

              {availableBroadcastPlans.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-zinc-400">Importar plano do fluxo com 1 clique:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableBroadcastPlans.map((fp) => (
                      <button
                        key={fp.id}
                        type="button"
                        onClick={() =>
                          setBroadcastPlans((prev) => [
                            ...prev,
                            { id: `bp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name: fp.name, price: fp.price },
                          ])
                        }
                        className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-200 hover:bg-cyan-500/20 transition"
                      >
                        + {fp.name} — R$ {fp.price.toFixed(2).replace(".", ",")} ({fp.flowName})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {broadcastPlans.length > 0 && (
                <div className="space-y-2 pt-1">
                  {broadcastPlans.map((bp) => (
                    <div key={bp.id} className="grid gap-2 sm:grid-cols-[1fr_130px_36px] items-center">
                      <Input
                        value={bp.name}
                        onChange={(e) =>
                          setBroadcastPlans((prev) =>
                            prev.map((x) => (x.id === bp.id ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        placeholder="Nome do botão/plano"
                        className="h-8 text-xs bg-black/50 border-white/10 text-white"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="1"
                        value={bp.price}
                        onChange={(e) =>
                          setBroadcastPlans((prev) =>
                            prev.map((x) => (x.id === bp.id ? { ...x, price: Number(e.target.value) } : x)),
                          )
                        }
                        className="h-8 text-xs bg-black/50 border-white/10 text-white"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setBroadcastPlans((prev) => prev.filter((x) => x.id !== bp.id))}
                        className="size-8 text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {broadcastPlans.length === 0 && (
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Ou botão único promocional (Opcional)</Label>
                    <Input
                      value={broadcastOfferName}
                      onChange={(e) => setBroadcastOfferName(e.target.value)}
                      placeholder="Ex: Acesso VIP com 30% OFF"
                      className="bg-black/50 border-white/10 text-white text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Valor do PIX Promocional (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={broadcastDiscountPrice}
                      onChange={(e) => setBroadcastDiscountPrice(e.target.value)}
                      placeholder="19.90"
                      className="bg-black/50 border-white/10 text-white text-xs h-9"
                    />
                  </div>
                </div>
              )}
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

        {/* TAB 3: FILA DE DOWNSELL EM TEMPO REAL */}
        <TabsContent value="queue" className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#09090E]/90 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white text-base flex items-center gap-2">
                  <ListOrdered className="size-4 text-[#38BDF8]" />
                  Fila de Downsells Agendados em Tempo Real
                </h3>
                <p className="text-xs text-zinc-400">
                  Acompanhe os disparos automáticos agendados por /start e geração de PIX no webhook do Telegram.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={processQueueMutation.isPending}
                onClick={() => processQueueMutation.mutate()}
                className="bg-gradient-to-r from-[#1049B8] to-[#38BDF8] hover:from-[#0B3B99] hover:to-[#0284C7] text-white font-bold text-xs"
              >
                <RefreshCw className={`size-3.5 mr-1.5 ${processQueueMutation.isPending ? "animate-spin" : ""}`} />
                {processQueueMutation.isPending ? "Processando..." : "Processar Fila Agora"}
              </Button>
            </div>

            {loadingStats ? (
              <Skeleton className="h-32 w-full bg-zinc-900" />
            ) : downsellLogs.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-black/40 p-8 text-center text-xs text-zinc-400">
                Nenhum downsell agendado na fila ainda. Assim que um lead acionar /start ou gerar um PIX, os agendamentos aparecem aqui.
              </div>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {downsellLogs.map((item) => {
                  const meta = (item.metadata ?? {}) as Record<string, unknown>;
                  const seqTitle = String(meta["sequence_title"] ?? "Sequência de Downsell");
                  const triggerType = meta["trigger_type"] === "pix_created" ? "PIX Gerado" : "Entrada (/start)";
                  const chatIdLabel = String(meta["chat_id"] ?? "—");
                  const scheduledForRaw = typeof meta["scheduled_for"] === "string" ? meta["scheduled_for"] : item.created_at;
                  const errorMsg = typeof meta["error"] === "string" ? meta["error"] : null;
                  const statusColor =
                    item.action === "sent"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : item.action === "pending"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : item.action === "cancelled"
                      ? "border-zinc-700 bg-zinc-800/60 text-zinc-400"
                      : "border-red-500/30 bg-red-500/10 text-red-400";

                  return (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/45 p-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white truncate">{seqTitle}</span>
                          <Badge variant="outline" className={`text-[10px] ${statusColor}`}>
                            {item.action}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] border-white/10 text-zinc-300">
                            {triggerType}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          Chat ID: <span className="font-mono text-zinc-300">{chatIdLabel}</span> · Agendado para:{" "}
                          <span className="text-zinc-300">
                            {new Date(scheduledForRaw).toLocaleString("pt-BR")}
                          </span>
                        </p>
                        {errorMsg ? <p className="text-[11px] text-red-400">{errorMsg}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                <Label className="text-xs text-zinc-300 font-semibold">Tempo de Espera (Delay Inicial)</Label>
                <Select
                  value={formDelay}
                  onValueChange={(val) => {
                    setFormDelay(val);
                    const labels: Record<string, string> = {
                      "0.08": "5 minutos",
                      "0.25": "15 minutos",
                      "0.5": "30 minutos",
                      "1": "1 hora",
                      "2": "2 horas",
                      "3": "3 horas",
                      "6": "6 horas",
                      "9": "9 horas",
                      "12": "12 horas",
                      "15": "15 horas",
                      "18": "18 horas",
                      "21": "21 horas",
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
                    <SelectItem value="0.08">5 minutos (Lembrete rápido)</SelectItem>
                    <SelectItem value="0.25">15 minutos</SelectItem>
                    <SelectItem value="0.5">30 minutos</SelectItem>
                    <SelectItem value="1">1 hora</SelectItem>
                    <SelectItem value="2">2 horas</SelectItem>
                    <SelectItem value="3">3 horas</SelectItem>
                    <SelectItem value="6">6 horas</SelectItem>
                    <SelectItem value="9">9 horas</SelectItem>
                    <SelectItem value="12">12 horas</SelectItem>
                    <SelectItem value="15">15 horas</SelectItem>
                    <SelectItem value="18">18 horas</SelectItem>
                    <SelectItem value="21">21 horas</SelectItem>
                    <SelectItem value="24">24 horas (1 dia)</SelectItem>
                    <SelectItem value="48">48 horas (2 dias)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* RECORRÊNCIA DO REMARKETING (DE 3 EM 3H ATÉ 24 EM 24H) */}
            <div className="space-y-2 rounded-xl border border-cyan-500/25 bg-cyan-950/10 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs text-cyan-200 font-semibold flex items-center gap-1.5">
                  <Repeat className="size-3.5 text-cyan-400" />
                  Recorrência do Remarketing (3 em 3h até 24 em 24h)
                </Label>
                <span className="text-[11px] text-zinc-400">
                  Repetição automática para quem ainda não pagou
                </span>
              </div>
              <Select
                value={formRecurrenceHours}
                onValueChange={(val) => {
                  setFormRecurrenceHours(val);
                  const found = RECURRENCE_OPTIONS.find((r) => r.value === val);
                  setFormRecurrenceLabel(found?.label || `De ${val} em ${val} horas`);
                }}
              >
                <SelectTrigger className="bg-black/50 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                  {RECURRENCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            {/* PLANOS & OFERTAS (SELECIONAR DO FLUXO OU CRIAR NOVOS) */}
            <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label className="text-xs text-zinc-200 font-semibold">
                    Planos & Botões de Compra (do Fluxo ou Novos)
                  </Label>
                  <p className="text-[11px] text-zinc-400">
                    Adicione planos dos fluxos selecionados ou crie planos novos com valor promocional.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setFormPlans((prev) => [
                      ...prev,
                      { id: `fplan-${Date.now()}`, name: "Oferta VIP Desconto", price: 19.9 },
                    ])
                  }
                  className="h-7 text-[11px] border-white/15"
                >
                  <Plus className="size-3 mr-1" /> Criar Novo Plano
                </Button>
              </div>

              {availableDialogPlans.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {availableDialogPlans.map((fp) => (
                    <button
                      key={fp.id}
                      type="button"
                      onClick={() =>
                        setFormPlans((prev) => [
                          ...prev,
                          {
                            id: `fp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                            name: fp.name,
                            price: fp.price,
                          },
                        ])
                      }
                      className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-500/20 transition"
                    >
                      + {fp.name} (R$ {fp.price.toFixed(2).replace(".", ",")}) · {fp.flowName}
                    </button>
                  ))}
                </div>
              )}

              {formPlans.length > 0 && (
                <div className="space-y-2">
                  {formPlans.map((fp) => (
                    <div key={fp.id} className="grid gap-2 sm:grid-cols-[1fr_115px_32px] items-center">
                      <Input
                        value={fp.name}
                        onChange={(e) =>
                          setFormPlans((prev) =>
                            prev.map((x) => (x.id === fp.id ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        placeholder="Nome do plano no botão"
                        className="h-8 text-xs bg-black/50 border-white/10 text-white"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="1"
                        value={fp.price}
                        onChange={(e) =>
                          setFormPlans((prev) =>
                            prev.map((x) => (x.id === fp.id ? { ...x, price: Number(e.target.value) } : x)),
                          )
                        }
                        className="h-8 text-xs bg-black/50 border-white/10 text-white"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setFormPlans((prev) => prev.filter((x) => x.id !== fp.id))}
                        className="size-8 text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {formPlans.length === 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-400">Oferta Especial Única (Opcional)</Label>
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
              )}
            </div>

            {/* MÍDIA DIRETA DO PC OU URL */}
            <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs text-zinc-200 font-semibold">
                  Mídia do Remarketing (Subir do PC ou URL — Opcional)
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={formMediaInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => void handlePcMediaUpload(e.target.files?.[0], "form")}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploadingFormMedia}
                    onClick={() => formMediaInputRef.current?.click()}
                    className="h-7 text-[11px] border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                  >
                    {uploadingFormMedia ? (
                      <Loader2 className="size-3 animate-spin mr-1" />
                    ) : (
                      <Upload className="size-3 mr-1" />
                    )}
                    {uploadingFormMedia ? "Carregando..." : "Subir do PC"}
                  </Button>
                  {formMediaUrl && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setFormMediaUrl("")}
                      className="h-7 text-[11px] text-red-400"
                    >
                      Remover
                    </Button>
                  )}
                </div>
              </div>

              {formMediaUrl && (
                <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-black/50 p-2">
                  {formMediaKind === "video" ? (
                    <video src={formMediaUrl} className="size-12 rounded object-cover bg-black" />
                  ) : (
                    <img src={formMediaUrl} alt="Prévia" className="size-12 rounded object-cover bg-black" />
                  )}
                  <div className="min-w-0 flex-1 text-[11px]">
                    <p className="font-semibold text-emerald-400">
                      Mídia pronta ({formMediaKind === "video" ? "Vídeo" : "Imagem"})
                    </p>
                    <p className="text-zinc-400 truncate">
                      {formMediaUrl.startsWith("data:") ? "Arquivo selecionado do PC" : formMediaUrl}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-zinc-400">URL / file_id manual (Opcional)</Label>
                  <Input
                    value={formMediaUrl.startsWith("data:") ? "" : formMediaUrl}
                    onChange={(e) => setFormMediaUrl(e.target.value)}
                    placeholder="https://... ou file_id"
                    className="bg-black/50 border-white/10 text-white text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-zinc-400">Tipo da Mídia</Label>
                  <Select
                    value={formMediaKind}
                    onValueChange={(val: "image" | "video") => setFormMediaKind(val)}
                  >
                    <SelectTrigger className="bg-black/50 border-white/10 text-white text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-white/10 text-white">
                      <SelectItem value="image">Imagem / Foto</SelectItem>
                      <SelectItem value="video">Vídeo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
