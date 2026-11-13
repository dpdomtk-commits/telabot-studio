import { supabaseAdmin } from "@/integrations/supabase/client.server";
import "@/lib/payments/syncpay.server";
import { getProvider, type ChargeInput } from "./provider";

export type GatewayRow = {
  id: string;
  name: string;
  provider: string;
  is_active: boolean;
  allow_fallback: boolean;
  priority: number;
  pix_key: string | null;
  receiver_name: string;
  receiver_city: string;
  min_amount_cents: number;
  max_amount_cents: number | null;
};

/**
 * Seleciona os gateways elegíveis de um usuário, já ordenados por prioridade.
 * O gateway preferido (roteamento por fluxo) sempre vai para o topo da fila.
 */
export async function selectGateways(
  userId: string,
  amountCents: number,
  preferredGatewayId?: string | null,
): Promise<GatewayRow[]> {
  const { data } = await supabaseAdmin
    .from("payment_gateways")
    .select(
      "id,name,provider,is_active,allow_fallback,priority,pix_key,receiver_name,receiver_city,min_amount_cents,max_amount_cents",
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  const eligible = (data ?? []).filter(
    (g) =>
      amountCents >= (g.min_amount_cents ?? 0) &&
      (g.max_amount_cents == null || amountCents <= g.max_amount_cents),
  ) as GatewayRow[];

  if (!preferredGatewayId) return eligible;

  const preferred = eligible.find((g) => g.id === preferredGatewayId);
  if (!preferred) return eligible;
  const rest = preferred.allow_fallback ? eligible.filter((g) => g.id !== preferred.id) : [];
  return [preferred, ...rest];
}

/** Credenciais SyncPay salvas pelo próprio usuário (quando conectadas). */
export async function getUserCredentials(
  userId: string,
): Promise<{ clientId: string; clientSecret: string } | null> {
  const { data } = await supabaseAdmin
    .from("user_gateway_credentials")
    .select("client_id,client_secret,status")
    .eq("user_id", userId)
    .eq("provider", "syncpay")
    .maybeSingle();
  if (!data?.client_id || !data.client_secret || data.status !== "connected") return null;
  return { clientId: data.client_id, clientSecret: data.client_secret };
}
export type GatewayChargeResult = {
  gatewayId: string | null;
  provider: string;
  externalId: string | null;
  pixCode: string;
};


/**
 * Tenta criar a cobrança percorrendo a fila de gateways (fallback inteligente).
 * Cada tentativa é registrada em gateway_attempts para alimentar as estatísticas.
 */
export async function createChargeWithFallback(args: {
  userId: string;
  input: ChargeInput;
  preferredGatewayId?: string | null;
  fallbackConfig: { pixReceiverKey: string | null; pixReceiverName: string; pixReceiverCity: string };
  fallbackProvider: string;
}): Promise<GatewayChargeResult> {
  const queue = await selectGateways(args.userId, args.input.amountCents, args.preferredGatewayId);
  const userCredentials = await getUserCredentials(args.userId);

  // Credenciais SyncPay próprias do usuário têm prioridade sobre a fila.
  if (userCredentials) {
    const started = Date.now();
    try {
      const result = await getProvider("syncpay").createPixCharge(args.input, {
        pixReceiverKey: null,
        pixReceiverName: args.fallbackConfig.pixReceiverName,
        pixReceiverCity: args.fallbackConfig.pixReceiverCity,
        credentials: userCredentials,
      });
      if (!result.pixCode) throw new Error("SyncPay não retornou código PIX");
      await logAttempt({
        userId: args.userId,
        gatewayId: null,
        paymentId: args.input.chargeId,
        provider: "syncpay",
        success: true,
        amountCents: args.input.amountCents,
        latencyMs: Date.now() - started,
      });
      return { gatewayId: null, provider: "syncpay", externalId: result.externalId, pixCode: result.pixCode };
    } catch (error) {
      await logAttempt({
        userId: args.userId,
        gatewayId: null,
        paymentId: args.input.chargeId,
        provider: "syncpay",
        success: false,
        amountCents: args.input.amountCents,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Falha desconhecida",
      });
    }
  }

  for (const gateway of queue) {
    const started = Date.now();
    try {
      if (gateway.provider !== "syncpay" && !gateway.pix_key) {
        throw new Error("Gateway sem chave PIX configurada");
      }
      const result = await getProvider(gateway.provider).createPixCharge(args.input, {
        pixReceiverKey: gateway.pix_key,
        pixReceiverName: gateway.receiver_name,
        pixReceiverCity: gateway.receiver_city,
        credentials: gateway.provider === "syncpay" ? userCredentials : null,
      });

      if (!result.pixCode) throw new Error("Gateway não retornou código PIX");

      await logAttempt({
        userId: args.userId,
        gatewayId: gateway.id,
        paymentId: args.input.chargeId,
        provider: gateway.provider,
        success: true,
        amountCents: args.input.amountCents,
        latencyMs: Date.now() - started,
      });
      return {
        gatewayId: gateway.id,
        provider: gateway.provider,
        externalId: result.externalId,
        pixCode: result.pixCode,
      };
    } catch (error) {
      await logAttempt({
        userId: args.userId,
        gatewayId: gateway.id,
        paymentId: args.input.chargeId,
        provider: gateway.provider,
        success: false,
        amountCents: args.input.amountCents,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Falha desconhecida",
      });
      if (!gateway.allow_fallback) break;
    }
  }

  // Última linha de defesa: gateway interna com a chave global da plataforma.
  const started = Date.now();
  try {
    const result = await getProvider(args.fallbackProvider).createPixCharge(args.input, args.fallbackConfig);
    await logAttempt({
      userId: args.userId,
      gatewayId: null,
      paymentId: args.input.chargeId,
      provider: "internal",
      success: true,
      amountCents: args.input.amountCents,
      latencyMs: Date.now() - started,
    });
    return { gatewayId: null, provider: result.provider, externalId: result.externalId, pixCode: result.pixCode };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar código PIX";
    await logAttempt({
      userId: args.userId,
      gatewayId: null,
      paymentId: args.input.chargeId,
      provider: "internal",
      success: false,
      amountCents: args.input.amountCents,
      latencyMs: Date.now() - started,
      error: message,
    });
    throw new Error(message);
  }

}

async function logAttempt(a: {
  userId: string;
  gatewayId: string | null;
  paymentId: string;
  provider: string;
  success: boolean;
  amountCents: number;
  latencyMs: number;
  error?: string;
}) {
  await supabaseAdmin.from("gateway_attempts").insert({
    user_id: a.userId,
    gateway_id: a.gatewayId,
    payment_id: a.paymentId,
    provider: a.provider as never,
    success: a.success,
    amount_cents: a.amountCents,
    latency_ms: a.latencyMs,
    error: a.error ?? null,
  });
}

/**
 * Aplica o split configurado no gateway do pagamento: debita o vendedor
 * e credita cada participante, sempre registrado no extrato.
 */
export async function applyGatewaySplits(paymentId: string) {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id,user_id,gateway_id,net_cents,product_name,description")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment?.gateway_id || !payment.net_cents) return;

  const { data: splits } = await supabaseAdmin
    .from("gateway_splits")
    .select("recipient_user_id,recipient_label,percent")
    .eq("gateway_id", payment.gateway_id);

  for (const split of splits ?? []) {
    const percent = Number(split.percent ?? 0);
    if (!split.recipient_user_id || percent <= 0 || split.recipient_user_id === payment.user_id) continue;
    const amount = Math.floor((payment.net_cents * percent) / 100);
    if (amount <= 0) continue;

    const label = payment.product_name ?? payment.description ?? "Venda";
    await supabaseAdmin.rpc("adjust_wallet", {
      _user_id: payment.user_id,
      _amount_cents: -amount,
      _description: `Split ${percent}% para ${split.recipient_label} — ${label}`,
      _reviewer: payment.user_id,
    });
    await supabaseAdmin.rpc("adjust_wallet", {
      _user_id: split.recipient_user_id,
      _amount_cents: amount,
      _description: `Split ${percent}% recebido — ${label}`,
      _reviewer: payment.user_id,
    });
  }
}
