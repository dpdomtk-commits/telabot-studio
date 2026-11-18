import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validatePixKey } from "@/lib/payments/pix";

export type FinanceResult = { ok: boolean; message: string };

const ADMIN_EMAILS = ["dpz09@hotmail.com", "dpdomtk@gmail.com"];

async function isAuthorizedAdmin(context: { supabase: any; userId: string }): Promise<boolean> {
  try {
    const { data } = await context.supabase.auth.getUser();
    const email = (data?.user?.email || "").trim().toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) return false;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" as const }, { onConflict: "user_id,role" })
      .then(
        () => undefined,
        () => undefined,
      );
    return true;
  } catch {
    return false;
  }
}

function clientIp() {
  const h = getRequest().headers;
  return (h.get("cf-connecting-ip") ?? h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
}

const withdrawalSchema = z.object({
  amountCents: z.number().int().min(100).max(100_000_000),
  pixKey: z.string().trim().min(4).max(140),
  pixKeyType: z.enum(["cpf", "cnpj", "email", "phone", "random"]),
});

/** Solicita um saque: desconta a taxa, bloqueia o saldo e aguarda aprovação do administrador. */
export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => withdrawalSchema.parse(data))
  .handler(async ({ data, context }): Promise<FinanceResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logActivity, notify } = await import("@/lib/telegram.server");

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("is_blocked")
      .eq("id", context.userId)
      .maybeSingle();
    if (profile?.is_blocked) return { ok: false, message: "Conta bloqueada para saques" };

    const ip = clientIp();
    const { data: result, error } = await supabaseAdmin.rpc("request_withdrawal", {
      _user_id: context.userId,
      _amount_cents: data.amountCents,
      _pix_key: data.pixKey,
      _pix_key_type: data.pixKeyType,
      ...(ip ? { _ip: ip } : {}),
    });
    if (error) return { ok: false, message: error.message };

    const parsed = (result ?? {}) as { ok?: boolean; message?: string };
    if (parsed.ok === false) return { ok: false, message: parsed.message ?? "Não foi possível solicitar" };

    await logActivity(context.userId, "financeiro", "saque solicitado", undefined, {
      amount_cents: data.amountCents,
      ip,
    });
    await notify(context.userId, "info", "Saque solicitado", "Sua solicitação está em análise.", "withdrawal");
    return { ok: true, message: "Saque solicitado" };
  });

const resolveSchema = z.object({
  withdrawalId: z.string().uuid(),
  status: z.enum(["approved", "paid", "rejected"]),
  reason: z.string().trim().max(300).optional(),
});

/** Aprova, paga ou recusa um saque (exclusivo para dpz09@hotmail.com). */
export const resolveWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => resolveSchema.parse(data))
  .handler(async ({ data, context }): Promise<FinanceResult> => {
    if (!(await isAuthorizedAdmin(context))) return { ok: false, message: "Sem permissão" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logActivity, notify } = await import("@/lib/telegram.server");

    const { data: withdrawal } = await supabaseAdmin
      .from("withdrawals")
      .select("id,user_id,amount_cents")
      .eq("id", data.withdrawalId)
      .maybeSingle();
    if (!withdrawal) return { ok: false, message: "Saque não encontrado" };

    const { data: result, error } = await supabaseAdmin.rpc("resolve_withdrawal", {
      _withdrawal_id: data.withdrawalId,
      _status: data.status,
      _reviewer: context.userId,
      ...(data.reason ? { _reason: data.reason } : {}),
    });

    if (error) {
      const { error: updErr } = await supabaseAdmin
        .from("withdrawals")
        .update({
          status: data.status,
          reviewer_id: context.userId,
          reviewed_at: new Date().toISOString(),
          ...(data.reason ? { rejection_reason: data.reason } : {}),
        })
        .eq("id", data.withdrawalId);
      if (updErr) return { ok: false, message: updErr.message || error.message };
    } else {
      const parsed = (result ?? {}) as { ok?: boolean; message?: string };
      if (parsed.ok === false) return { ok: false, message: parsed.message ?? "Falha ao atualizar" };
    }

    const labels: Record<string, string> = {
      approved: "Saque aprovado",
      paid: "Saque pago",
      rejected: "Saque recusado",
    };
    await Promise.allSettled([
      notify(
        withdrawal.user_id,
        data.status === "rejected" ? "warning" : "success",
        labels[data.status] ?? "Saque atualizado",
        data.reason ?? undefined,
        "withdrawal",
        withdrawal.id,
      ),
      logActivity(context.userId, "financeiro", `saque ${data.status}`, withdrawal.id, {
        ip: clientIp(),
      }),
    ]);
    return { ok: true, message: labels[data.status] ?? "Atualizado" };
  });

const adjustSchema = z.object({
  userId: z.string().uuid(),
  amountCents: z.number().int().min(-100_000_000).max(100_000_000),
  description: z.string().trim().min(3).max(200),
});

