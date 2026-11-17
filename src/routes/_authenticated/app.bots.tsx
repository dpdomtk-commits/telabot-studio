import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pencil,
  Bot,
  Search,
  ExternalLink,
  GitBranch,
  CheckCircle2,
  ShieldCheck,
  Terminal,
  Sparkles,
  Users,
  ShoppingCart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { validateTelegramToken } from "@/lib/telegram.functions";
import { enableBotWebhook, disableBotWebhook } from "@/lib/bot.functions";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDate, maskToken } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/app/bots")({
  head: () => ({
    meta: [
      { title: "Bots | CASH BOT" },
      { name: "description", content: "Cadastre, valide e gerencie seus bots do Telegram." },
      { property: "og:title", content: "Bots | CASH BOT" },
      { property: "og:description", content: "Cadastre, valide e gerencie seus bots do Telegram." },
    ],
  }),
  component: BotsPage,
});

type BotRow = {
  id: string;
  name: string;
  token: string;
  telegram_username: string | null;
  status: "active" | "inactive";
  created_at: string;
};

const botSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome").max(80),
  token: z
    .string()
    .trim()
    .regex(/^\d{6,}:[A-Za-z0-9_-]{30,}$/, "Formato de token inválido"),
});

export function useBots() {
  return useQuery({
    queryKey: ["bots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bots")
        .select("id,name,token,telegram_username,status,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BotRow[];
    },
  });
}

async function logActivity(entity: string, action: string, entityId?: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("activity_logs").insert({
    user_id: data.user.id,
    entity,
    action,
    entity_id: entityId ?? null,
  });
}

