import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  Zap,
  Ticket,
  ChevronLeft,
  ChevronRight,
  Lock,
  Trophy,
  Users,
  Activity,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Bot,
  Sparkles,
  User,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | CASH BOT" },
      { name: "description", content: "CASH BOT — O Mundo É Seu. Métricas, conversões e faturamento em tempo real." },
      { property: "og:title", content: "Dashboard | CASH BOT" },
    ],
  }),
  component: Dashboard,
});

export function Dashboard() {
  const [activeLeaderboardTab, setActiveLeaderboardTab] = useState<"proprio" | "concurso" | "liga">("proprio");
  const [period, setPeriod] = useState<"hoje" | "ontem" | "7d" | "30d" | "total">("hoje");
  const [activePlaqueIndex, setActivePlaqueIndex] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-metrics"],
    refetchInterval: 30000,
    staleTime: 15000,
    queryFn: async () => {
      const [payments, leads, allLogs, bots] = await Promise.all([
        supabase
          .from("payments")
          .select("id,bot_id,amount_cents,net_cents,status,created_at,product_name,description")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("leads")
          .select("id,bot_id,name,telegram_username,created_at,status")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("activity_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("bots")
          .select("id,name,username,status,created_at")
          .order("created_at", { ascending: false }),
      ]);

      return {
        payments: payments.data ?? [],
        leads: leads.data ?? [],
        logs: allLogs.data ?? [],
        bots: bots.data ?? [],
      };
    },
  });

  // Filtro dinâmico por período
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const start7d = now.getTime() - 7 * 86400000;
  const start30d = now.getTime() - 30 * 86400000;

  const isWithinPeriod = (dateStr: string | null | undefined) => {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    if (period === "hoje") return t >= startOfToday;
    if (period === "ontem") return t >= startOfYesterday && t < startOfToday;
    if (period === "7d") return t >= start7d;
    if (period === "30d") return t >= start30d;
    return true; // total
  };

  const filteredPayments = useMemo(() => {
    return (data?.payments ?? []).filter((p) => isWithinPeriod(p.created_at));
  }, [data?.payments, period]);

  const filteredLeads = useMemo(() => {
    return (data?.leads ?? []).filter((l) => isWithinPeriod(l.created_at));
  }, [data?.leads, period]);

  const approved = useMemo(() => {
    return filteredPayments.filter((p) => p.status === "approved");
  }, [filteredPayments]);

  const revenue = useMemo(() => {
    const cents = approved.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
    return cents / 100;
  }, [approved]);

  const pixTotal = filteredPayments.length;
  const approvedCount = approved.length;
  const conversionRate = pixTotal > 0 ? ((approvedCount / pixTotal) * 100).toFixed(2) : "0.00";
  const totalStarts = filteredLeads.length;
  const ticketMedio = approvedCount > 0 ? (revenue / approvedCount).toFixed(2) : "0,00";

  // Gráfico suave dos últimos 7 dias em azul e roxo neon
  const chartPoints = useMemo(() => {
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const pts = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dayStr = d.toISOString().slice(0, 10);
      const dayApproved = (data?.payments ?? []).filter(
        (p) => p.status === "approved" && p.created_at?.slice(0, 10) === dayStr
      );
      const val = dayApproved.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0) / 100;
      pts.push({
        day: dayNames[d.getDay()],
        receita: val,
      });
    }
    return pts;
  }, [data?.payments]);

  // Lista de Placas de Premiação CASH BOT (Identidade "The World Is Yours")
  const plaques = [
    {
      id: "10k",
      title: "The World Is Yours",
      tag: "CLUBE 10K",
      targetCents: 1000000, // 10k
      targetLabel: "R$ 10k",
      image: "/placas/placa-10k.jpg",
      color: "from-[#08080A] via-[#0D0E12] to-[#0B3B99]/40 border-[#1049B8]/60",
      accentGlow: "shadow-[0_0_30px_rgba(16,73,184,0.45)]",
    },
    {
      id: "100k",
      title: "Monument Empire",
      tag: "CLUBE 100K",
      targetCents: 10000000, // 100k
      targetLabel: "R$ 100k",
      image: "/placas/placa-100k.jpg",
      color: "from-[#08080A] via-[#0D0E12] to-[#1049B8]/40 border-[#1049B8]/60",
      accentGlow: "shadow-[0_0_30px_rgba(16,73,184,0.45)]",
    },
    {
      id: "500k",
      title: "Zeppelin Syndicate",
      tag: "CLUBE 500K",
      targetCents: 50000000, // 500k
      targetLabel: "R$ 500k",
      image: "/placas/placa-500k.jpg",
      color: "from-[#08080A] via-[#0D0E12] to-[#0B3B99]/50 border-[#1049B8]/70",
      accentGlow: "shadow-[0_0_35px_rgba(16,73,184,0.55)]",
    },
    {
      id: "1m",
      title: "Tony Montana Legend",
      tag: "CLUBE 1M",
      targetCents: 100000000, // 1M
      targetLabel: "R$ 1M",
      image: "/placas/placa-1m.jpg",
      color: "from-[#08080A] via-[#0D0E12] to-[#1049B8]/50 border-[#1049B8]/70",
      accentGlow: "shadow-[0_0_40px_rgba(16,73,184,0.65)]",
    },
    {
      id: "5m",
      title: "The World Is Yours · Empire",
      tag: "CLUBE 5M",
      targetCents: 500000000, // 5M
      targetLabel: "R$ 5M",
      image: "/placas/placa-5m.jpg",
      color: "from-[#08080A] via-[#0D0E12] to-[#1049B8]/60 border-[#60A5FA]/80",
      accentGlow: "shadow-[0_0_45px_rgba(96,165,250,0.7)]",
    },
  ];

  const currentPlaque = plaques[activePlaqueIndex] || plaques[0];
  const prevPlaque = plaques[(activePlaqueIndex - 1 + plaques.length) % plaques.length];
  const nextPlaque = plaques[(activePlaqueIndex + 1) % plaques.length];
  const totalAccountRevenue = useMemo(() => {
    return (data?.payments ?? [])
      .filter((p) => p.status === "approved")
      .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0) / 100;
  }, [data?.payments]);
  const plaqueProgressPercent = Math.min(
    100,
    Math.max(3, Math.round(((totalAccountRevenue * 100) / currentPlaque.targetCents) * 100))
  );

  // Top Players / Ranking Integrado com Informações Próprias dos Bots do Usuário
  const ownBotsRanking = useMemo(() => {
    const userBots = data?.bots ?? [];
    if (!userBots.length) {
      return [
        {
          id: "bot-default",
          rank: "#1",
          name: "CASH BOT Principal",
          badge: "O MUNDO É SEU",
          avatar: "👑",
          revenue: `R$ ${revenue.toFixed(2)}`,
        },
      ];
    }
    return userBots.map((b, idx) => {
      const botRevenueCents = (data?.payments ?? [])
        .filter((p) => p.bot_id === b.id && p.status === "approved")
        .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
      const botRev = botRevenueCents / 100;
      return {
        id: b.id,
        rank: `#${idx + 1}`,
        name: b.name || "Bot",
        badge: botRev >= 1000 ? "MEGALODON" : botRev > 0 ? "PRODUCER" : "ATIVO",
        avatar: idx === 0 ? "🦈" : idx === 1 ? "💎" : "⚡",
        revenue: `R$ ${botRev.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      };
    });
  }, [data?.bots, data?.payments, revenue]);

  const networkTopPlayers = [
    {
      id: "net-1",
      rank: "#1",
      name: "Chef Tony · @tony.montana",
      badge: "THE WORLD IS YOURS",
      avatar: "👑",
      revenue: "R$ 2.6M",
    },
    {
      id: "net-2",
      rank: "#2",
      name: "Miami Empire · @scarface.vip",
      badge: "ABYSSAL PREDATOR",
      avatar: "🌊",
      revenue: "R$ 989.6k",
    },
    {
      id: "net-3",
      rank: "#3",
      name: "Chef Hot · @chef.targsa",
      badge: "ABYSSAL PREDATOR",
      avatar: "⚡",
      revenue: "R$ 675.6k",
    },
    {
      id: "net-4",
      rank: "#4",
      name: "Syndicate Bot · @patrick.hot",
      badge: "ABYSSAL PREDATOR",
      avatar: "🎯",
      revenue: "R$ 672.0k",
    },
    {
      id: "net-5",
      rank: "#5",
      name: "Godfather · @arthur.chef",
      badge: "CORAL GUARDIAN",
      avatar: "🔥",
      revenue: "R$ 412.3k",
    },
  ];

  const displayedRanking = activeLeaderboardTab === "proprio" ? ownBotsRanking : networkTopPlayers;

  return (
    <div className="space-y-6 text-white">
      {/* Top Header: Período Filter Traqueado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
          <Calendar className="size-4 text-cyan-400" />
          <span>PERÍODO</span>
        </div>

        <div className="inline-flex rounded-xl bg-[#09090e] p-1 border border-white/10 text-xs font-semibold">
          {[
            { id: "hoje", label: "Hoje" },
            { id: "ontem", label: "Ontem" },
            { id: "7d", label: "7 dias" },
            { id: "30d", label: "30 dias" },
            { id: "total", label: "Total" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setPeriod(item.id as any)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === item.id
                  ? "bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Section: 4 KPI Cards on Left (2x2) + Large Chart on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 4 Cards: 5 cols */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-4">
          {/* Card 1: Vendas Aprovadas */}
          <div className="rounded-2xl border border-white/10 bg-[#09090e] p-5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold">
              <span className="flex size-5 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                $
              </span>
              <span>Vendas Aprovadas</span>
            </div>

            <div className="my-3">
              <div className="text-2xl font-black tracking-tight text-white">
                R$ {revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 border-t border-white/5 pt-2">
              <span>{approvedCount} Aprov.</span>
              <span className="text-emerald-400 font-semibold">{approvedCount > 0 ? "Ativo" : "0% Aprov."}</span>
            </div>
          </div>

          {/* Card 2: Taxa de Conversão */}
          <div className="rounded-2xl border border-white/10 bg-[#09090e] p-5 shadow-xl flex flex-col justify-between items-center text-center">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold self-start">
              <TrendingUp className="size-4 text-cyan-400" />
              <span>Taxa de Conversão</span>
            </div>

            {/* Circular Gauge / Donut Neon Cyan & Blue */}
            <div className="relative my-2 flex items-center justify-center size-24">
              <svg className="size-24 transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="38"
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="38"
                  stroke="#38bdf8"
                  strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 38}
                  strokeDashoffset={2 * Math.PI * 38 * (1 - Math.min(1, Number(conversionRate) / 100))}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-base font-black text-white">{conversionRate}%</span>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400">
              {approvedCount} pagos de {pixTotal} PIX
            </p>
          </div>

          {/* Card 3: Total Starts */}
          <div className="rounded-2xl border border-white/10 bg-[#09090e] p-5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold">
              <Zap className="size-4 text-cyan-400" />
              <span>Total Starts</span>
            </div>

            <div className="my-2">
              <div className="text-3xl font-black text-white">{totalStarts}</div>
              <p className="text-[11px] text-zinc-500 mt-0.5">leads iniciaram conversa</p>
              <p className="text-[10px] text-zinc-600">
                {approvedCount > 0 ? `${(totalStarts / approvedCount).toFixed(0)} starts por venda` : "Aguardando conversão"}
              </p>
            </div>

            {/* Mini bar chart */}
            <div className="flex items-end gap-1.5 h-6 pt-1">
              <div className="w-full bg-cyan-950/60 rounded-t h-2"></div>
              <div className="w-full bg-cyan-900/60 rounded-t h-3"></div>
              <div className="w-full bg-blue-950/60 rounded-t h-2.5"></div>
              <div className="w-full bg-blue-900/70 rounded-t h-4"></div>
              <div className="w-full bg-blue-600/80 rounded-t h-5"></div>
              <div className="w-full bg-cyan-400 rounded-t h-6 shadow-[0_0_10px_#38bdf8]"></div>
            </div>
          </div>

          {/* Card 4: Ticket Médio */}
          <div className="rounded-2xl border border-white/10 bg-[#09090e] p-5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold">
              <Ticket className="size-4 text-cyan-400" />
              <span>Ticket Médio</span>
            </div>

            <div className="my-2">
              <div className="text-2xl font-black text-white">R$ {ticketMedio}</div>
              <p className="text-[11px] text-zinc-500 mt-0.5">Vendas: R$ {revenue.toFixed(2)}</p>
            </div>

            <div>
              <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-400 to-blue-600 h-full rounded-full shadow-[0_0_8px_#38bdf8]"
                  style={{ width: `${Math.min(100, Math.max(15, approvedCount * 20))}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-[10px] text-zinc-500 mt-1.5">
                <span>PIX Pagos</span>
                <span>{approvedCount} de {pixTotal} gerados</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section: Large Spline Chart (7 cols) em Azul Cobalto e Ciano */}
        <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#09090e] p-6 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-cyan-400" />
                <h3 className="font-bold text-white text-base">Seu Desempenho</h3>
              </div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
                CASH BOT · FATURAMENTO
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="size-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8]"></span>
              <span className="text-zinc-300 font-medium">Receita</span>
            </div>
          </div>

          <div className="h-64 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartPoints}>
                <defs>
                  <linearGradient id="neonChefGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                    <stop offset="60%" stopColor="#1049b8" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#1049b8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  stroke="#52525b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.05)" }}
                />
                <YAxis hide={true} domain={[0, "dataMax + 20"]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d0e14",
                    borderColor: "rgba(6, 182, 212, 0.4)",
                    borderRadius: "12px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                  formatter={(val: any) => [`R$ ${Number(val).toFixed(2)}`, "Receita"]}
                />
                <Area
                  type="monotone"
                  dataKey="receita"
                  stroke="#38bdf8"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#neonChefGradient)"
                  dot={{ r: 0 }}
                  activeDot={{ r: 5, fill: "#38bdf8", stroke: "#1049b8", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Section: 3 Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
        {/* Column 1: Log de Atividades (Cores exatas: Verde para pago, Amarelo para gerado) */}
        <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#09090e] p-5 shadow-xl flex flex-col h-[400px]">
          <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-cyan-400" />
              <div>
                <h4 className="font-bold text-white text-sm">Log de Atividades</h4>
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
                  TEMPO REAL
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 text-[10px]">
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <span className="size-2 rounded-full bg-emerald-500"></span> Pago
              </span>
              <span className="flex items-center gap-1 text-amber-400 font-semibold">
                <span className="size-2 rounded-full bg-amber-500"></span> Gerado
              </span>
              <span className="flex items-center gap-1 text-zinc-400 font-semibold">
                <span className="size-2 rounded-full bg-zinc-500"></span> Start
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredPayments.length === 0 && filteredLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs">
                <Clock className="size-6 mb-2 opacity-40 text-cyan-400" />
                <p>Nenhuma atividade registrada no período.</p>
              </div>
            ) : (
              // Junta e ordena eventos de pagamentos e leads
              [
                ...filteredPayments.map((p) => ({
                  id: `pay-${p.id}`,
                  type: p.status === "approved" ? "pago" : "gerado",
                  title: p.status === "approved" ? "PIX Pago (Aprovado)" : "PIX Gerado (Aguardando)",
                  subtitle: `${p.product_name || "Plano"} · R$ ${((p.amount_cents ?? 0) / 100).toFixed(2)}`,
                  date: p.created_at,
                })),
                ...filteredLeads.map((l) => ({
                  id: `lead-${l.id}`,
                  type: "start",
                  title: "Novo Lead (/start)",
                  subtitle: l.name || l.telegram_username ? `@${l.telegram_username || l.name}` : "Cliente iniciou bot",
                  date: l.created_at,
                })),
              ]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 15)
                .map((item) => {
                  const isPaid = item.type === "pago";
                  const isGenerated = item.type === "gerado";

                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-3 flex items-center justify-between transition ${
                        isPaid
                          ? "border-emerald-500/30 bg-emerald-950/15 hover:bg-emerald-950/25"
                          : isGenerated
                          ? "border-amber-500/30 bg-amber-950/15 hover:bg-amber-950/25"
                          : "border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900/80"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex size-7 items-center justify-center rounded-lg border text-xs ${
                            isPaid
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                              : isGenerated
                              ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700/60"
                          }`}
                        >
                          {isPaid ? (
                            <CheckCircle2 className="size-3.5" />
                          ) : isGenerated ? (
                            <Zap className="size-3.5" />
                          ) : (
                            <User className="size-3.5" />
                          )}
                        </span>
                        <div>
                          <p
                            className={`text-xs font-bold ${
                              isPaid
                                ? "text-emerald-300"
                                : isGenerated
                                ? "text-amber-300"
                                : "text-zinc-300 font-medium"
                            }`}
                          >
                            {item.title}
                          </p>
                          <p className="text-[11px] text-zinc-400">{item.subtitle}</p>
                        </div>
                      </div>
                      <div className="text-right text-[10px] text-zinc-500">
                        <p>{formatDate(item.date).slice(11, 16)}</p>
                        <p>{formatDate(item.date).slice(0, 5)}</p>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Column 2: Premiações CASH BOT (The World Is Yours — Carrossel 3D) */}
        <div className="lg:col-span-4 rounded-2xl border border-[#1049B8]/25 bg-gradient-to-b from-[#08080A] to-[#0D0E12] p-5 shadow-2xl flex flex-col justify-between h-[410px] relative overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/5 pb-3 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-[#1049B8]/20 border border-[#1049B8]/40 flex items-center justify-center shadow-[0_0_12px_rgba(16,73,184,0.35)]">
                <Trophy className="size-4 text-[#38BDF8]" />
              </div>
              <div>
                <h4 className="font-sans font-bold text-white text-sm tracking-tight">Premiações</h4>
                <span className="font-mono text-[9px] text-[#60A5FA] uppercase tracking-[0.2em] font-semibold">
                  CONQUISTE NOVAS PLACAS
                </span>
              </div>
            </div>

            {/* Setas de Navegação com estilo Azul Cobalto */}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setActivePlaqueIndex((prev) => (prev > 0 ? prev - 1 : plaques.length - 1))}
                className="size-7 flex items-center justify-center rounded-lg bg-[#08080A] text-zinc-400 hover:text-white hover:bg-[#1049B8]/20 border border-white/10 hover:border-[#1049B8]/40 transition"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setActivePlaqueIndex((prev) => (prev < plaques.length - 1 ? prev + 1 : 0))}
                className="size-7 flex items-center justify-center rounded-lg bg-[#1049B8]/20 text-[#60A5FA] hover:text-white hover:bg-[#1049B8]/35 border border-[#1049B8]/50 shadow-[0_0_12px_rgba(16,73,184,0.4)] transition"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Carrossel 3D com card central em destaque e cards laterais desfocados */}
          <div className="relative flex items-center justify-center my-auto py-2 overflow-hidden w-full h-[260px]">
            {/* Card Lateral Esquerdo (desfocado e reduzido) */}
            <div
              onClick={() => setActivePlaqueIndex((prev) => (prev > 0 ? prev - 1 : plaques.length - 1))}
              className="absolute left-0 sm:left-2 w-28 sm:w-32 h-40 sm:h-44 rounded-2xl overflow-hidden border border-[#1049B8]/20 bg-[#08080A] opacity-35 scale-[0.82] -rotate-6 blur-[1px] transform -translate-x-3 cursor-pointer transition-all duration-500 z-0 pointer-events-auto hover:opacity-55 shadow-lg"
            >
              <img
                src={prevPlaque.image}
                alt={prevPlaque.title}
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
            </div>

            {/* Card Central Ativo (em destaque com perspectiva e glow cobalto) */}
            <div
              className={`relative z-20 w-44 sm:w-48 h-52 sm:h-56 rounded-2xl border-2 overflow-hidden bg-gradient-to-b ${currentPlaque.color} p-4 flex flex-col items-center justify-between ${currentPlaque.accentGlow} transition-all duration-500 transform scale-100 hover:scale-[1.02]`}
            >
              {/* Imagem de Fundo da Placa */}
              <img
                src={currentPlaque.image}
                alt={currentPlaque.title}
                className="absolute inset-0 size-full object-cover object-center opacity-80"
              />

              {/* Gradiente escuro sutil na base inferior para garantir 100% de leitura dos textos */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#08080A] via-[#08080A]/60 to-transparent opacity-95" />

              {/* Ícone de Cadeado nos Níveis Bloqueados / Check nos Conquistados */}
              <div className="relative z-10 flex size-8 items-center justify-center rounded-full bg-[#050507]/85 text-[#60A5FA] border border-[#1049B8]/50 shadow-md">
                {totalAccountRevenue * 100 >= currentPlaque.targetCents ? (
                  <CheckCircle2 className="size-4 text-emerald-400" />
                ) : (
                  <Lock className="size-3.5" />
                )}
              </div>

              {/* Título e Tag da Placa */}
              <div className="relative z-10 text-center px-1">
                <h5 className="font-sans font-black text-sm text-white drop-shadow-md tracking-tight leading-tight">
                  {currentPlaque.title}
                </h5>
                <p className="font-mono text-[9px] text-[#60A5FA] font-bold uppercase tracking-widest mt-0.5">
                  {currentPlaque.tag}
                </p>
              </div>

              {/* Barra de Progresso em Gradiente Cobalto / Ciano */}
              <div className="relative z-10 w-full space-y-1">
                <div className="w-full bg-[#050507]/90 rounded-full h-1.5 border border-[#1049B8]/40 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-[#1049B8] via-[#38BDF8] to-white h-full rounded-full transition-all duration-700"
                    style={{ width: `${plaqueProgressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Card Lateral Direito (desfocado e reduzido) */}
            <div
              onClick={() => setActivePlaqueIndex((prev) => (prev < plaques.length - 1 ? prev + 1 : 0))}
              className="absolute right-0 sm:right-2 w-28 sm:w-32 h-40 sm:h-44 rounded-2xl overflow-hidden border border-[#1049B8]/20 bg-[#08080A] opacity-35 scale-[0.82] rotate-6 blur-[1px] transform translate-x-3 cursor-pointer transition-all duration-500 z-0 pointer-events-auto hover:opacity-55 shadow-lg"
            >
              <img
                src={nextPlaque.image}
                alt={nextPlaque.title}
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
            </div>
          </div>

          {/* Barra inferior com META e o progresso em fonte pixelada retrô */}
          <div className="border-t border-white/5 pt-2 text-center relative z-10">
            <p className="text-[11px] font-mono tracking-widest font-semibold uppercase">
              <span className="text-[#60A5FA] font-bold">META</span>{" "}
              <span className="text-white font-bold">R$ {totalAccountRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}</span>
              <span className="text-zinc-500 font-normal"> / </span>
              <span className="text-[#93C5FD] font-bold">{currentPlaque.targetLabel}</span>
            </p>
          </div>
        </div>

        {/* Column 3: Top 5 Players (Integrado com Informações Próprias dos Bots) */}
        <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#09090e] p-5 shadow-xl flex flex-col h-[400px]">
          <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-2">
            <div className="flex items-center gap-2">
              <Trophy className="size-4 text-cyan-400" />
              <div>
                <h4 className="font-bold text-white text-sm">Top 5 Players</h4>
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
                  RANKING & FATURAMENTO
                </span>
              </div>
            </div>
          </div>

          {/* Abas */}
          <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl mb-3">
            <button
              onClick={() => setActiveLeaderboardTab("proprio")}
              className={`py-1 text-center text-xs font-semibold rounded-lg transition ${
                activeLeaderboardTab === "proprio"
                  ? "bg-gradient-to-r from-cyan-500/30 to-blue-600/30 text-cyan-300 border border-cyan-500/40 font-bold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Seus Bots
            </button>
            <button
              onClick={() => setActiveLeaderboardTab("concurso")}
              className={`py-1 text-center text-xs font-semibold rounded-lg transition ${
                activeLeaderboardTab === "concurso"
                  ? "bg-gradient-to-r from-cyan-500/30 to-blue-600/30 text-cyan-300 border border-cyan-500/40 font-bold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Rede Geral
            </button>
          </div>

          {/* Lista de Ranking */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {displayedRanking.map((player) => (
              <div
                key={player.id}
                className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 flex items-center justify-between hover:bg-white/[0.04] transition"
              >
                <div className="flex items-center gap-2.5 truncate max-w-[200px]">
                  <span className="size-7 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-xs shrink-0">
                    {player.avatar}
                  </span>
                  <div className="truncate">
                    <p className="text-xs font-bold text-white truncate">{player.name}</p>
                    <span className="text-[9px] uppercase font-bold text-cyan-400/90">{player.badge}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="inline-block rounded-md px-2 py-0.5 text-xs font-black bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                    {player.revenue}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
