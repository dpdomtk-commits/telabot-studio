import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/AppSidebar";
import { NotificationBell } from "@/components/app/NotificationBell";
import { supabase } from "@/integrations/supabase/client";

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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#050508] text-white">
        <AppSidebar isAdmin={!!isAdmin} />
        <div className="flex min-w-0 flex-1 flex-col bg-[#050508]">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/5 bg-[#08080A]/90 backdrop-blur-md px-4">
            <SidebarTrigger />
            <span className="text-sm font-medium text-zinc-400">Painel</span>
            <div className="ml-auto">
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
