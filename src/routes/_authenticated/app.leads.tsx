import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBots } from "./app.bots";
import {
  getLeadChatContext,
  sendLeadGuidedMessage,
  type LeadChatFlowPlan,
  type LeadChatMessageRow,
  type LeadChatPaymentRow,
} from "@/lib/telegram.functions";
import {
  Download,
  ExternalLink,
  Search,
  Users,
  Trophy,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Sparkles,
  MessageSquare,
  Send,
  Bot,
  Loader2,
  Image as ImageIcon,
  Video,
  Zap,
  Tag,
  ListOrdered,
  CreditCard,
  Flame,
  Upload,
} from "lucide-react";
import { uploadMedia, kindFromFile } from "@/lib/media";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatBRL, formatDate } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/leads")({
  head: () => ({
    meta: [
      { title: "Leads | CASH BOT" },
      { name: "description", content: "Todos os contatos capturados pelos seus bots do Telegram." },
      { property: "og:title", content: "Leads | CASH BOT" },
      { property: "og:description", content: "Todos os contatos capturados pelos seus bots." },
    ],
  }),
  component: LeadsPage,
});

type Lead = {
  id: string;
  bot_id: string | null;
  name: string | null;
  telegram_id: number | null;
  telegram_username: string | null;
  status: string;
  created_at: string;
  bots: { name: string; telegram_username?: string | null } | null;
};

type GuidedMode =
  | "text"
  | "view_plans_button"
  | "trigger_plans_menu"
  | "specific_plan"
  | "resend_pending_pix"
  | "custom_pix_offer"
  | "vip_link";

const statusLabels: Record<string, string> = {
  new: "Novo",
  engaged: "Em conversa",
  converted: "Convertido",
};

const msgKindLabels: Record<string, string> = {
  command: "Comando",
  flow_welcome: "Boas-vindas (Fluxo)",
  plan_select: "Escolha de Plano",
  pix_generated: "PIX Gerado",
  payment_approved: "Pago · VIP Liberado",
  callback: "Clique em Botão",
  view_plans_button: "Botão Ver Planos",
  trigger_plans_menu: "Cardápio Planos",
  specific_plan: "Plano Direto",
  resend_pending_pix: "PIX Reenviado",
  custom_pix_offer: "Oferta PIX",
  vip_link: "Link VIP",
  photo: "Foto",
  video: "Vídeo",
  audio: "Áudio",
  document: "Arquivo",
};

function cleanTelegramDisplayText(raw: string | null): string {
  if (!raw) return "";
  return raw.replace(/<\/?(?:b|strong|i|em|code|pre|u|s)>/gi, "");
}

function formatChatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    const hhmm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (isToday) return hhmm;
    const ddmm = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return `${ddmm} ${hhmm}`;
  } catch {
    return "";
  }
}