/** Ajuste manual de saldo pelo administrador, sempre registrado no extrato. */
export const adjustWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => adjustSchema.parse(data))
  .handler(async ({ data, context }): Promise<FinanceResult> => {
    if (!(await isAuthorizedAdmin(context))) return { ok: false, message: "Sem permissão" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logActivity, notify } = await import("@/lib/telegram.server");

    const { error } = await supabaseAdmin.rpc("adjust_wallet", {
      _user_id: data.userId,
      _amount_cents: data.amountCents,
      _description: data.description,
      _reviewer: context.userId,
    });
    if (error) return { ok: false, message: error.message };

    await Promise.allSettled([
      notify(data.userId, "info", "Saldo ajustado", data.description, "wallet"),
      logActivity(context.userId, "financeiro", "ajuste de saldo", data.userId, {
        amount_cents: data.amountCents,
        ip: clientIp(),
      }),
    ]);
    return { ok: true, message: "Saldo ajustado" };
  });

const blockSchema = z.object({ userId: z.string().uuid(), blocked: z.boolean() });

/** Bloqueia ou desbloqueia um usuário (exclusivo para dpz09@hotmail.com). */
export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => blockSchema.parse(data))
  .handler(async ({ data, context }): Promise<FinanceResult> => {
    if (!(await isAuthorizedAdmin(context))) return { ok: false, message: "Sem permissão" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logActivity } = await import("@/lib/telegram.server");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_blocked: data.blocked })
      .eq("id", data.userId);
    if (error) return { ok: false, message: error.message };

    await logActivity(context.userId, "financeiro", data.blocked ? "usuário bloqueado" : "usuário liberado", data.userId, {
      ip: clientIp(),
    });
    return { ok: true, message: data.blocked ? "Usuário bloqueado" : "Usuário liberado" };
  });

const settingsSchema = z.object({
  chargeFixedFeeCents: z.number().int().min(0).max(100000),
  chargePercentFee: z.number().min(0).max(50),
  withdrawalFeeCents: z.number().int().min(0).max(100000),
  minWithdrawalCents: z.number().int().min(0).max(10_000_000),
  pixReceiverKey: z.string().trim().max(140).nullable(),
  pixReceiverName: z.string().trim().min(2).max(25),
  pixReceiverCity: z.string().trim().min(2).max(15),
});

/** Atualiza as configurações globais da gateway (taxas e chave PIX de recebimento). */
export const saveFinanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data, context }): Promise<FinanceResult> => {
    if (!(await isAuthorizedAdmin(context))) return { ok: false, message: "Sem permissão" };

    // A chave é normalizada e validada no servidor: BR Code inválido = "PIX inválido" no banco do cliente.
    let receiverKey: string | null = null;
    if (data.pixReceiverKey) {
      const check = validatePixKey(data.pixReceiverKey);
      if (!check.valid) return { ok: false, message: `Chave PIX inválida: ${check.error}` };
      receiverKey = check.key;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logActivity } = await import("@/lib/telegram.server");

    const { error } = await supabaseAdmin
      .from("finance_settings")
      .update({
        charge_fixed_fee_cents: data.chargeFixedFeeCents,
        charge_percent_fee: data.chargePercentFee,
        withdrawal_fee_cents: data.withdrawalFeeCents,
        min_withdrawal_cents: data.minWithdrawalCents,
        pix_receiver_key: receiverKey,

        pix_receiver_name: data.pixReceiverName,
        pix_receiver_city: data.pixReceiverCity,
      })
      .eq("id", true);
    if (error) return { ok: false, message: error.message };

    await logActivity(context.userId, "financeiro", "configurações atualizadas", undefined, { ip: clientIp() });
    return { ok: true, message: "Configurações salvas" };
  });

const cancelSchema = z.object({ paymentId: z.string().uuid() });

/** Cancela uma cobrança pendente do próprio usuário. */
export const cancelCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => cancelSchema.parse(data))
  .handler(async ({ data, context }): Promise<FinanceResult> => {
    const { error } = await context.supabase
      .from("payments")
      .update({ status: "cancelled" })
      .eq("id", data.paymentId)
      .eq("user_id", context.userId)
      .eq("status", "pending");
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Cobrança cancelada" };
  });

export type PublicFinanceFees = {
  charge_fixed_fee_cents: number;
  charge_percent_fee: number;
  withdrawal_fee_cents: number;
  min_withdrawal_cents: number;
};

/** Expõe apenas as taxas públicas da plataforma (sem chave PIX de recebimento). */
export const getFinanceFees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<PublicFinanceFees> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("finance_settings")
      .select("charge_fixed_fee_cents,charge_percent_fee,withdrawal_fee_cents,min_withdrawal_cents")
      .maybeSingle();
    return {
      charge_fixed_fee_cents: data?.charge_fixed_fee_cents ?? 0,
      charge_percent_fee: Number(data?.charge_percent_fee ?? 10),
      withdrawal_fee_cents: data?.withdrawal_fee_cents ?? 500,
      min_withdrawal_cents: data?.min_withdrawal_cents ?? 1000,
    };
  });

