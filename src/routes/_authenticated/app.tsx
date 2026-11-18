import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { TrendingUp } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/AppSidebar";
import { NotificationBell } from "@/components/app/NotificationBell";
import { PwaInstallButton } from "@/components/pwa/PwaInstallButton";
import { supabase } from "@/integrations/supabase/client";
import { syncAllUserBotsWebhooks } from "@/lib/bot.functions";
import {
  playCashRegisterSound,
  subscribeDeviceToWebPush,
  triggerSaleNotification,
  unlockAudio,
} from "@/lib/sound";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

const ADMIN_EMAILS = ["dpz09@hotmail.com", "dpdomtk@gmail.com"];

export function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const email = (userData.user?.email || "").trim().toLowerCase();
      return ADMIN_EMAILS.includes(email);
    },
  });
}

function formatPaymentAmount(currRaw: unknown, amountCents: unknown): string {
  const curr = (typeof currRaw === "string" ? currRaw : "BRL").toUpperCase();
  const symbol = curr === "EUR" ? "€" : curr === "GBP" ? "£" : curr === "USD" ? "$" : "R$";
  const amountValue = (Number(amountCents) || 0) / 100;
  return curr === "BRL" || curr === "EUR"
    ? `${symbol} ${amountValue.toFixed(2).replace(".", ",")}`
    : `${symbol} ${amountValue.toFixed(2)}`;
}

