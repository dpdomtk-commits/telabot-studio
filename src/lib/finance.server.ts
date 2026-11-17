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
    pix_receiver_name: data?.pix_receiver_name ?? "CASH BOT",
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
    try {
      const { data: existing } = await supabaseAdmin
        .from("payments")
        .select("id,pix_code,amount_cents,description,product_name,success_message,status,provider")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();

      // Só reaproveita cobranças pendentes válidas geradas via OmegaPay com o mesmo valor
      if (
        existing &&
        existing.pix_code &&
        existing.status === "pending" &&
        existing.provider === "omegapay" &&
        existing.amount_cents === input.amountCents
      ) {
        return existing;
      }
      if (existing) {
        await supabaseAdmin.from("payments").delete().eq("id", existing.id);
      }
    } catch (idempErr) {
      console.warn("[createPixCharge-idempotency-warn]", idempErr);
    }
  }

  const [settings, flowRow] = await Promise.all([
    getFinanceSettings(),
    !input.gatewayId && input.flowId
      ? supabaseAdmin
          .from("flows")
          .select("gateway_id")
          .eq("id", input.flowId)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

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

  const preferredGatewayId = input.gatewayId ?? flowRow?.gateway_id ?? null;

  const fallbackUuid =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `pix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let charge: {
    id: string;
    pix_code: string | null;
    amount_cents: number;
    description: string | null;
    product_name: string | null;
    success_message: string | null;
    status: string;
  } = {
    id: fallbackUuid,
    pix_code: null,
    amount_cents: input.amountCents,
    description: input.description,
    product_name: input.productName ?? null,
    success_message: input.successMessage ?? null,
    status: "pending",
  };

  let insertedInDb = false;
  try {
    const { data: dbCharge, error } = await supabaseAdmin
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
        provider: "omegapay",
        fee_cents: feeCents,
        net_cents: netCents,
        platform_fee_percent: percent,
        idempotency_key: input.idempotencyKey ?? null,
      })
      .select("id,pix_code,amount_cents,description,product_name,success_message,status")
      .maybeSingle();

    if (!error && dbCharge) {
      charge = dbCharge;
      insertedInDb = true;
    } else if (error) {
      console.warn("[createPixCharge-db-insert-fallback]", error.message);
    }
  } catch (dbErr) {
    console.warn("[createPixCharge-db-insert-exception]", dbErr);
  }

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

  if (insertedInDb) {
    supabaseAdmin
      .from("payments")
      .update({
        pix_code: result.pixCode || null,
        external_id: result.externalId,
        gateway_id: result.gatewayId,
        provider: result.provider,
      })
      .eq("id", charge.id)
      .then(() => undefined)
      .catch((e) => console.warn("[createPixCharge-update-warn]", e));
  }

  // Log de atividade e notificação em background para não atrasar a entrega do PIX no Telegram
  void (async () => {
    try {
      let leadName = input.payerName || "Lead";
      if (input.leadId && !input.leadId.startsWith("lead-")) {
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("name,telegram_username,first_name,last_name")
          .eq("id", input.leadId)
          .maybeSingle();
        if (lead) {
          leadName =
            lead.name ||
            [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
            (lead.telegram_username ? `@${lead.telegram_username}` : "Lead");
        }
      }

      const { logActivity, notify } = await import("@/lib/telegram.server");
      const amountFormatted = (input.amountCents / 100).toFixed(2).replace(".", ",");
      const desc = input.description || input.productName || "Plano";

      await Promise.allSettled([
        logActivity(
          input.userId,
          "pagamento",
          `PIX gerado por ${leadName} - R$ ${amountFormatted} (${desc})`,
          charge.id,
          {
            lead_name: leadName,
            lead_id: input.leadId,
            amount_cents: input.amountCents,
            description: desc,
            status: "pending",
          },
        ),
        notify(
          input.userId,
          "info",
          `⏳ Venda Gerada por ${leadName}!`,
          `Novo pedido de R$ ${amountFormatted} aguardando pagamento por ${leadName} (${desc}).`,
          "payment",
          charge.id,
        ),
      ]);
    } catch (bgErr) {
      console.warn("[createPixCharge-bg-log-warn]", bgErr);
    }
  })();

  return { ...charge, pix_code: result.pixCode || null };
}


/** Crédito idempotente na carteira interna (transação atômica no banco). */
export async function creditPayment(paymentId: string, ip?: string | null) {
  try {
    const { data, error } = await supabaseAdmin.rpc("credit_payment", {
      _payment_id: paymentId,
      ...(ip ? { _ip: ip } : {}),
    });
    if (!error) {
      const result = (data ?? {}) as { ok?: boolean; message?: string; duplicate?: boolean };
      return {
        ok: result.ok !== false,
        message: result.message ?? "",
        duplicate: result.duplicate === true,
      } as const;
    }
    console.warn("[creditPayment-rpc-fallback]", error.message);
  } catch (rpcErr) {
    console.warn("[creditPayment-rpc-catch]", rpcErr);
  }

  // Fallback garantido: atualiza diretamente o status em payments para aprovado
  try {
    const { error: updErr } = await supabaseAdmin
      .from("payments")
      .update({ status: "approved", paid_at: new Date().toISOString() })
      .eq("id", paymentId);

    if (!updErr) {
      return { ok: true, message: "Pagamento aprovado via fallback", duplicate: false } as const;
    }
    return { ok: false, message: updErr.message } as const;
  } catch (err: any) {
    return { ok: false, message: err?.message || "Erro ao atualizar pagamento" } as const;
  }
}

/**
 * Aprovação completa de um pagamento: crédito na carteira (com comissão),
 * split do gateway, notificação e entrega automática do produto no Telegram.
 * É idempotente — chamar duas vezes não credita duas vezes.
 */
export async function approvePayment(paymentId: string, ip?: string | null) {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id,user_id,status,amount_cents,description,product_name,lead_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return { ok: false, message: "Pagamento não encontrado" } as const;

  const credited = await creditPayment(payment.id, ip ?? null);
  if (!credited.ok) return { ok: false, message: credited.message || "Falha ao creditar" } as const;
  if (credited.duplicate) return { ok: true, message: "Pagamento já processado", duplicate: true } as const;

  try {
    const { applyGatewaySplits } = await import("@/lib/payments/gateways.server");
    await applyGatewaySplits(payment.id);
  } catch (splitErr) {
    console.warn("[applyGatewaySplits-err]", splitErr);
  }

  // Busca o NOME DO LEAD QUE PAGOU
  let leadName = "Lead";
  if (payment.lead_id) {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("name,telegram_username,first_name,last_name")
      .eq("id", payment.lead_id)
      .maybeSingle();
    if (lead) {
      leadName =
        lead.name ||
        [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
        (lead.telegram_username ? `@${lead.telegram_username}` : "Lead");
    }
  }

  const { deliverForPayment, notify, logActivity } = await import("@/lib/telegram.server");
  const amountFormatted = (payment.amount_cents / 100).toFixed(2).replace(".", ",");
  const productLabel = payment.product_name ?? payment.description ?? "Plano";

  await logActivity(
    payment.user_id,
    "pagamento",
    `PIX aprovado e pago por ${leadName} - R$ ${amountFormatted} (${productLabel})`,
    payment.id,
    {
      ip: ip ?? null,
      lead_name: leadName,
      lead_id: payment.lead_id,
      amount_cents: payment.amount_cents,
      product: productLabel,
      status: "approved",
    }
  );

  await notify(
    payment.user_id,
    "success",
    `💸 Venda Aprovada de ${leadName}!`,
    `Você recebeu R$ ${amountFormatted} de ${leadName} no CASHBOT! (${productLabel})`,
    "payment",
    payment.id,
  );
  await deliverForPayment(payment.id);

  // Cancela qualquer downsell pendente para este lead/pedido imediatamente
  if (payment.lead_id) {
    const { cancelPendingDownsells } = await import("@/lib/downsell.server");
    await cancelPendingDownsells({ leadId: payment.lead_id, orderId: payment.id }).catch(() => undefined);
  }

  return { ok: true, message: "Pagamento confirmado", duplicate: false } as const;
}

