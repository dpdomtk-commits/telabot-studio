import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type FinanceSettings = {
  charge_fixed_fee_cents: number;
  charge_percent_fee: number;
  withdrawal_fee_cents: number;
  min_withdrawal_cents: number;
  provider: string;
  pix_receiver_key: string | null;
  pix_receiver_name: string;
  pix_receiver_city: string;
};

export async function getFinanceSettings(): Promise<FinanceSettings> {
  const { data } = await supabaseAdmin.from("finance_settings").select("*").maybeSingle();
  return {
    charge_fixed_fee_cents: data?.charge_fixed_fee_cents ?? 50,
    charge_percent_fee: Number(data?.charge_percent_fee ?? 0),
    withdrawal_fee_cents: data?.withdrawal_fee_cents ?? 500,
    min_withdrawal_cents: data?.min_withdrawal_cents ?? 1000,
    provider: data?.provider ?? "internal",
    pix_receiver_key: data?.pix_receiver_key ?? null,
    pix_receiver_name: data?.pix_receiver_name ?? "AURUMBOT",
    pix_receiver_city: data?.pix_receiver_city ?? "SAO PAULO",
  };
}

export function estimateFee(amountCents: number, settings: FinanceSettings) {
  const fee = Math.min(
    settings.charge_fixed_fee_cents + Math.floor((amountCents * settings.charge_percent_fee) / 100),
    amountCents,
  );
  return { feeCents: fee, netCents: amountCents - fee };
}

export type CreateChargeInput = {
  userId: string;
  botId?: string | null;
  leadId?: string | null;
  amountCents: number;
  description: string;
  productName?: string | null;
  successMessage?: string | null;
  expiresAt?: string | null;
  idempotencyKey?: string | null;
  flowId?: string | null;
  gatewayId?: string | null;
  /** Comissão da plataforma em % definida no bloco PIX do fluxo (sobrepõe a taxa global). */
  platformFeePercent?: number | null;
  payerName?: string | null;
  payerDocument?: string | null;
  payerEmail?: string | null;
  payerPhone?: string | null;
};



/**
 * Cria uma cobrança PIX através da camada PaymentProvider.
 * A chave de idempotência evita cobranças duplicadas para o mesmo evento.
 */
export async function createPixCharge(input: CreateChargeInput) {
  if (input.idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("id,pix_code,amount_cents,description,product_name,success_message,status")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing) return existing;
  }

  const settings = await getFinanceSettings();
  const percent =
    typeof input.platformFeePercent === "number" && input.platformFeePercent >= 0
      ? Math.min(input.platformFeePercent, 100)
      : null;
  const { feeCents, netCents } =
    percent === null
      ? estimateFee(input.amountCents, settings)
      : (() => {
          const fee = Math.min(Math.floor((input.amountCents * percent) / 100), input.amountCents);
          return { feeCents: fee, netCents: input.amountCents - fee };
        })();

  // Roteamento por fluxo: o fluxo pode fixar qual gateway deve ser usado.
  let preferredGatewayId = input.gatewayId ?? null;
  if (!preferredGatewayId && input.flowId) {
    const { data: flow } = await supabaseAdmin
      .from("flows")
      .select("gateway_id")
      .eq("id", input.flowId)
      .maybeSingle();
    preferredGatewayId = flow?.gateway_id ?? null;
  }

  const { data: charge, error } = await supabaseAdmin
    .from("payments")
    .insert({
      user_id: input.userId,
      bot_id: input.botId ?? null,
      lead_id: input.leadId ?? null,
      flow_id: input.flowId ?? null,
      amount_cents: input.amountCents,
      description: input.description,
      product_name: input.productName ?? null,
      success_message: input.successMessage ?? null,
      expires_at: input.expiresAt ?? null,
      method: "pix",
      status: "pending",
      provider: settings.provider,
      fee_cents: feeCents,
      net_cents: netCents,
      platform_fee_percent: percent,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select("id,pix_code,amount_cents,description,product_name,success_message,status")
    .maybeSingle();

  if (error || !charge) throw new Error(error?.message ?? "Falha ao criar cobrança");

  const { createChargeWithFallback } = await import("@/lib/payments/gateways.server");
  const result = await createChargeWithFallback({
    userId: input.userId,
    preferredGatewayId,
    fallbackProvider: settings.provider,
    fallbackConfig: {
      pixReceiverKey: settings.pix_receiver_key,
      pixReceiverName: settings.pix_receiver_name,
      pixReceiverCity: settings.pix_receiver_city,
    },
    input: {
      chargeId: charge.id,
      amountCents: input.amountCents,
      description: input.description,
      productName: input.productName ?? null,
      expiresAt: input.expiresAt ?? null,
      payerName: input.payerName ?? null,
      payerDocument: input.payerDocument ?? null,
      payerEmail: input.payerEmail ?? null,
      payerPhone: input.payerPhone ?? null,
    },
  });


  await supabaseAdmin
    .from("payments")
    .update({
      pix_code: result.pixCode || null,
      external_id: result.externalId,
      gateway_id: result.gatewayId,
      provider: result.provider,
    })
    .eq("id", charge.id);

  return { ...charge, pix_code: result.pixCode || null };
}


/** Crédito idempotente na carteira interna (transação atômica no banco). */
export async function creditPayment(paymentId: string, ip?: string | null) {
  const { data, error } = await supabaseAdmin.rpc("credit_payment", {
    _payment_id: paymentId,
    ...(ip ? { _ip: ip } : {}),
  });
  if (error) return { ok: false, message: error.message } as const;
  const result = (data ?? {}) as { ok?: boolean; message?: string; duplicate?: boolean };
  return {
    ok: result.ok !== false,
    message: result.message ?? "",
    duplicate: result.duplicate === true,
  } as const;
}
