import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/AppSidebar";
import { NotificationBell } from "@/components/app/NotificationBell";
import { PwaInstallButton } from "@/components/pwa/PwaInstallButton";
import { supabase } from "@/integrations/supabase/client";
import { playCashRegisterSound, triggerSaleNotification, unlockAudio } from "@/lib/sound";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

export function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  });
}

function AppLayout() {
  const { data: isAdmin } = useIsAdmin();

  // Listener em tempo real (WebSocket/Realtime) para tocar som de caixa registradora e notificar a cada venda gerada ou paga
  useEffect(() => {
    // Desbloqueia áudio ao primeiro toque ou clique
    const handleFirstInteraction = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
    window.addEventListener("pointerdown", handleFirstInteraction, { once: true });
    window.addEventListener("keydown", handleFirstInteraction, { once: true });

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
          if (!rec) return;

          const amountFormatted = `R$ ${((rec.amount_cents || 0) / 100).toFixed(2).replace(".", ",")}`;
          const prodName = rec.product_name || rec.description || "Plano";

          // Evento: Venda Paga (Aprovada)
          if (rec.status === "approved" && (payload.eventType === "UPDATE" || payload.eventType === "INSERT")) {
            playCashRegisterSound();
            triggerSaleNotification({
              type: "approved",
              amountFormatted,
              productName: prodName,
            });
            toast.success(`💸 Venda Aprovada! ${amountFormatted} (${prodName})`, {
              duration: 6000,
            });
          }

          // Evento: Venda Gerada (Novo PIX/pedido pendente)
          if (rec.status === "pending" && payload.eventType === "INSERT") {
            triggerSaleNotification({
              type: "generated",
              amountFormatted,
              productName: prodName,
            });
            toast.info(`⏳ Venda Gerada! ${amountFormatted} aguardando pagamento`, {
              duration: 5000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
