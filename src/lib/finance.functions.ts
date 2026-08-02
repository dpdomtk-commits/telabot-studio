import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FinanceResult = { ok: boolean; message: string };

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
  .inputValidator((data: unknown) => withdrawalSchema.parse(data))
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

/** Aprova, paga ou recusa um saque (somente administradores). */
export const resolveWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resolveSchema.parse(data))
  .handler(async ({ data, context }): Promise<FinanceResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { ok: false, message: "Sem permissão" };

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
    if (error) return { ok: false, message: error.message };
    const parsed = (result ?? {}) as { ok?: boolean; message?: string };
    if (parsed.ok === false) return { ok: false, message: parsed.message ?? "Falha ao atualizar" };

    const labels: Record<string, string> = {
      approved: "Saque aprovado",
      paid: "Saque pago",
      rejected: "Saque recusado",
    };
    await notify(
      withdrawal.user_id,
      data.status === "rejected" ? "warning" : "success",
      labels[data.status] ?? "Saque atualizado",
      data.reason ?? undefined,
      "withdrawal",
      withdrawal.id,
    );
    await logActivity(context.userId, "financeiro", `saque ${data.status}`, withdrawal.id, {
      ip: clientIp(),
    });
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
  .inputValidator((data: unknown) => adjustSchema.parse(data))
  .handler(async ({ data, context }): Promise<FinanceResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { ok: false, message: "Sem permissão" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logActivity, notify } = await import("@/lib/telegram.server");

    const { error } = await supabaseAdmin.rpc("adjust_wallet", {
      _user_id: data.userId,
      _amount_cents: data.amountCents,
      _description: data.description,
      _reviewer: context.userId,
    });
    if (error) return { ok: false, message: error.message };

    await notify(data.userId, "info", "Saldo ajustado", data.description, "wallet");
    await logActivity(context.userId, "financeiro", "ajuste de saldo", data.userId, {
      amount_cents: data.amountCents,
      ip: clientIp(),
    });
    return { ok: true, message: "Saldo ajustado" };
  });

const blockSchema = z.object({ userId: z.string().uuid(), blocked: z.boolean() });

/** Bloqueia ou desbloqueia um usuário (somente administradores). */
export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => blockSchema.parse(data))
  .handler(async ({ data, context }): Promise<FinanceResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { ok: false, message: "Sem permissão" };

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
  .inputValidator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data, context }): Promise<FinanceResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { ok: false, message: "Sem permissão" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logActivity } = await import("@/lib/telegram.server");

    const { error } = await supabaseAdmin
      .from("finance_settings")
      .update({
        charge_fixed_fee_cents: data.chargeFixedFeeCents,
        charge_percent_fee: data.chargePercentFee,
        withdrawal_fee_cents: data.withdrawalFeeCents,
        min_withdrawal_cents: data.minWithdrawalCents,
        pix_receiver_key: data.pixReceiverKey,
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
  .inputValidator((data: unknown) => cancelSchema.parse(data))
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
