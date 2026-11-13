import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Bot,
  GitBranch,
  Users,
  CreditCard,
  Wallet,
  Network,
  Link2,
  Settings,
  Clock,
  Store,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/app/dashboard", icon: LayoutDashboard },
  { title: "Bots", url: "/app/bots", icon: Bot },
  { title: "Fluxos", url: "/app/flows", icon: GitBranch },
  { title: "Remarketing", url: "/app/remarketing", icon: Clock },
  { title: "Marketplace", url: "/app/marketplace", icon: Store },
  { title: "Leads", url: "/app/leads", icon: Users },
  { title: "Pagamentos", url: "/app/payments", icon: CreditCard },
  { title: "Financeiro", url: "/app/finance", icon: Wallet },
  { title: "Gateways", url: "/app/gateways", icon: Network },
  { title: "Links", url: "/app/redirects", icon: Link2 },
  { title: "Configurações", url: "/app/settings", icon: Settings },
] as const;

export function AppSidebar({ isAdmin }: { isAdmin: boolean }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-white/5 bg-[#0a0a0c]">
      <SidebarHeader className="px-3 py-4 border-b border-white/5">
        <Link to="/app/dashboard" className="flex items-center gap-2.5 truncate font-serif text-base font-bold">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-red-500/40 bg-zinc-950 shadow-[0_0_15px_-4px_rgba(217,4,41,0.5)]">
            <span className="flex items-center gap-0.5 text-red-600 font-black text-sm select-none">
              <span className="inline-block transform -skew-x-12 h-3.5 w-0.5 bg-red-600 rounded-sm"></span>
              <span className="inline-block transform -skew-x-12 h-4 w-0.5 bg-red-600 rounded-sm translate-y-[-1px]"></span>
              <span className="inline-block transform -skew-x-12 h-3 w-0.5 bg-red-600 rounded-sm"></span>
            </span>
          </span>
          <span className="truncate tracking-wider text-white">
            CASH<span className="text-red-600">BOT</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-zinc-500 text-[11px] uppercase tracking-wider font-semibold">Operação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={path.startsWith(item.url)}
                    tooltip={item.title}
                    className="hover:bg-red-600/10 hover:text-red-400 data-[active=true]:bg-red-600/15 data-[active=true]:text-red-500 data-[active=true]:font-semibold"
                  >
                    <Link to={item.url}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-zinc-500 text-[11px] uppercase tracking-wider font-semibold">Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={path.startsWith("/app/admin")} tooltip="Admin">
                    <Link to="/app/admin">
                      <ShieldCheck className="size-4 text-red-500" />
                      <span>Painel Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-white/5 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sair da conta" className="text-zinc-400 hover:text-red-400 hover:bg-red-950/20">
              <LogOut className="size-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
