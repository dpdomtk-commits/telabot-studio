import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/AppSidebar";
import { NotificationBell } from "@/components/app/NotificationBell";
import { PwaInstallButton } from "@/components/pwa/PwaInstallButton";
import { supabase } from "@/integrations/supabase/client";
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

export function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const email = (userData.user?.email || "").trim().toLowerCase();
      return email === "dpz09@hotmail.com";
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

  // Listener em tempo real (Realtime WebSocket + polling resiliente no iOS/PWA + Web Push VAPID)
  useEffect(() => {
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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#050508] text-white">
        <AppSidebar isAdmin={!!isAdmin} />
        <div className="flex min-w-0 flex-1 flex-col bg-[#050508]">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/5 bg-[#08080A]/90 backdrop-blur-md px-4">
            <SidebarTrigger />
            <span className="text-sm font-medium text-zinc-400">Painel</span>
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