export type AdminWithdrawalRow = {
  id: string;
  user_id: string;
  pix_key: string;
  pix_key_type: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  status: string;
  reviewer_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  ip_address: string | null;
  created_at: string;
};

export type AdminOverviewPayload = {
  authorized: boolean;
  withdrawals: AdminWithdrawalRow[];
  wallets: Array<{
    user_id: string;
    available_cents: number;
    pending_cents: number;
    blocked_cents: number;
    total_received_cents: number;
    total_withdrawn_cents: number;
    total_fees_cents: number;
  }>;
  profiles: Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    is_blocked: boolean;
    created_at: string;
  }>;
  bots: Array<{ id: string; user_id: string; name: string; status: string; created_at: string }>;
  leads: Array<{ id: string; name: string | null; telegram_id: number | null; created_at: string }>;
  payments: Array<{
    id: string;
    user_id: string;
    amount_cents: number;
    fee_cents: number;
    net_cents: number;
    status: string;
    description: string | null;
    created_at: string;
  }>;
  logs: Array<{ id: string; entity: string; action: string; created_at: string }>;
  settings?: {
    charge_fixed_fee_cents: number;
    charge_percent_fee: number;
    withdrawal_fee_cents: number;
    min_withdrawal_cents: number;
    pix_receiver_key: string | null;
    pix_receiver_name: string;
    pix_receiver_city: string;
  } | null;
};

/** Visão administrativa completa (exclusiva para dpz09@hotmail.com e dpdomtk@gmail.com), incluindo todos os pedidos de saque. */
export const getAdminOverviewData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverviewPayload> => {
    if (!(await isAuthorizedAdmin(context))) {
      return {
        authorized: false,
        withdrawals: [],
        wallets: [],
        profiles: [],
        bots: [],
        leads: [],
        payments: [],
        logs: [],
        settings: null,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    async function fetchAdminOrUser<T>(queryFn: (client: typeof supabaseAdmin) => Promise<{ data: T[] | null; error: any }>): Promise<T[]> {
      const adminRes = await queryFn(supabaseAdmin);
      if (!adminRes.error && adminRes.data && adminRes.data.length > 0) return adminRes.data;
      const userRes = await queryFn(context.supabase as typeof supabaseAdmin);
      if (!userRes.error && userRes.data && userRes.data.length > 0) return userRes.data;
      return adminRes.data ?? userRes.data ?? [];
    }

    const [withdrawals, wallets, profiles, bots, leads, payments, logs, settingsAdminRes] = await Promise.all([
      fetchAdminOrUser((c) =>
        c
          .from("withdrawals")
          .select("id,user_id,pix_key,pix_key_type,amount_cents,fee_cents,net_cents,status,reviewer_id,reviewed_at,rejection_reason,ip_address,created_at")
          .order("created_at", { ascending: false })
          .limit(300) as any,
      ),
      fetchAdminOrUser((c) => c.from("wallets").select("*").limit(300) as any),
      fetchAdminOrUser((c) =>
        c
          .from("profiles")
          .select("id,full_name,email,is_blocked,created_at")
          .order("created_at", { ascending: false })
          .limit(300) as any,
      ),
      fetchAdminOrUser((c) =>
        c.from("bots").select("id,user_id,name,status,created_at").order("created_at", { ascending: false }).limit(200) as any,
      ),
      fetchAdminOrUser((c) =>
        c.from("leads").select("id,name,telegram_id,created_at").order("created_at", { ascending: false }).limit(200) as any,
      ),
      fetchAdminOrUser((c) =>
        c
          .from("payments")
          .select("id,user_id,amount_cents,fee_cents,net_cents,status,description,created_at")
          .order("created_at", { ascending: false })
          .limit(300) as any,
      ),
      fetchAdminOrUser((c) =>
        c.from("activity_logs").select("id,entity,action,created_at").order("created_at", { ascending: false }).limit(200) as any,
      ),
      supabaseAdmin.from("finance_settings").select("*").maybeSingle(),
    ]);

    let settingsRow = settingsAdminRes.data ?? null;
    if (!settingsRow) {
      const userSettingsRes = await context.supabase.from("finance_settings").select("*").maybeSingle();
      settingsRow = userSettingsRes.data ?? null;
    }

    return {
      authorized: true,
      withdrawals: withdrawals as AdminWithdrawalRow[],
      wallets: wallets as AdminOverviewPayload["wallets"],
      profiles: profiles as AdminOverviewPayload["profiles"],
      bots: bots as AdminOverviewPayload["bots"],
      leads: leads as AdminOverviewPayload["leads"],
      payments: payments as AdminOverviewPayload["payments"],
      logs: logs as AdminOverviewPayload["logs"],
      settings: settingsRow as AdminOverviewPayload["settings"],
    };
  });

