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
  { title: "Financeiro", url: "/app/finance", icon: Wallet },
  { title: "Marketplace", url: "/app/marketplace", icon: Store },
  { title: "Leads", url: "/app/leads", icon: Users },
  { title: "Pagamentos", url: "/app/payments", icon: CreditCard },
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
    <Sidebar collapsible="icon" className="border-r border-white/5 bg-[#050508]">
      <SidebarHeader className="px-3 py-4 border-b border-white/5">
        <Link to="/app/dashboard" className="flex items-center gap-2.5 truncate font-serif text-base font-bold">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cyan-500/40 bg-black shadow-[0_0_18px_rgba(6,182,212,0.4)]">
            <img src="/chefbot-emblem.jpg" alt="Chef Bot" className="size-full object-cover" />
          </span>
          <div className="flex flex-col truncate">
            <span className="truncate tracking-wider text-white font-extrabold text-sm flex items-center gap-1">
              CHEF<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">BOT</span>
            </span>
            <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-sans font-semibold">
              O Mundo É Seu
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold">
            Operação
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={path.startsWith(item.url)}
                    tooltip={item.title}
                    className="transition-all hover:bg-cyan-500/10 hover:text-cyan-300 data-[active=true]:bg-gradient-to-r data-[active=true]:from-cyan-500/15 data-[active=true]:to-purple-500/15 data-[active=true]:text-cyan-300 data-[active=true]:border-l-2 data-[active=true]:border-cyan-400 data-[active=true]:font-bold"
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