function BotsPage() {
  const { data: bots, isLoading } = useBots();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BotRow | null>(null);
  const [removing, setRemoving] = useState<BotRow | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const { data: botExtras } = useQuery({
    queryKey: ["bot-cards-extras"],
    staleTime: 20_000,
    queryFn: async () => {
      const [flowsRes, leadsRes, paymentsRes] = await Promise.all([
        supabase
          .from("flows")
          .select("id,name,bot_id,is_active,status,updated_at")
          .order("is_active", { ascending: false })
          .order("updated_at", { ascending: false }),
        supabase.from("leads").select("id,bot_id").limit(1000),
        supabase.from("payments").select("id,bot_id,status,amount_cents").limit(1000),
      ]);
      return {
        flows: flowsRes.data ?? [],
        leads: leadsRes.data ?? [],
        payments: paymentsRes.data ?? [],
      };
    },
  });

  const toggle = useMutation({
    mutationFn: async (bot: BotRow) => {
      const activating = bot.status !== "active";
      const result = activating
        ? await enableBotWebhook({ data: { botId: bot.id } })
        : await disableBotWebhook({ data: { botId: bot.id } });
      if (!result.ok) throw new Error(result.message);
      return { activating };
    },
    onSuccess: ({ activating }) => {
      toast.success(activating ? "Bot ativado e conectado ao Telegram" : "Bot desativado");
      qc.invalidateQueries({ queryKey: ["bots"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível alterar a situação"),
  });

  const remove = useMutation({
    mutationFn: async (bot: BotRow) => {
      const { error } = await supabase.from("bots").delete().eq("id", bot.id);
      if (error) throw error;
      await logActivity("bot", "excluído", bot.id);
    },
    onSuccess: () => {
      toast.success("Bot excluído");
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["bots"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => toast.error("Não foi possível excluir"),
  });

  const totalBots = bots?.length ?? 0;
  const activeBots = (bots ?? []).filter((b) => b.status === "active").length;
  const inactiveBots = totalBots - activeBots;
  const qLower = search.trim().toLowerCase();
  const filteredBots = (bots ?? []).filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (!qLower) return true;
    return `${b.name} ${b.telegram_username ?? ""}`.toLowerCase().includes(qLower);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meus Robôs"
        description="Conecte seus bots do @BotFather, acompanhe leads e vendas por bot e abra o funil com 1 clique."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild className="border-white/10">
              <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">
                Criar no @BotFather <ExternalLink className="size-3.5 ml-1.5" />
              </a>
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
              className="bg-gradient-to-r from-[#1049B8] to-[#38BDF8] text-white font-bold"
            >
              <Plus className="size-4 mr-1.5" /> Conectar Robô ({totalBots})
            </Button>
          </div>
        }
      />

      {/* 3 Cards de Resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#09090E]/90 p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">Total de Robôs</p>
            <p className="mt-1 font-display text-2xl font-black text-white">{totalBots}</p>
          </div>
          <Bot className="size-6 text-cyan-400" />
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold">Online (Ativos)</p>
            <p className="mt-1 font-display text-2xl font-black text-emerald-400">{activeBots}</p>
          </div>
          <CheckCircle2 className="size-6 text-emerald-400" />
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#09090E]/90 p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">Offline (Pausados)</p>
            <p className="mt-1 font-display text-2xl font-black text-zinc-300">{inactiveBots}</p>
          </div>
          <Bot className="size-6 text-zinc-500" />
        </div>
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "all", label: `Todos (${totalBots})` },
              { id: "active", label: `Online (${activeBots})` },
              { id: "inactive", label: `Offline (${inactiveBots})` },
            ] as const
          ).map((f) => (
            <Button
              key={f.id}
              type="button"
              size="sm"
              variant={statusFilter === f.id ? "default" : "outline"}
              onClick={() => setStatusFilter(f.id)}
              className="text-xs h-8 border-white/10"
            >
              {f.label}
            </Button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="size-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou @username..."
            className="pl-8 h-9 text-xs bg-black/40 border-white/10"
          />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-44 w-full" />
      ) : filteredBots.length === 0 ? (
        <EmptyState
          title="Nenhum robô encontrado"
          description="Conecte seu primeiro bot do @BotFather ou ajuste o filtro acima."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredBots.map((bot) => {
            const linkedFlow =
              (botExtras?.flows ?? []).find((f) => f.bot_id === bot.id && f.is_active) ??
              (botExtras?.flows ?? []).find((f) => f.bot_id === bot.id);
            const botLeadsCount = (botExtras?.leads ?? []).filter((l) => l.bot_id === bot.id).length;
            const botPaid = (botExtras?.payments ?? []).filter(
              (p) => p.bot_id === bot.id && p.status === "approved",
            );
            const botRevenueCents = botPaid.reduce((s, p) => s + (p.amount_cents || 0), 0);
            const isOnline = bot.status === "active";

            return (
              <div
                key={bot.id}
                className="rounded-2xl border border-white/10 bg-[#09090E]/95 p-5 shadow-xl hover:border-cyan-500/40 transition flex flex-col justify-between gap-4"
              >
                <div className="space-y-4">
                  {/* Topo: Avatar + Nome + Badge ONLINE/OFFLINE */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-11 shrink-0 rounded-xl border border-cyan-500/30 bg-gradient-to-br from-[#1049B8]/30 to-cyan-500/10 flex items-center justify-center font-black text-sm text-cyan-300">
                        {bot.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-white truncate text-base">{bot.name}</h3>
                        {bot.telegram_username ? (
                          <a
                            href={`https://t.me/${bot.telegram_username.replace("@", "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline font-mono truncate"
                          >
                            @{bot.telegram_username.replace("@", "")}
                            <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-500 font-mono">{maskToken(bot.token)}</span>
                        )}
                      </div>
                    </div>

                    <Badge
                      variant="outline"
                      className={
                        isOnline
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-[10px] font-bold gap-1.5 shrink-0"
                          : "border-zinc-700 bg-zinc-900 text-zinc-400 text-[10px] font-semibold shrink-0"
                      }
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          isOnline ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
                        }`}
                      />
                      {isOnline ? "ONLINE" : "OFFLINE"}
                    </Badge>
                  </div>

                  {/* Métricas do Bot */}
                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/5 bg-black/50 p-3 text-center">
                    <div>
                      <p className="text-[10px] uppercase text-zinc-500 flex items-center justify-center gap-1">
                        <Users className="size-3" /> Leads
                      </p>
                      <p className="font-bold text-sm text-white mt-0.5">{botLeadsCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-zinc-500 flex items-center justify-center gap-1">
                        <ShoppingCart className="size-3" /> Vendas
                      </p>
                      <p className="font-bold text-sm text-emerald-400 mt-0.5">{botPaid.length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-zinc-500">Receita</p>
                      <p className="font-bold text-xs text-emerald-300 mt-1">{formatBRL(botRevenueCents)}</p>
                    </div>
                  </div>
                </div>

                {/* Rodapé: Fluxo Vinculado + Ações */}
                <div className="border-t border-white/5 pt-3 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    {linkedFlow ? (
                      <Link
                        to="/app/flows/$flowId/simple"
                        params={{ flowId: linkedFlow.id }}
                        className="inline-flex items-center gap-1.5 text-cyan-300 hover:underline font-mono truncate"
                      >
                        <Terminal className="size-3.5 shrink-0" />
                        <span className="truncate">&gt;_ {linkedFlow.name}</span>
                      </Link>
                    ) : (
                      <Link
                        to="/app/flows"
                        className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white font-mono"
                      >
                        <GitBranch className="size-3.5" /> Vincular fluxo
                      </Link>
                    )}
                    <span className="text-[10px] text-zinc-500 shrink-0">{formatDate(bot.created_at)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={isOnline}
                        onCheckedChange={() => toggle.mutate(bot)}
                        aria-label="Ativar ou pausar bot"
                      />
                      <span className="text-[11px] text-zinc-400">
                        {isOnline ? "Ativo" : "Pausado"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {linkedFlow ? (
                        <Button size="sm" asChild className="h-7 px-2.5 text-xs bg-[#1049B8] hover:bg-[#0B3B99]">
                          <Link to="/app/flows/$flowId/simple" params={{ flowId: linkedFlow.id }}>
                            Configurar Fluxo
                          </Link>
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-zinc-400 hover:text-white"
                        onClick={() => {
                          setEditing(bot);
                          setOpen(true);
                        }}
                        aria-label="Editar bot"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-zinc-400 hover:text-red-400"
                        onClick={() => setRemoving(bot)}
                        aria-label="Excluir bot"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BotDialog open={open} onOpenChange={setOpen} bot={editing} />

      <AlertDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir bot?</AlertDialogTitle>
            <AlertDialogDescription>
              Os fluxos vinculados a este bot também serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove.mutate(removing)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BotDialog({
  open,
  onOpenChange,
  bot,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bot: BotRow | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [checkingToken, setCheckingToken] = useState(false);
  const [detectedUsername, setDetectedUsername] = useState<string | null>(null);

  const key = `${bot?.id ?? "new"}-${open}`;

  async function handleCheckToken(tokenValue: string) {
    const clean = tokenValue.trim();
    if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(clean)) return;
    setCheckingToken(true);
    try {
      const res = await validateTelegramToken({ data: { token: clean } });
      if (res.ok) {
        setDetectedUsername(res.username);
        if (!name.trim()) {
          setName(res.firstName || res.username || "Meu Bot");
        }
        toast.success(`Bot validado: @${res.username ?? res.firstName ?? "Telegram"}`);
      } else {
        setDetectedUsername(null);
      }
    } finally {
      setCheckingToken(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = botSchema.safeParse({ name, token });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }

    setSaving(true);
    const validation = await validateTelegramToken({ data: { token: parsed.data.token } });
    if (!validation.ok) {
      setSaving(false);
      toast.error(`Token recusado pelo Telegram: ${validation.error}`);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSaving(false);
      toast.error("Sessão expirada");
      return;
    }

    const payload = {
      name: parsed.data.name,
      token: parsed.data.token,
      telegram_username: validation.username,
      telegram_bot_id: validation.botId,
    };

    const { error } = bot
      ? await supabase.from("bots").update(payload).eq("id", bot.id)
      : await supabase.from("bots").insert({ ...payload, user_id: userData.user.id });

    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar o bot");
      return;
    }

    await logActivity("bot", bot ? "atualizado" : "criado", bot?.id);
    toast.success(bot ? "Bot atualizado" : `Bot conectado como @${validation.username ?? "bot"}`);
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: ["bots"] });
    qc.invalidateQueries({ queryKey: ["bot-cards-extras"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) {
          setName(bot?.name ?? "");
          setToken(bot?.token ?? "");
          setDetectedUsername(bot?.telegram_username ?? null);
        }
      }}
    >
      <DialogContent key={key} className="max-w-3xl bg-[#09090E] border-white/15 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="size-5 text-cyan-400" />
            {bot ? "Editar Robô Conectado" : "Conectar Novo Robô do Telegram"}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Cole o Token HTTP API gerado no @BotFather para validar e preencher automaticamente os dados do robô.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-12 pt-2">
          {/* Coluna Esquerda: Formulário */}
          <form onSubmit={submit} className="md:col-span-7 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="bot-token" className="text-xs font-semibold">
                  Token do Bot *
                </Label>
                <button
                  type="button"
                  disabled={checkingToken}
                  onClick={() => void handleCheckToken(token)}
                  className="text-[11px] font-semibold text-cyan-400 hover:underline"
                >
                  {checkingToken ? "Validando..." : "Validar e Preencher Nome"}
                </button>
              </div>
              <Input
                id="bot-token"
                value={token}
                onChange={(e) => {
                  const val = e.target.value;
                  setToken(val);
                  if (/^\d{6,}:[A-Za-z0-9_-]{35,}$/.test(val.trim())) {
                    void handleCheckToken(val);
                  }
                }}
                placeholder="123456789:AA..."
                className="font-mono text-xs bg-black/50 border-white/10"
              />
              {detectedUsername ? (
                <p className="text-[11px] text-emerald-400 font-semibold">
                  ✓ Identificado: @{detectedUsername.replace("@", "")}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bot-name" className="text-xs font-semibold">
                Nome de Identificação *
              </Label>
              <Input
                id="bot-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Ex: Bot VIP Principal"
                className="text-xs bg-black/50 border-white/10"
              />
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-3 flex items-start gap-2.5 text-[11px] text-amber-200/90">
              <ShieldCheck className="size-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Segurança:</strong> Nunca compartilhe seu Token HTTP API com terceiros. Ele controla integralmente seu bot no Telegram.
              </span>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="submit"
                disabled={saving}
                className="w-full bg-gradient-to-r from-[#1049B8] to-[#38BDF8] text-white font-bold"
              >
                {saving ? "Validando e Salvando..." : bot ? "Salvar Alterações" : "Conectar Robô Agora"}
              </Button>
            </DialogFooter>
          </form>

          {/* Coluna Direita: Tutorial Passo a Passo no @BotFather */}
          <div className="md:col-span-5 rounded-2xl border border-white/10 bg-black/50 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <p className="text-xs font-bold text-white uppercase tracking-wider">
                Como criar no @BotFather
              </p>
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-cyan-400 hover:underline inline-flex items-center gap-1"
              >
                Abrir <ExternalLink className="size-3" />
              </a>
            </div>
            <ol className="space-y-2.5 text-xs text-zinc-300">
              <li className="flex items-start gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-[10px]">
                  1
                </span>
                <span>
                  Acesse o bot oficial <strong>@BotFather</strong> no Telegram.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-[10px]">
                  2
                </span>
                <span>
                  Envie o comando <code className="rounded bg-white/10 px-1 py-0.5">/newbot</code>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-[10px]">
                  3
                </span>
                <span>Digite o nome de exibição do seu robô.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-[10px]">
                  4
                </span>
                <span>
                  Crie um <code className="rounded bg-white/10 px-1 py-0.5">@username</code> terminado em <strong>bot</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-[10px]">
                  5
                </span>
                <span>Copie o Token HTTP API retornado e cole no campo ao lado.</span>
              </li>
            </ol>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