function AppLayout() {
  const { data: isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const seenPaymentStatesRef = useRef<Map<string, string>>(new Map());
  const seededRef = useRef(false);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const seededNotificationsRef = useRef(false);

  const { data: headerGoal } = useQuery({
    queryKey: ["header-revenue-goal"],
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [{ data: userData }, { data: paidRows }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("payments").select("amount_cents").eq("status", "approved").limit(1000),
      ]);
      const approvedCents = (paidRows ?? []).reduce((s, p) => s + (p.amount_cents || 0), 0);
      const userName =
        (userData.user?.user_metadata?.["full_name"] as string | undefined) ||
        (userData.user?.email ? userData.user.email.split("@")[0] : "") ||
        "Operador";
      return { approvedCents, userName };
    },
  });

  // Sincroniza webhooks auto-contidos dos bots na inicialização e ativa listeners em tempo real
  const syncedWebhooksOnceRef = useRef(false);
  useEffect(() => {
    if (!syncedWebhooksOnceRef.current) {
      syncedWebhooksOnceRef.current = true;
      syncAllUserBotsWebhooks().catch(() => undefined);
    }

    const handleFirstInteraction = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
    window.addEventListener("pointerdown", handleFirstInteraction, { once: true });
    window.addEventListener("keydown", handleFirstInteraction, { once: true });

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      subscribeDeviceToWebPush().catch(() => undefined);
    }

    const emitPaymentAlert = (rec: any) => {
      if (!rec?.id) return;
      const amountFormatted = formatPaymentAmount(rec.currency, rec.amount_cents);
      const prodName = rec.product_name || rec.description || "Plano";

      if (rec.status === "approved") {
        const alerted = triggerSaleNotification({
          id: rec.id,
          type: "approved",
          amountFormatted,
          productName: prodName,
        });
        if (alerted) {
          toast.success(`💸 Venda Aprovada! ${amountFormatted} (${prodName})`, { duration: 6000 });
          qc.invalidateQueries({ queryKey: ["notifications"] });
          qc.invalidateQueries({ queryKey: ["finance"] });
          qc.invalidateQueries({ queryKey: ["payments"] });
          qc.invalidateQueries({ queryKey: ["header-revenue-goal"] });
        }
        return;
      }

      if (rec.status === "pending") {
        const alerted = triggerSaleNotification({
          id: rec.id,
          type: "generated",
          amountFormatted,
          productName: prodName,
        });
        if (alerted) {
          toast.info(`⏳ Venda Gerada! ${amountFormatted} aguardando pagamento`, { duration: 5000 });
          qc.invalidateQueries({ queryKey: ["notifications"] });
          qc.invalidateQueries({ queryKey: ["finance"] });
          qc.invalidateQueries({ queryKey: ["payments"] });
          qc.invalidateQueries({ queryKey: ["header-revenue-goal"] });
        }
      }
    };

    const syncRecentPayments = async () => {
      try {
        const [{ data: rows }, { data: notifRows }] = await Promise.all([
          supabase
            .from("payments")
            .select("id,status,amount_cents,currency,product_name,description,created_at")
            .order("created_at", { ascending: false })
            .limit(15),
          supabase
            .from("notifications")
            .select("id,type,title,body,entity,entity_id,created_at")
            .order("created_at", { ascending: false })
            .limit(15),
        ]);

        if (rows) {
          const map = seenPaymentStatesRef.current;

          if (!seededRef.current) {
            for (const row of rows) {
              map.set(row.id, row.status);
            }
            seededRef.current = true;
          } else {
            for (const row of rows) {
              const prevStatus = map.get(row.id);
              if (prevStatus === undefined) {
                map.set(row.id, row.status);
                if (row.status === "pending" || row.status === "approved") {
                  emitPaymentAlert(row);
                }
              } else if (prevStatus !== row.status) {
                map.set(row.id, row.status);
                if (row.status === "approved") {
                  emitPaymentAlert(row);
                }
              }
            }
          }
        }

        if (notifRows) {
          const seenSet = seenNotificationIdsRef.current;
          if (!seededNotificationsRef.current) {
            for (const n of notifRows) {
              seenSet.add(n.id);
            }
            seededNotificationsRef.current = true;
          } else {
            for (const n of notifRows) {
              if (seenSet.has(n.id)) continue;
              seenSet.add(n.id);
              const isPaymentEvent =
                n.entity === "payment" ||
                /venda|pedido|pagamento|pix|stripe/i.test(`${n.title} ${n.body ?? ""}`);
              if (isPaymentEvent) {
                const notifType = n.type === "success" ? "approved" : "generated";
                const alerted = triggerSaleNotification({
                  id: n.entity_id || n.id,
                  type: notifType,
                  amountFormatted: n.title,
                  productName: n.body ?? undefined,
                });
                if (alerted) {
                  if (notifType === "approved") {
                    toast.success(n.body || n.title, { duration: 6000 });
                  } else {
                    toast.info(n.body || n.title, { duration: 5000 });
                  }
                  qc.invalidateQueries({ queryKey: ["notifications"] });
                  qc.invalidateQueries({ queryKey: ["finance"] });
                  qc.invalidateQueries({ queryKey: ["payments"] });
                }
              }
            }
          }
        }
      } catch {
        // polling silencioso em caso de queda temporária de rede móvel
      }
    };

    syncRecentPayments();

    const intervalId = window.setInterval(syncRecentPayments, 3000);
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        syncRecentPayments();
        qc.invalidateQueries({ queryKey: ["notifications"] });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_SALE_RECEIVED") {
        playCashRegisterSound().catch(() => undefined);
        const p = event.data.payload as { title?: string; body?: string } | undefined;
        if (p?.title || p?.body) {
          toast.info(p.body || p.title || "Novo evento de pagamento no CASHBOT", { duration: 5000 });
        }
        qc.invalidateQueries({ queryKey: ["notifications"] });
        qc.invalidateQueries({ queryKey: ["finance"] });
        qc.invalidateQueries({ queryKey: ["payments"] });
      }
    };
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSwMessage);
    }

    const channel = supabase
      .channel("realtime-sales-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
        },
        (payload: any) => {
          const rec = payload.new;
          if (!rec?.id) return;
          const prevStatus = seenPaymentStatesRef.current.get(rec.id);
          seenPaymentStatesRef.current.set(rec.id, rec.status);

          if (rec.status === "approved" && prevStatus !== "approved") {
            emitPaymentAlert(rec);
          } else if (rec.status === "pending" && payload.eventType === "INSERT") {
            emitPaymentAlert(rec);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        (payload: any) => {
          qc.invalidateQueries({ queryKey: ["notifications"] });
          qc.invalidateQueries({ queryKey: ["finance"] });
          qc.invalidateQueries({ queryKey: ["payments"] });
          const rec = payload.new;
          if (!rec) return;
          if (rec.id) seenNotificationIdsRef.current.add(rec.id);
          const isPaymentEvent =
            rec.entity === "payment" ||
            /venda|pedido|pagamento|pix|stripe/i.test(`${rec.title ?? ""} ${rec.body ?? ""}`);
          if (isPaymentEvent) {
            const type = rec.type === "success" ? "approved" : "generated";
            const alerted = triggerSaleNotification({
              id: rec.entity_id || rec.id,
              type,
              amountFormatted: rec.title || "Novo pagamento",
              productName: rec.body || undefined,
            });
            if (alerted) {
              if (type === "approved") {
                toast.success(rec.body || rec.title, { duration: 6000 });
              } else {
                toast.info(rec.body || rec.title, { duration: 5000 });
              }
            }
          }
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSwMessage);
      }
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const approvedCents = headerGoal?.approvedCents ?? 0;
  const tiers = [
    { targetCents: 1_000_000, label: "10k" },
    { targetCents: 10_000_000, label: "100k" },
    { targetCents: 50_000_000, label: "500k" },
    { targetCents: 100_000_000, label: "1M" },
    { targetCents: 500_000_000, label: "5M" },
  ] as const;
  const currentTier = tiers.find((t) => approvedCents < t.targetCents) ?? tiers[tiers.length - 1]!;
  const goalPercent = Math.min(100, Math.round((approvedCents / currentTier.targetCents) * 100));
  const approvedFormatted = (approvedCents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const nowHour = new Date().getHours();
  const greeting = nowHour < 12 ? "Bom dia" : nowHour < 18 ? "Boa tarde" : "Boa noite";
  const currentDateLabel = new Date()
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    .toUpperCase();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#050508] text-white">
        <AppSidebar isAdmin={!!isAdmin} />
        <div className="flex min-w-0 flex-1 flex-col bg-[#050508]">
          <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center gap-3 border-b border-white/5 bg-[#08080A]/90 backdrop-blur-md px-4 py-2">
            <SidebarTrigger />

            {/* Pill Meta de Faturamento (Estilo SharkBot) */}
            <Link
              to="/app/finance"
              className="hidden sm:flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 hover:border-emerald-400/50 px-3 py-1.5 transition"
              title="Abrir carteira e metas de faturamento"
            >
              <TrendingUp className="size-3.5 text-emerald-400 shrink-0" />
              <div className="flex flex-col gap-1 min-w-[140px]">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold text-emerald-300">{goalPercent}%</span>
                  <span className="text-zinc-300 font-mono text-[10px]">
                    R$ {approvedFormatted} / {currentTier.label}
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all"
                    style={{ width: `${Math.max(3, goalPercent)}%` }}
                  />
                </div>
              </div>
            </Link>

            {/* Saudação Dinâmica & Data */}
            <div className="hidden md:flex flex-col ml-2">
              <span className="text-xs font-semibold text-white">
                {greeting}, <span className="text-cyan-400">{headerGoal?.userName ?? "Operador"}</span>
              </span>
              <span className="text-[10px] tracking-wider text-zinc-500 font-semibold">
                {currentDateLabel}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <PwaInstallButton />
              <NotificationBell />
            </div>
          </header>
          <main className="aurora-bg flex-1 p-6">
            <div className="mx-auto max-w-6xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
