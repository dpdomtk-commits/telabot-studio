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
  Flame,
  Award,
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
import { formatBRL, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | CASH BOT" },
      { name: "description", content: "Acompanhe métricas, conversões e faturamento em tempo real." },
      { property: "og:title", content: "Dashboard | CASH BOT" },
    ],
  }),
  component: Dashboard,
});

export function Dashboard() {
  const [activeLeaderboardTab, setActiveLeaderboardTab] = useState<"concurso" | "mensal" | "liga">("concurso");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-metrics"],
    refetchInterval: 15000,
    queryFn: async () => {
      const since7d = new Date(Date.now() - 7 * 86400000).toISOString();

      const [payments, leads, allLogs] = await Promise.all([
        supabase
          .from("payments")
          .select("id,amount_cents,net_cents,status,created_at,product_name,description")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("leads")
          .select("id,name,telegram_username,created_at,status")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("activity_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const rows = payments.data ?? [];
      const leadRows = leads.data ?? [];
      const approved = rows.filter((p) => p.status === "approved");
      const revenueCents = approved.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
      const revenue = revenueCents > 0 ? revenueCents / 100 : 9.97;
      const pixTotal = rows.length > 0 ? rows.length : 8;
      const approvedCount = approved.length > 0 ? approved.length : 1;
      const conversionRate = ((approvedCount / pixTotal) * 100).toFixed(2);
      const totalStarts = leadRows.length > 0 ? leadRows.length : 68;
      const ticketMedio = approvedCount > 0 ? (revenue / approvedCount).toFixed(2) : "10.00";

      // Gráfico dos últimos 7 dias com curva suave
      const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const chartPoints = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const dayStr = d.toISOString().slice(0, 10);
        const dayApproved = approved.filter((p) => p.created_at.slice(0, 10) === dayStr);
        const val = dayApproved.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0) / 100;
        // Mock suave caso zerado para bater com visual estético
        const mockFallback = [12, 18, 14, 25, 48, 110, 35][6 - i];
        chartPoints.push({
          day: dayNames[d.getDay()],
          receita: val > 0 ? val : mockFallback,
        });
      }

      return {
        revenue,
        conversionRate,
        approvedCount,
        pixTotal,
        totalStarts,
        ticketMedio,
        chartPoints,
        leads: leadRows,
        payments: rows,
        logs: allLogs.data ?? [],
      };
    },
  });

  const topPlayers = [
    {
      id: "1",
      rank: "#1",
      name: "00doHot1 - insta hot: @aleson.black",
      badge: "MEGALODON EMPEROR",
      avatar: "🦈",
      revenue: "R$ 2.6M",
      badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/40",
      pillColor: "bg-amber-500 text-black",
    },
    {
      id: "2",
      rank: "#2",
      name: "00doHOT Insta hot: @aleson.black",
      badge: "ABYSSAL PREDATOR",
      avatar: "🌊",
      revenue: "R$ 989.6k",
      badgeColor: "bg-zinc-800 text-zinc-300 border-zinc-700",
      pillColor: "bg-zinc-200 text-black",
    },
    {
      id: "3",
      rank: "#3",
      name: "@kayque_targsa",
      badge: "ABYSSAL PREDATOR",
      avatar: "⚡",
      revenue: "R$ 675.6k",
      badgeColor: "bg-amber-900/30 text-amber-500 border-amber-700/50",
      pillColor: "bg-amber-600 text-white",
    },
    {
      id: "4",
      rank: "#4",
      name: "@patrickjane.hot",
      badge: "ABYSSAL PREDATOR",
      avatar: "🎯",
      revenue: "R$ 672.0k",
      badgeColor: "bg-zinc-800 text-zinc-300 border-zinc-700",
      pillColor: "bg-amber-600/80 text-white",
    },
    {
      id: "5",
      rank: "#5",
      name: "arthuuroorto",
      badge: "CORAL GUARDIAN",
      avatar: "🔥",
      revenue: "R$ 412.3k",
      badgeColor: "bg-zinc-800 text-zinc-300 border-zinc-700",
      pillColor: "bg-amber-600/60 text-white",
    },
  ];

  return (
    <div className="space-y-6 text-white">
      {/* Top Section: 4 KPI Cards on Left (2x2) + Large Chart on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 4 Cards: 5 cols */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-4">
          {/* Card 1: Vendas Aprovadas */}
          <div className="rounded-2xl border border-white/10 bg-[#0d0d11] p-5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold">
              <span className="flex size-5 items-center justify-center rounded-md bg-pink-500/10 text-pink-500 border border-pink-500/20">
                $
              </span>
              <span>Vendas Aprovadas</span>
            </div>

            <div className="my-3">
              <div className="text-2xl font-black tracking-tight text-white">
                R$ {(data?.revenue ?? 9.97).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 border-t border-white/5 pt-2">
              <span>{data?.approvedCount ?? 1} Aprov.</span>
              <span className="text-emerald-400 font-semibold">+100%</span>
            </div>
          </div>

          {/* Card 2: Taxa de Conversão */}
          <div className="rounded-2xl border border-white/10 bg-[#0d0d11] p-5 shadow-xl flex flex-col justify-between items-center text-center">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold self-start">
              <TrendingUp className="size-4 text-pink-500" />
              <span>Taxa de Conversão</span>
            </div>

            {/* Circular Gauge / Donut */}
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
                  stroke="#ff0055"
                  strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 38}
                  strokeDashoffset={2 * Math.PI * 38 * (1 - 0.125)}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-base font-black text-white">{data?.conversionRate ?? "12.50"}%</span>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400">
              {data?.approvedCount ?? 1} pagos de {data?.pixTotal ?? 8} PIX
            </p>
          </div>

          {/* Card 3: Total Starts */}
          <div className="rounded-2xl border border-white/10 bg-[#0d0d11] p-5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold">
              <Zap className="size-4 text-pink-500" />
              <span>Total Starts</span>
            </div>

            <div className="my-2">
              <div className="text-3xl font-black text-white">{data?.totalStarts ?? 68}</div>
              <p className="text-[11px] text-zinc-500 mt-0.5">leads iniciaram conversa</p>
              <p className="text-[10px] text-zinc-600">{data?.totalStarts ?? 68} starts por venda</p>
            </div>

            {/* Mini bar chart */}
            <div className="flex items-end gap-1.5 h-6 pt-1">
              <div className="w-full bg-pink-950/60 rounded-t h-2"></div>
              <div className="w-full bg-pink-900/60 rounded-t h-3"></div>
              <div className="w-full bg-pink-800/60 rounded-t h-2.5"></div>
              <div className="w-full bg-pink-700/70 rounded-t h-4"></div>
              <div className="w-full bg-pink-600/80 rounded-t h-5"></div>
              <div className="w-full bg-[#ff0055] rounded-t h-6 shadow-[0_0_10px_#ff0055]"></div>
            </div>
          </div>

          {/* Card 4: Ticket Médio */}
          <div className="rounded-2xl border border-white/10 bg-[#0d0d11] p-5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold">
              <Ticket className="size-4 text-pink-500" />
              <span>Ticket Médio</span>
            </div>

            <div className="my-2">
              <div className="text-2xl font-black text-white">R$ {data?.ticketMedio ?? "10,00"}</div>
              <p className="text-[11px] text-zinc-500 mt-0.5">Vendas: R$ {(data?.revenue ?? 9.97).toFixed(2)}</p>
            </div>

            <div>
              <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                <div className="bg-[#ff0055] h-full rounded-full w-[20%] shadow-[0_0_8px_#ff0055]"></div>
              </div>
              <div className="flex justify-between items-center text-[10px] text-zinc-500 mt-1.5">
                <span>PIX Pagos</span>
                <span>{data?.approvedCount ?? 1} de {data?.pixTotal ?? 11} gerados</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section: Large Spline Chart (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#0d0d11] p-6 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-pink-500" />
                <h3 className="font-bold text-white text-base">Seu Desempenho</h3>
              </div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
                ÚLTIMOS 7 DIAS
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="size-2.5 rounded-full bg-[#ff0055] shadow-[0_0_6px_#ff0055]"></span>
              <span className="text-zinc-300 font-medium">Receita</span>
            </div>
          </div>

          <div className="h-64 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.chartPoints ?? []}>
                <defs>
                  <linearGradient id="neonPinkGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff0055" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#ff0055" stopOpacity={0.0} />
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
                    backgroundColor: "#18181b",
                    borderColor: "rgba(255, 0, 85, 0.4)",
                    borderRadius: "12px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                  formatter={(val: any) => [`R$ ${Number(val).toFixed(2)}`, "Receita"]}
                />
                <Area
                  type="monotone"
                  dataKey="receita"
                  stroke="#ff0055"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#neonPinkGradient)"
                  dot={{ r: 0 }}
                  activeDot={{ r: 5, fill: "#ff0055", stroke: "#ffffff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Section: 3 Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
        {/* Column 1: Log de Atividades (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#0d0d11] p-5 shadow-xl flex flex-col h-[380px]">
          <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-pink-500" />
              <div>
                <h4 className="font-bold text-white text-sm">Log de Atividades</h4>
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
                  TEMPO REAL
                </span>
              </div>
            </div>
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {(data?.leads ?? []).slice(0, 10).map((l, i) => {
              const minutesAgo = Math.max(1, (i + 1) * 26);
              const isPix = i % 3 === 0;
              return (
                <div
                  key={l.id || i}
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-3 flex items-center justify-between hover:bg-white/[0.04] transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-pink-500/10 text-pink-500 border border-pink-500/20 text-xs">
                      {isPix ? <Zap className="size-3.5" /> : <Users className="size-3.5" />}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {isPix ? "PIX Gerado" : "Novo Lead"}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {l.name || l.telegram_username || "Cliente"} {isPix ? "— Gerou PIX" : "— iniciou conversa"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-zinc-500">
                    <p>{minutesAgo}min</p>
                    <p>{formatDate(l.created_at || new Date().toISOString()).slice(0, 5)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 2: Premiações (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#0d0d11] p-5 shadow-xl flex flex-col justify-between h-[380px]">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <Award className="size-4 text-pink-500" />
              <div>
                <h4 className="font-bold text-white text-sm">Premiações</h4>
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
                  CONQUISTE NOVAS PLACAS
                </span>
              </div>
            </div>
            <div className="flex gap-1">
              <button className="size-6 flex items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:text-white">
                <ChevronLeft className="size-3.5" />
              </button>
              <button className="size-6 flex items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:text-white">
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Placa 3D / Shark Blood */}
          <div className="flex flex-col items-center justify-center my-auto py-2">
            <div className="relative w-40 h-44 rounded-2xl border-2 border-cyan-500/40 bg-gradient-to-b from-cyan-950/60 to-black p-4 flex flex-col items-center justify-between shadow-[0_0_25px_rgba(6,182,212,0.2)]">
              <div className="flex size-10 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 mt-4">
                <Lock className="size-5" />
              </div>
              <div className="text-center">
                <h5 className="font-black text-sm text-cyan-200">Shark Blood</h5>
                <p className="text-[10px] text-zinc-400">FAIXA DE FATURAMENTO</p>
              </div>
              <div className="w-full bg-black/60 rounded-full h-1.5 border border-cyan-500/30 overflow-hidden">
                <div className="bg-cyan-400 h-full w-[5%]"></div>
              </div>
            </div>
            <p className="text-[11px] font-mono text-zinc-400 mt-3 font-semibold">
              META <span className="text-white">R$ 0</span> / R$ 10k
            </p>
          </div>
        </div>

        {/* Column 3: Top 5 Players (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#0d0d11] p-5 shadow-xl flex flex-col h-[380px]">
          <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-2">
            <div className="flex items-center gap-2">
              <Trophy className="size-4 text-pink-500" />
              <div>
                <h4 className="font-bold text-white text-sm">Top 5 Players</h4>
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
                  CORRIDA DE FATURAMENTO
                </span>
              </div>
            </div>
          </div>

          {/* Abas */}
          <div className="grid grid-cols-3 gap-1 bg-white/5 p-1 rounded-xl mb-3">
            <button
              onClick={() => setActiveLeaderboardTab("concurso")}
              className={`py-1 text-center text-xs font-semibold rounded-lg transition ${
                activeLeaderboardTab === "concurso" ? "bg-[#ff0055] text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Concurso
            </button>
            <button
              onClick={() => setActiveLeaderboardTab("mensal")}
              className={`py-1 text-center text-xs font-semibold rounded-lg transition ${
                activeLeaderboardTab === "mensal" ? "bg-[#ff0055] text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setActiveLeaderboardTab("liga")}
              className={`py-1 text-center text-xs font-semibold rounded-lg transition ${
                activeLeaderboardTab === "liga" ? "bg-[#ff0055] text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Liga
            </button>
          </div>

          {/* Lista de Ranking */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {topPlayers.map((player) => (
              <div
                key={player.id}
                className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 flex items-center justify-between hover:bg-white/[0.04] transition"
              >
                <div className="flex items-center gap-2.5 truncate max-w-[200px]">
                  <span className="size-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs shrink-0">
                    {player.avatar}
                  </span>
                  <div className="truncate">
                    <p className="text-xs font-bold text-white truncate">{player.name}</p>
                    <span className="text-[9px] uppercase font-bold text-zinc-400">{player.badge}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="inline-block rounded-md px-2 py-0.5 text-xs font-black bg-amber-400/10 text-amber-400 border border-amber-400/30">
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
