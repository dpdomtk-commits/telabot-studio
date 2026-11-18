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
  Image as ImageIcon,
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

type SidebarNavItem = {
  title: string;
  subtitle: string;
  url:
    | "/app/dashboard"
    | "/app/finance"
    | "/app/payments"
    | "/app/bots"
    | "/app/flows"
    | "/app/leads"
    | "/app/remarketing"
    | "/app/redirects"
    | "/app/media"
    | "/app/marketplace"
    | "/app/settings";
  icon: typeof LayoutDashboard;
  badge?: string;
};

const principalItems: readonly SidebarNavItem[] = [
  { title: "Dashboard", subtitle: "Visão geral", url: "/app/dashboard", icon: LayoutDashboard },
  { title: "Financeiro & Saques", subtitle: "Carteira e PIX", url: "/app/finance", icon: Wallet },
  { title: "Transações", subtitle: "Vendas e pedidos", url: "/app/payments", icon: CreditCard },
];

const automationItems: readonly SidebarNavItem[] = [
  { title: "Meus Robôs", subtitle: "Gerenciar bots", url: "/app/bots", icon: Bot },
  { title: "Meus Fluxos", subtitle: "Funis de venda", url: "/app/flows", icon: GitBranch },
  { title: "Clientes (Leads)", subtitle: "Base de contatos", url: "/app/leads", icon: Users },
  {
    title: "Remarketing",
    subtitle: "Campanhas e disparos",
    url: "/app/remarketing",
    icon: Clock,
    badge: "HOT",
  },
  { title: "Redirecionadores", subtitle: "Links e rastreio", url: "/app/redirects", icon: Link2 },
  { title: "Mídias & Cache", subtitle: "Biblioteca file_id", url: "/app/media", icon: ImageIcon },
  { title: "Marketplace", subtitle: "Templates prontos", url: "/app/marketplace", icon: Store },
];

const systemItems: readonly SidebarNavItem[] = [
  { title: "Configurações", subtitle: "Conta e integrações", url: "/app/settings", icon: Settings },
];

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

  const renderGroup = (label: string, groupItems: readonly SidebarNavItem[]) => (
    <SidebarGroup>
      <SidebarGroupLabel className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {groupItems.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                asChild
                isActive={path.startsWith(item.url)}
                tooltip={`${item.title} — ${item.subtitle}`}
                className="h-auto py-2 transition-all hover:bg-cyan-500/10 hover:text-cyan-300 data-[active=true]:bg-gradient-to-r data-[active=true]:from-cyan-500/15 data-[active=true]:to-blue-600/15 data-[active=true]:text-cyan-300 data-[active=true]:border-l-2 data-[active=true]:border-cyan-400 data-[active=true]:font-bold"
              >
                <Link to={item.url} className="flex items-center justify-between gap-2 w-full">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <item.icon className="size-4 shrink-0" />
                    <div className="flex flex-col min-w-0 leading-tight">
                      <span className="truncate text-[13px]">{item.title}</span>
                      <span className="truncate text-[10px] text-zinc-500 font-normal">
                        {item.subtitle}
                      </span>
                    </div>
                  </div>
                  {item.badge ? (
                    <span className="shrink-0 rounded-full bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-300 tracking-wider">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-white/5 bg-[#050508]">
      <SidebarHeader className="px-3 py-4 border-b border-white/5">
        <Link to="/app/dashboard" className="flex items-center gap-2.5 truncate font-serif text-base font-bold">
          <img
            src="/cashbot-emblem.jpg?v=3"
            alt="CASH BOT"
            className="size-10 shrink-0 object-contain drop-shadow-[0_0_10px_rgba(6,182,212,0.35)]"
          />
          <div className="flex flex-col truncate">
            <span className="truncate tracking-wider text-white font-extrabold text-sm flex items-center gap-1">
              CASH<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">BOT</span>
            </span>
            <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-sans font-semibold">
              O Mundo É Seu
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {renderGroup("Principal", principalItems)}
        {renderGroup("Automações", automationItems)}
        {renderGroup("Sistema", systemItems)}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold">
              Administração
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={path === "/app/admin"} tooltip="Painel Admin & Saques">
                    <Link to="/app/admin">
                      <ShieldCheck className="size-4 text-red-500" />
                      <span>Painel Admin & Saques</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={path.startsWith("/app/admin-finance")} tooltip="Financeiro Admin">
                    <Link to="/app/admin-finance">
                      <Wallet className="size-4 text-amber-400" />
                      <span>Financeiro Admin</span>
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
