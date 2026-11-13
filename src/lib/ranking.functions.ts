import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface GlobalTopPlayer {
  id: string;
  rank: string;
  position: number;
  name: string;
  badge: string;
  avatar: string;
  revenue: string;
  revenueRaw: number;
  isCurrentUser: boolean;
  botCount: number;
}

export interface GlobalRankingResult {
  ranking: GlobalTopPlayer[];
  currentUserRank: number | null;
  currentUserRevenue: number;
  totalSellers: number;
}

function getBadgeForRevenue(rev: number): { badge: string; avatar: string } {
  if (rev >= 5000000) return { badge: "CLUBE 5M", avatar: "👑" };
  if (rev >= 1000000) return { badge: "CLUBE 1M", avatar: "💎" };
  if (rev >= 500000) return { badge: "CLUBE 500K", avatar: "⚡" };
  if (rev >= 100000) return { badge: "CLUBE 100K", avatar: "🦈" };
  if (rev >= 10000) return { badge: "CLUBE 10K", avatar: "🏆" };
  if (rev > 0) return { badge: "PRODUCER", avatar: "🔥" };
  return { badge: "ATIVO", avatar: "🚀" };
}

/**
 * Consulta e consolida o faturamento total de todos os usuários da plataforma
 * (Ranking Global CASHBOT — sem restrição por usuário logado).
 */
export const getGlobalRanking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GlobalRankingResult> => {
    // 1. Busca todos os pagamentos aprovados da plataforma inteira
    const { data: approvedPayments, error: payError } = await supabaseAdmin
      .from("payments")
      .select("user_id, amount_cents")
      .eq("status", "approved");

    if (payError) {
      console.error("[getGlobalRanking] Erro ao buscar pagamentos:", payError);
    }

    // 2. Busca os perfis de todos os usuários cadastrados
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email");

    // 3. Busca bots para saber quantos bots cada um opera
    const { data: bots } = await supabaseAdmin
      .from("bots")
      .select("id, user_id, name");

    // Mapa de bots por usuário
    const botsPerUser = new Map<string, number>();
    for (const b of bots ?? []) {
      botsPerUser.set(b.user_id, (botsPerUser.get(b.user_id) ?? 0) + 1);
    }

    // Consolidação de faturamento por user_id
    const revenueByUser = new Map<string, number>();
    for (const p of approvedPayments ?? []) {
      const current = revenueByUser.get(p.user_id) ?? 0;
      revenueByUser.set(p.user_id, current + (p.amount_cents ?? 0));
    }

    // Garante que todos os perfis existentes apareçam na lista (mesmo que com 0)
    for (const prof of profiles ?? []) {
      if (!revenueByUser.has(prof.id)) {
        revenueByUser.set(prof.id, 0);
      }
    }

    // Cria a lista ordenada de vendedores
    const profilesMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    const sortedUsers = Array.from(revenueByUser.entries())
      .map(([userId, totalCents]) => {
        const prof = profilesMap.get(userId);
        const totalReais = totalCents / 100;
        const name = prof?.full_name?.trim() || prof?.email?.split("@")[0] || `Vendedor #${userId.slice(0, 4)}`;
        const { badge, avatar } = getBadgeForRevenue(totalReais);

        return {
          id: userId,
          name,
          revenueRaw: totalReais,
          badge,
          avatar,
          isCurrentUser: userId === context.userId,
          botCount: botsPerUser.get(userId) ?? 0,
        };
      })
      .sort((a, b) => b.revenueRaw - a.revenueRaw);

    // Formata o ranking com posições (#1, #2, etc.)
    let currentUserRank: number | null = null;
    let currentUserRevenue = 0;

    const ranking: GlobalTopPlayer[] = sortedUsers.map((item, index) => {
      const pos = index + 1;
      if (item.isCurrentUser) {
        currentUserRank = pos;
        currentUserRevenue = item.revenueRaw;
      }

      let revenueStr = `R$ ${item.revenueRaw.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (item.revenueRaw >= 1000000) {
        revenueStr = `R$ ${(item.revenueRaw / 1000000).toFixed(1)}M`;
      } else if (item.revenueRaw >= 10000) {
        revenueStr = `R$ ${(item.revenueRaw / 1000).toFixed(1)}k`;
      }

      return {
        id: item.id,
        rank: `#${pos}`,
        position: pos,
        name: item.name,
        badge: item.badge,
        avatar: item.avatar,
        revenue: revenueStr,
        revenueRaw: item.revenueRaw,
        isCurrentUser: item.isCurrentUser,
        botCount: item.botCount,
      };
    });

    return {
      ranking,
      currentUserRank,
      currentUserRevenue,
      totalSellers: ranking.length,
    };
  });