function LeadsPage() {
  const { data: bots } = useBots();
  const [botId, setBotId] = useState("all");
  const [status, setStatus] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<"today" | "yesterday" | "7d" | "30d" | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [activeChatLead, setActiveChatLead] = useState<Lead | null>(null);

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ["leads", botId, status, from, to],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("id,bot_id,name,telegram_id,telegram_username,status,created_at,bots(name,telegram_username)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (botId !== "all") q = q.eq("bot_id", botId);
      if (status !== "all") q = q.eq("status", status as "new" | "engaged" | "converted");
      if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      const [leadsRes, paymentsRes, convsRes] = await Promise.all([
        q,
        supabase.from("payments").select("lead_id,amount_cents,status").limit(600),
        supabase
          .from("conversations")
          .select("lead_id,unread_count,last_message_preview,last_message_at")
          .limit(400),
      ]);
      if (leadsRes.error) throw leadsRes.error;
      return {
        leads: (leadsRes.data ?? []) as unknown as Lead[],
        payments: paymentsRes.data ?? [],
        conversations: convsRes.data ?? [],
      };
    },
  });

  const conversationByLead = useMemo(() => {
    const map = new Map<
      string,
      { unreadCount: number; lastPreview: string | null; lastAt: string }
    >();
    for (const c of leadsData?.conversations ?? []) {
      map.set(c.lead_id, {
        unreadCount: c.unread_count ?? 0,
        lastPreview: c.last_message_preview ?? null,
        lastAt: c.last_message_at,
      });
    }
    return map;
  }, [leadsData?.conversations]);

  const paymentSummaryByLead = useMemo(() => {
    const map = new Map<string, { paidCents: number; paidCount: number; pendingCount: number }>();
    for (const p of leadsData?.payments ?? []) {
      if (!p.lead_id) continue;
      const cur = map.get(p.lead_id) ?? { paidCents: 0, paidCount: 0, pendingCount: 0 };
      if (p.status === "approved") {
        cur.paidCents += p.amount_cents || 0;
        cur.paidCount += 1;
      } else if (p.status === "pending") {
        cur.pendingCount += 1;
      }
      map.set(p.lead_id, cur);
    }
    return map;
  }, [leadsData?.payments]);

  const filteredLeads = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startYesterday = startToday - 86400000;
    const cutoff7d = now.getTime() - 7 * 86400000;
    const cutoff30d = now.getTime() - 30 * 86400000;
    const q = searchQuery.trim().toLowerCase();

    return (leadsData?.leads ?? []).filter((lead) => {
      const createdMs = new Date(lead.created_at).getTime();
      if (periodFilter === "today" && createdMs < startToday) return false;
      if (periodFilter === "yesterday" && (createdMs < startYesterday || createdMs >= startToday)) return false;
      if (periodFilter === "7d" && createdMs < cutoff7d) return false;
      if (periodFilter === "30d" && createdMs < cutoff30d) return false;
      if (!q) return true;
      return `${lead.name ?? ""} ${lead.telegram_username ?? ""} ${lead.telegram_id ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [leadsData?.leads, periodFilter, searchQuery]);

  const novosCount = filteredLeads.filter((l) => l.status === "new").length;
  const engagedCount = filteredLeads.filter((l) => l.status === "engaged").length;
  const pendingPixCount = filteredLeads.filter((l) => {
    const s = paymentSummaryByLead.get(l.id);
    return (s?.pendingCount ?? 0) > 0 && (s?.paidCount ?? 0) === 0;
  }).length;
  const convertedCount = filteredLeads.filter(
    (l) => l.status === "converted" || (paymentSummaryByLead.get(l.id)?.paidCount ?? 0) > 0,
  ).length;

  const rankedLeads = useMemo(() => {
    return [...filteredLeads]
      .filter((l) => (paymentSummaryByLead.get(l.id)?.paidCount ?? 0) > 0)
      .sort(
        (a, b) =>
          (paymentSummaryByLead.get(b.id)?.paidCents ?? 0) -
          (paymentSummaryByLead.get(a.id)?.paidCents ?? 0),
      );
  }, [filteredLeads, paymentSummaryByLead]);

  const renderLeadTable = (rows: Lead[]) =>
    rows.length === 0 ? (
      <EmptyState title="Nenhum cliente encontrado" description="Ajuste os filtros ou aguarde novas interações." />
    ) : (
      <div className="panel overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente / @Username</TableHead>
              <TableHead>Telegram ID</TableHead>
              <TableHead>Bot</TableHead>
              <TableHead>Compras / Total Gasto</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((lead) => {
              const sum = paymentSummaryByLead.get(lead.id);
              const conv = conversationByLead.get(lead.id);
              const initials = (lead.name || lead.telegram_username || "L").slice(0, 2).toUpperCase();
              const usernameClean = lead.telegram_username?.replace("@", "");
              return (
                <TableRow key={lead.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 shrink-0 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-[11px] font-bold text-cyan-300">
                        {initials}
                      </div>
                      <div className="min-w-0 max-w-[220px]">
                        <p className="font-medium text-white truncate">{lead.name ?? "Sem nome"}</p>
                        <p className="text-xs text-zinc-400 truncate">
                          {usernameClean ? `@${usernameClean}` : "Sem username"}
                          {conv?.lastPreview ? ` · ${cleanTelegramDisplayText(conv.lastPreview)}` : ""}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{lead.telegram_id ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {lead.bots?.name ?? bots?.[0]?.name ?? "Bot Principal"}
                  </TableCell>
                  <TableCell>
                    {sum && sum.paidCount > 0 ? (
                      <div>
                        <span className="font-bold text-emerald-400 text-xs">{formatBRL(sum.paidCents)}</span>
                        <span className="text-[11px] text-zinc-400 ml-1">({sum.paidCount}x)</span>
                      </div>
                    ) : sum && sum.pendingCount > 0 ? (
                      <Badge variant="outline" className="border-amber-500/30 text-amber-300 text-[10px]">
                        {sum.pendingCount} PIX pendente
                      </Badge>
                    ) : (
                      <span className="text-xs text-zinc-500">R$ 0,00</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        lead.status === "converted"
                          ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-400 font-medium"
                          : lead.status === "engaged"
                          ? "border-cyan-500/30 bg-cyan-950/20 text-cyan-300 font-medium"
                          : "border-zinc-800 bg-zinc-900/70 text-zinc-400 font-medium"
                      }
                    >
                      {statusLabels[lead.status] ?? lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{formatDate(lead.created_at)}</TableCell>
                  <TableCell className="text-right">
                    {lead.telegram_id ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        onClick={() => setActiveChatLead(lead)}
                        className="h-7 text-xs bg-gradient-to-r from-[#1049B8] to-[#38BDF8] text-white font-semibold"
                      >
                        <MessageSquare className="size-3 mr-1" />
                        Conversar
                        {conv && conv.unreadCount > 0 && (
                          <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-black">
                            {conv.unreadCount}
                          </span>
                        )}
                      </Button>
                    ) : (
                      <span className="text-[11px] text-zinc-500">Sem Telegram ID</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Base de Clientes (Leads)"
        description="Gerencie todos os leads capturados, visualize o ranking de melhores compradores e controle acessos VIP."
        action={
          <Button
            variant="secondary"
            disabled={filteredLeads.length === 0}
            onClick={() =>
              downloadCsv(
                `leads-${new Date().toISOString().slice(0, 10)}.csv`,
                ["Nome", "Telegram ID", "Usuário", "Bot", "Situação", "Entrada"],
                filteredLeads.map((l) => [
                  l.name ?? "",
                  l.telegram_id ?? "",
                  l.telegram_username ?? "",
                  l.bots?.name ?? "",
                  statusLabels[l.status] ?? l.status,
                  formatDate(l.created_at),
                ]),
              )
            }
          >
            <Download /> Exportar CSV
          </Button>
        }
      />

      {/* 5 KPIs Estilo SharkBot */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-[#09090E]/90 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
            <Sparkles className="size-3 text-cyan-400" /> Novos (/start)
          </p>
          <p className="mt-1 font-display text-2xl font-black text-white">{novosCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#09090E]/90 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1">
            <MessageSquare className="size-3" /> Em Conversa
          </p>
          <p className="mt-1 font-display text-2xl font-black text-cyan-300">{engagedCount}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
            <Clock className="size-3" /> PIX Pendentes
          </p>
          <p className="mt-1 font-display text-2xl font-black text-amber-400">{pendingPixCount}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="size-3" /> Convertidos
          </p>
          <p className="mt-1 font-display text-2xl font-black text-emerald-400">{convertedCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#09090E]/90 p-4 col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
            <Users className="size-3 text-blue-400" /> Total de Leads
          </p>
          <p className="mt-1 font-display text-2xl font-black text-white">{filteredLeads.length}</p>
        </div>
      </div>

      {/* Filtros de Período e Busca */}
      <div className="panel p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "today", label: "Hoje" },
                { id: "yesterday", label: "Ontem" },
                { id: "7d", label: "7 dias" },
                { id: "30d", label: "30 dias" },
                { id: "all", label: "Tudo" },
              ] as const
            ).map((opt) => (
              <Button
                key={opt.id}
                type="button"
                size="sm"
                variant={periodFilter === opt.id ? "default" : "outline"}
                onClick={() => setPeriodFilter(opt.id)}
                className="text-xs h-8 border-white/10"
              >
                {opt.label}
              </Button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="size-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar nome, @usuario ou ID..."
              className="pl-8 h-8 text-xs bg-black/40 border-white/10"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-white/5">
          <div className="space-y-1.5">
            <Label className="text-xs">Bot</Label>
            <Select value={botId} onValueChange={setBotId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os bots</SelectItem>
                {bots?.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Situação</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Object.entries(statusLabels).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from" className="text-xs">De</Label>
            <Input id="from" type="date" className="h-8 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to" className="text-xs">Até</Label>
            <Input id="to" type="date" className="h-8 text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-44 w-full" />
      ) : (
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="bg-zinc-900 border border-white/5">
            <TabsTrigger value="all">
              <Users className="size-3.5 mr-1.5" /> Todos os Leads ({filteredLeads.length})
            </TabsTrigger>
            <TabsTrigger value="ranking">
              <Trophy className="size-3.5 mr-1.5 text-amber-400" /> Ranking de Clientes ({rankedLeads.length})
            </TabsTrigger>
            <TabsTrigger value="vip">
              <ShieldCheck className="size-3.5 mr-1.5 text-emerald-400" /> Controle de Acessos VIP ({rankedLeads.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">{renderLeadTable(filteredLeads)}</TabsContent>
          <TabsContent value="ranking">{renderLeadTable(rankedLeads)}</TabsContent>
          <TabsContent value="vip">{renderLeadTable(rankedLeads)}</TabsContent>
        </Tabs>
      )}

      <LeadGuidedChatSheet
        lead={activeChatLead}
        bots={bots ?? []}
        paymentSummary={activeChatLead ? paymentSummaryByLead.get(activeChatLead.id) : undefined}
        onClose={() => setActiveChatLead(null)}
      />
    </div>
  );
}

type BotSummary = {
  id: string;
  name: string;
  telegram_username: string | null;
  status: "active" | "inactive";
};

function LeadGuidedChatSheet({
  lead,
  bots,
  paymentSummary,
  onClose,
}: {
  lead: Lead | null;
  bots: BotSummary[];
  paymentSummary: { paidCents: number; paidCount: number; pendingCount: number } | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const [selectedBotId, setSelectedBotId] = useState("");
  const [guidedMode, setGuidedMode] = useState<GuidedMode>("text");
  const [messageText, setMessageText] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [offerTitle, setOfferTitle] = useState("Oferta Especial VIP");
  const [offerPriceBRL, setOfferPriceBRL] = useState("19.90");
  const [buttonLabel, setButtonLabel] = useState("🔓 Acessar Área VIP");
  const [buttonUrl, setButtonUrl] = useState("");
  const [showMediaBox, setShowMediaBox] = useState(false);
  const [mediaKind, setMediaKind] = useState<"image" | "video">("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [uploadingChatMedia, setUploadingChatMedia] = useState(false);
  const chatMediaInputRef = useRef<HTMLInputElement>(null);

  async function handleChatPcMediaUpload(file: File | undefined) {
    if (!file) return;
    const rawKind = kindFromFile(file);
    const resolvedKind: "image" | "video" = rawKind === "video" ? "video" : "image";
    setUploadingChatMedia(true);
    try {
      const asset = await uploadMedia(file, resolvedKind);
      setMediaUrl(asset.telegram_file_id);
      setMediaKind(resolvedKind);
      toast.success("Mídia carregada do computador!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar mídia");
    } finally {
      setUploadingChatMedia(false);
      if (chatMediaInputRef.current) chatMediaInputRef.current.value = "";
    }
  }

  useEffect(() => {
    setGuidedMode("text");
    setMessageText("");
    setSelectedPlanId("");
    setShowMediaBox(false);
    setMediaUrl("");
    const preferredBot =
      lead?.bot_id ||
      bots.find((b) => b.status === "active")?.id ||
      bots[0]?.id ||
      "";
    setSelectedBotId(preferredBot);
  }, [lead?.id, lead?.bot_id]);

  useEffect(() => {
    if (!selectedBotId && lead && bots.length > 0) {
      const preferredBot =
        lead.bot_id ||
        bots.find((b) => b.status === "active")?.id ||
        bots[0]?.id ||
        "";
      if (preferredBot) setSelectedBotId(preferredBot);
    }
  }, [bots, lead, selectedBotId]);

  const { data: chatData, isLoading: loadingChat } = useQuery({
    queryKey: ["lead-chat-context", lead?.id, selectedBotId],
    enabled: Boolean(lead?.id),
    refetchInterval: 2000,
    queryFn: () => {
      const req: {
        leadId: string;
        botId?: string;
        telegramId?: number;
        leadName?: string;
      } = { leadId: lead!.id };
      if (selectedBotId) req.botId = selectedBotId;
      if (typeof lead?.telegram_id === "number") req.telegramId = lead.telegram_id;
      if (lead?.name) req.leadName = lead.name;
      return getLeadChatContext({ data: req });
    },
  });

  const conversationId = chatData?.ok ? chatData.conversationId : null;
  const messages: LeadChatMessageRow[] = chatData?.ok ? chatData.messages : [];
  const payments: LeadChatPaymentRow[] = chatData?.ok ? chatData.payments : [];
  const flowPlans: LeadChatFlowPlan[] = chatData?.ok ? chatData.flowPlans : [];
  const latestPending = useMemo(
    () => payments.find((p) => p.status === "pending" && Boolean(p.pix_code)) ?? null,
    [payments],
  );

  useEffect(() => {
    if (!selectedPlanId && flowPlans.length > 0 && flowPlans[0]) {
      setSelectedPlanId(flowPlans[0].id);
    }
  }, [flowPlans, selectedPlanId]);

  useEffect(() => {
    if (!lead?.id) return;
    const channel = supabase
      .channel(`lead-live-${lead.id}-${conversationId ?? "no-conv"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `lead_id=eq.${lead.id}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["lead-chat-context", lead.id, selectedBotId] });
          void qc.invalidateQueries({ queryKey: ["leads"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_logs",
          filter: `entity_id=eq.${lead.id}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["lead-chat-context", lead.id, selectedBotId] });
        },
      );

    if (conversationId) {
      channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["lead-chat-context", lead.id, selectedBotId] });
          void qc.invalidateQueries({ queryKey: ["leads"] });
        },
      );
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [lead?.id, conversationId, selectedBotId, qc]);

  useEffect(() => {
    if (scrollEndRef.current) {
      scrollEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, lead?.id]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("Lead não selecionado.");
      const selectedPlan = flowPlans.find((p) => p.id === selectedPlanId);
      const parsedOfferPrice = Number.parseFloat(offerPriceBRL.replace(",", ".")) || 19.9;

      const payload: {
        leadId: string;
        botId?: string;
        telegramId?: number;
        leadName?: string;
        message: string;
        guidedMode: GuidedMode;
        mediaUrl?: string;
        mediaKind?: "image" | "video";
        planId?: string;
        planName?: string;
        planPriceBRL?: number;
        paymentId?: string;
        offerTitle?: string;
        offerPriceBRL?: number;
        buttonLabel?: string;
        buttonUrl?: string;
      } = {
        leadId: lead.id,
        message: messageText,
        guidedMode,
      };

      if (selectedBotId) payload.botId = selectedBotId;
      if (typeof lead.telegram_id === "number") payload.telegramId = lead.telegram_id;
      if (lead.name) payload.leadName = lead.name;

      const cleanMediaUrl = mediaUrl.trim();
      if (showMediaBox && cleanMediaUrl) {
        payload.mediaUrl = cleanMediaUrl;
        payload.mediaKind = mediaKind;
      }
      if (guidedMode === "specific_plan" && selectedPlan) {
        payload.planId = selectedPlan.id;
        payload.planName = selectedPlan.name;
        payload.planPriceBRL = selectedPlan.price;
      }
      if (guidedMode === "resend_pending_pix" && latestPending) {
        payload.paymentId = latestPending.id;
      }
      if (guidedMode === "custom_pix_offer") {
        payload.offerTitle = offerTitle.trim() || "Oferta Especial VIP";
        payload.offerPriceBRL = parsedOfferPrice;
      }
      if (guidedMode === "view_plans_button" || guidedMode === "vip_link") {
        payload.buttonLabel = buttonLabel.trim();
      }
      if (guidedMode === "vip_link") {
        payload.buttonUrl = buttonUrl.trim();
      }

      const res = await sendLeadGuidedMessage({ data: payload });
      if (!res.ok) {
        throw new Error(res.error || "Não foi possível enviar pelo bot.");
      }
      return res;
    },
    onSuccess: (res) => {
      setMessageText("");
      setShowMediaBox(false);
      setMediaUrl("");
      if (res.messageRow && lead?.id) {
        const addedMsg = res.messageRow;
        qc.setQueryData(["lead-chat-context", lead.id, selectedBotId], (old: any) => {
          if (!old || !old.ok) return old;
          const prevList = (old.messages ?? []) as LeadChatMessageRow[];
          if (prevList.some((m) => m.id === addedMsg.id)) return old;
          return {
            ...old,
            messages: [...prevList, addedMsg],
          };
        });
      }
      void qc.invalidateQueries({ queryKey: ["lead-chat-context", lead?.id, selectedBotId] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar mensagem pelo bot");
    },
  });

  const applyQuickScript = (
    script: "initial" | "pix_pending" | "closing_offer" | "vip_delivery",
  ) => {
    if (script === "initial") {
      setGuidedMode("view_plans_button");
      setButtonLabel("📋 Ver Planos VIP");
      setMessageText(
        "Olá {nome}! Tudo bem? Vi que você iniciou atendimento aqui no bot. Ficou com alguma dúvida ou quer dar uma olhada nos planos disponíveis?",
      );
    } else if (script === "pix_pending") {
      if (latestPending) {
        setGuidedMode("resend_pending_pix");
        setMessageText(
          "Oi {nome}! Notei que o seu PIX para {plano} ainda está aguardando confirmação. Vou reenviar o código abaixo para facilitar sua liberação imediata:",
        );
      } else {
        setGuidedMode("view_plans_button");
        setButtonLabel("📋 Escolher Plano");
        setMessageText(
          "Oi {nome}! Quer gerar um novo PIX agora para liberar seu acesso imediato?",
        );
      }
    } else if (script === "closing_offer") {
      setGuidedMode("custom_pix_offer");
      setOfferTitle("Condição Especial VIP");
      setOfferPriceBRL("19.90");
      setMessageText(
        "{nome}, liberei uma condição especial exclusiva somente neste atendimento para você entrar ainda hoje! Clique abaixo para garantir:",
      );
    } else {
      setGuidedMode("text");
      setMessageText(
        "Perfeito {nome}! Qualquer dúvida sobre seu acesso VIP ou conteúdo, pode responder aqui mesmo neste chat que te ajudo na hora.",
      );
    }
  };

  const usernameClean = lead?.telegram_username?.replace("@", "") ?? "";
  const botDisplay =
    chatData?.ok && chatData.botInfo
      ? chatData.botInfo.telegram_username
        ? `@${chatData.botInfo.telegram_username.replace("@", "")}`
        : chatData.botInfo.name
      : lead?.bots?.name ?? "Bot do Telegram";

  return (
    <Sheet open={Boolean(lead)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col bg-[#09090E] border-l border-white/10 text-white"
      >
        <SheetHeader className="px-5 py-4 border-b border-white/10 bg-[#0d111a] pr-12 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <SheetTitle className="text-base font-bold text-white flex items-center gap-2 truncate">
                <span>{lead?.name ?? "Cliente"}</span>
                {lead?.status && (
                  <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-300">
                    {statusLabels[lead.status] ?? lead.status}
                  </Badge>
                )}
              </SheetTitle>
              <SheetDescription className="text-xs text-zinc-400 flex flex-wrap items-center gap-2 mt-0.5">
                <span>{usernameClean ? `@${usernameClean}` : "Sem username público"}</span>
                <span>·</span>
                <span className="font-mono">ID {lead?.telegram_id}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-sky-300">
                  <Bot className="size-3" /> {botDisplay}
                </span>
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              {paymentSummary && paymentSummary.paidCount > 0 ? (
                <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px]">
                  {formatBRL(paymentSummary.paidCents)} ({paymentSummary.paidCount}x)
                </Badge>
              ) : latestPending ? (
                <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px]">
                  PIX Pendente
                </Badge>
              ) : null}
              {usernameClean && (
                <Button asChild size="icon" variant="ghost" className="size-7 text-zinc-400 hover:text-white">
                  <a
                    href={`https://t.me/${usernameClean}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir no Telegram externo"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 text-emerald-300 font-medium">
              <Zap className="size-3" /> Conversa Guiada pelo Bot · Sem interferir nos fluxos automáticos
            </span>
            {bots.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400">Responder via:</span>
                <Select value={selectedBotId} onValueChange={setSelectedBotId}>
                  <SelectTrigger className="h-6 text-[11px] w-44 bg-black/50 border-white/15">
                    <SelectValue placeholder="Selecionar bot" />
                  </SelectTrigger>
                  <SelectContent>
                    {bots.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} {b.status === "active" ? "• Online" : "• Offline"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </SheetHeader>

        {/* Área da Conversa ao Vivo */}
        <div className="flex-1 overflow-y-auto bg-[#0e1621] p-4 space-y-3">
          {lead && (
            <div className="mx-auto max-w-md rounded-xl border border-white/10 bg-[#17212b]/90 px-3.5 py-2 text-center text-[11px] text-zinc-300">
              Cliente entrou em <strong className="text-white">{formatDate(lead.created_at)}</strong>.{" "}
              As mensagens enviadas aqui saem direto pelo <strong className="text-sky-300">{botDisplay}</strong>{" "}
              e respostas do cliente chegam aqui sem reiniciar seu funil.
            </div>
          )}

          {loadingChat ? (
            <div className="space-y-3 pt-4">
              <Skeleton className="h-14 w-3/4 bg-white/5" />
              <Skeleton className="h-14 w-2/3 ml-auto bg-sky-500/10" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-400">
              <MessageSquare className="size-9 opacity-30 mb-2" />
              <p className="text-sm font-medium text-zinc-200">
                Nenhuma mensagem registrada ainda nesta conversa
              </p>
              <p className="text-xs text-zinc-400 max-w-sm mt-1">
                Escolha um roteiro guiado ou escreva uma resposta abaixo para conversar com este cliente usando o bot.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOut = msg.direction === "out";
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isOut ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow ${
                      isOut
                        ? "bg-[#2b5278] text-white rounded-br-sm"
                        : "bg-[#182533] text-zinc-100 border border-white/5 rounded-bl-sm"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1 text-[10px] opacity-80">
                      <span className="font-semibold">
                        {isOut ? "🤖 Bot (Atendimento)" : `👤 ${lead?.name || "Cliente"}`}
                      </span>
                      {msg.kind !== "text" && (
                        <span className="rounded bg-black/25 px-1.5 py-0.5 uppercase tracking-wide text-[9px]">
                          {msgKindLabels[msg.kind] ?? msg.kind}
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap break-words leading-relaxed text-[13px]">
                      {cleanTelegramDisplayText(msg.body)}
                    </p>
                    <p className="mt-1 text-right text-[10px] opacity-65">
                      {formatChatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* Barra de Conversa Guiada + Compositor */}
        <div className="border-t border-white/10 bg-[#0b0d14] p-4 space-y-3 shrink-0">
          {/* Roteiros Guiados Rápidos */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Roteiros Guiados (1 clique)
              </span>
              <span className="text-[10px] text-zinc-500">
                Variáveis:{" "}
                {(["{nome}", "{plano}", "{pix_copia_cola}"] as const).map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => setMessageText((prev) => `${prev}${prev ? " " : ""}${tok}`)}
                    className="ml-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-cyan-300 hover:bg-white/10"
                  >
                    {tok}
                  </button>
                ))}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-white/10 bg-white/[0.03]"
                onClick={() => applyQuickScript("initial")}
              >
                👋 Abordagem Inicial
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-amber-500/30 bg-amber-950/20 text-amber-200"
                onClick={() => applyQuickScript("pix_pending")}
              >
                ⚡ Lembrete PIX
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-cyan-500/30 bg-cyan-950/20 text-cyan-200"
                onClick={() => applyQuickScript("closing_offer")}
              >
                🔥 Oferta Fechamento
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
                onClick={() => applyQuickScript("vip_delivery")}
              >
                ✅ Suporte / Pós-Venda
              </Button>
            </div>
          </div>

          {/* Ação Guiada no Bot */}
          <div className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Ação Guiada no Bot (opcional — sem alterar o fluxo)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "text", label: "💬 Resposta Livre" },
                  { id: "view_plans_button", label: "📋 Botão Ver Planos" },
                  { id: "trigger_plans_menu", label: "🚀 Cardápio Planos" },
                  { id: "specific_plan", label: "🎯 Plano do Fluxo" },
                  { id: "resend_pending_pix", label: "💠 Reenviar PIX" },
                  { id: "custom_pix_offer", label: "🏷️ Oferta PIX" },
                  { id: "vip_link", label: "🔗 Link VIP" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setGuidedMode(m.id)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                    guidedMode === m.id
                      ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                      : "border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {guidedMode === "specific_plan" && (
              <div className="pt-1">
                {flowPlans.length === 0 ? (
                  <p className="text-[11px] text-amber-300">
                    Nenhum plano configurado no fluxo ativo deste bot.
                  </p>
                ) : (
                  <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                    <SelectTrigger className="h-8 text-xs bg-zinc-900 border-white/10">
                      <SelectValue placeholder="Escolha um plano do fluxo" />
                    </SelectTrigger>
                    <SelectContent>
                      {flowPlans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — R$ {p.price.toFixed(2).replace(".", ",")} ({p.duration})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {guidedMode === "resend_pending_pix" && (
              <div className="text-[11px] pt-1">
                {latestPending ? (
                  <span className="text-emerald-300 flex items-center gap-1.5">
                    <CreditCard className="size-3.5" /> PIX encontrado:{" "}
                    <strong>{latestPending.product_name || "Plano VIP"}</strong> —{" "}
                    {formatBRL(latestPending.amount_cents)}
                  </span>
                ) : (
                  <span className="text-amber-300">
                    Este lead não possui PIX pendente no momento.
                  </span>
                )}
              </div>
            )}

            {guidedMode === "custom_pix_offer" && (
              <div className="grid gap-2 sm:grid-cols-2 pt-1">
                <Input
                  value={offerTitle}
                  onChange={(e) => setOfferTitle(e.target.value)}
                  placeholder="Nome da oferta (ex: VIP Desconto)"
                  className="h-8 text-xs bg-zinc-900 border-white/10"
                />
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  value={offerPriceBRL}
                  onChange={(e) => setOfferPriceBRL(e.target.value)}
                  placeholder="Valor em R$ (ex: 19.90)"
                  className="h-8 text-xs bg-zinc-900 border-white/10"
                />
              </div>
            )}

            {(guidedMode === "view_plans_button" || guidedMode === "vip_link") && (
              <div className="grid gap-2 sm:grid-cols-2 pt-1">
                <Input
                  value={buttonLabel}
                  onChange={(e) => setButtonLabel(e.target.value)}
                  placeholder="Texto do botão"
                  className="h-8 text-xs bg-zinc-900 border-white/10"
                />
                {guidedMode === "vip_link" && (
                  <Input
                    value={buttonUrl}
                    onChange={(e) => setButtonUrl(e.target.value)}
                    placeholder="https://t.me/+seu-grupo-vip"
                    className="h-8 text-xs bg-zinc-900 border-white/10"
                  />
                )}
              </div>
            )}
          </div>

          {showMediaBox && (
            <div className="space-y-2 rounded-lg border border-white/10 bg-black/40 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={mediaKind === "image" ? "default" : "outline"}
                    className="h-7 text-[11px]"
                    onClick={() => setMediaKind("image")}
                  >
                    <ImageIcon className="size-3 mr-1" /> Imagem
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={mediaKind === "video" ? "default" : "outline"}
                    className="h-7 text-[11px]"
                    onClick={() => setMediaKind("video")}
                  >
                    <Video className="size-3 mr-1" /> Vídeo
                  </Button>
                </div>
                <input
                  ref={chatMediaInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => void handleChatPcMediaUpload(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={uploadingChatMedia}
                  onClick={() => chatMediaInputRef.current?.click()}
                  className="h-7 text-[11px] border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                >
                  {uploadingChatMedia ? (
                    <Loader2 className="size-3 animate-spin mr-1" />
                  ) : (
                    <Upload className="size-3 mr-1" />
                  )}
                  {uploadingChatMedia ? "Carregando..." : "Subir do PC"}
                </Button>
                <Input
                  value={mediaUrl.startsWith("data:") ? "" : mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="Ou URL / file_id..."
                  className="h-7 flex-1 min-w-[140px] text-xs bg-zinc-900 border-white/10"
                />
              </div>
              {mediaUrl && (
                <div className="flex items-center justify-between rounded bg-black/50 px-2.5 py-1.5 text-[11px]">
                  <span className="text-emerald-400 truncate">
                    ✓ Mídia anexada ({mediaKind === "video" ? "Vídeo" : "Imagem"})
                  </span>
                  <button
                    type="button"
                    onClick={() => setMediaUrl("")}
                    className="text-red-400 hover:underline ml-2"
                  >
                    Remover
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Caixa de Texto & Envio */}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Textarea
                rows={2}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!sendMutation.isPending) sendMutation.mutate();
                  }
                }}
                placeholder="Escreva a resposta como o bot... (Enter envia, Shift+Enter quebra linha)"
                className="min-h-[60px] resize-none text-xs bg-black/50 border-white/15 text-white"
              />
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setShowMediaBox((prev) => !prev)}
                className="h-7 w-full border-white/10 text-zinc-300"
                title="Anexar imagem ou vídeo"
              >
                <ImageIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                disabled={sendMutation.isPending}
                onClick={() => sendMutation.mutate()}
                className="h-8 px-4 bg-gradient-to-r from-[#1049B8] to-[#38BDF8] text-white font-semibold text-xs"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin mr-1" />
                ) : (
                  <Send className="size-3.5 mr-1" />
                )}
                Enviar pelo Bot
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

