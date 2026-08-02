import { supabaseAdmin } from "@/integrations/supabase/client.server";

const API = "https://api.telegram.org";

export type TelegramSendResult = { ok: boolean; error?: string };

async function callTelegram(token: string, method: string, body: unknown): Promise<TelegramSendResult> {
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) return { ok: false, error: json.description ?? "Erro do Telegram" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Falha de rede ao contatar o Telegram" };
  }
}

export function sendMessage(token: string, chatId: number, text: string, replyMarkup?: unknown) {
  return callTelegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function sendPhoto(token: string, chatId: number, url: string, caption?: string) {
  return callTelegram(token, "sendPhoto", { chat_id: chatId, photo: url, caption: caption || undefined });
}

export function setWebhook(token: string, url: string, secret: string) {
  return callTelegram(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  });
}

export function deleteWebhook(token: string) {
  return callTelegram(token, "deleteWebhook", { drop_pending_updates: false });
}

/** Converte o host atual para a URL pública estável do projeto. */
export function publicBaseUrl(host: string): string {
  if (host.startsWith("id-preview--")) {
    const rest = host.slice("id-preview--".length);
    const dot = rest.indexOf(".");
    return `https://project--${rest.slice(0, dot)}-dev${rest.slice(dot)}`;
  }
  return `https://${host}`;
}

export async function notify(
  userId: string,
  type: string,
  title: string,
  body?: string,
  entity?: string,
  entityId?: string,
) {
  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    type,
    title,
    body: body ?? null,
    entity: entity ?? null,
    entity_id: entityId ?? null,
  });
}

export async function logActivity(
  userId: string,
  entity: string,
  action: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
) {
  await supabaseAdmin.from("activity_logs").insert({
    user_id: userId,
    entity,
    action,
    entity_id: entityId ?? null,
    metadata: (metadata ?? {}) as never,
  });
}

type StepRow = { id: string; type: string; position: number; config: Record<string, unknown> };

function str(config: Record<string, unknown>, key: string): string {
  const v = config?.[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/**
 * Executa as etapas do fluxo ativo de um bot para um lead.
 * Para na etapa de pagamento (aguarda confirmação) e ignora as de entrega,
 * que só rodam depois do pagamento aprovado.
 */
export async function runFlowForLead(params: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
}) {
  const { data: flow } = await supabaseAdmin
    .from("flows")
    .select("id")
    .eq("bot_id", params.botId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!flow) return;

  const { data: steps } = await supabaseAdmin
    .from("flow_steps")
    .select("id,type,position,config")
    .eq("flow_id", flow.id)
    .order("position", { ascending: true });

  for (const step of (steps ?? []) as unknown as StepRow[]) {
    const config = (step.config ?? {}) as Record<string, unknown>;
    let result: TelegramSendResult = { ok: true };

    if (step.type === "message") {
      result = await sendMessage(params.token, params.chatId, str(config, "text") || "…");
    } else if (step.type === "image") {
      result = await sendPhoto(params.token, params.chatId, str(config, "url"), str(config, "caption"));
    } else if (step.type === "button") {
      result = await sendMessage(params.token, params.chatId, str(config, "label") || "Continuar", {
        inline_keyboard: [
          [{ text: str(config, "label") || "Continuar", callback_data: `step:${step.id}` }],
        ],
      });
    } else if (step.type === "delay") {
      const seconds = Math.min(Number(config["seconds"]) || 0, 5);
      if (seconds > 0) await new Promise((r) => setTimeout(r, seconds * 1000));
    } else if (step.type === "payment") {
      const amount = Math.round((Number(config["amount"]) || 0) * 100);
      const description = str(config, "description") || "Pagamento";
      const { data: payment } = await supabaseAdmin
        .from("payments")
        .insert({
          user_id: params.userId,
          bot_id: params.botId,
          lead_id: params.leadId,
          amount_cents: amount,
          description,
          method: "pix",
          status: "pending",
        })
        .select("id")
        .maybeSingle();

      result = await sendMessage(
        params.token,
        params.chatId,
        `<b>${description}</b>\nValor: R$ ${(amount / 100).toFixed(2).replace(".", ",")}\n\nAssim que o PIX for confirmado, o produto é entregue automaticamente aqui.`,
      );
      await logActivity(params.userId, "pagamento", "cobrança criada", payment?.id);
      if (!result.ok) {
        await notify(
          params.userId,
          "error",
          "Falha ao enviar etapa do fluxo",
          `Etapa "${step.type}": ${result.error}`,
          "flow_step",
          step.id,
        );
      }
      return; // aguarda confirmação do pagamento
    } else if (step.type === "delivery") {
      continue;
    }

    if (!result.ok) {
      await notify(
        params.userId,
        "error",
        "Falha ao enviar etapa do fluxo",
        `Etapa "${step.type}": ${result.error}`,
        "flow_step",
        step.id,
      );
      await logActivity(params.userId, "fluxo", "falha no envio da etapa", step.id, { error: result.error });
      return;
    }
  }
}

/** Entrega automática do produto após pagamento aprovado. */
export async function deliverForPayment(paymentId: string) {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id,user_id,bot_id,lead_id,amount_cents,description")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment || !payment.bot_id) return;

  const { data: bot } = await supabaseAdmin
    .from("bots")
    .select("id,token,name")
    .eq("id", payment.bot_id)
    .maybeSingle();
  const { data: lead } = payment.lead_id
    ? await supabaseAdmin.from("leads").select("id,telegram_id").eq("id", payment.lead_id).maybeSingle()
    : { data: null };

  const { data: flow } = await supabaseAdmin
    .from("flows")
    .select("id")
    .eq("bot_id", payment.bot_id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: steps } = flow
    ? await supabaseAdmin
        .from("flow_steps")
        .select("id,type,position,config")
        .eq("flow_id", flow.id)
        .eq("type", "delivery")
        .order("position", { ascending: true })
    : { data: [] };

  const deliverySteps = (steps ?? []) as unknown as StepRow[];

  if (deliverySteps.length === 0) {
    await notify(
      payment.user_id,
      "warning",
      "Pagamento aprovado sem entrega configurada",
      "Adicione uma etapa de entrega no fluxo ativo deste bot.",
      "payment",
      payment.id,
    );
    return;
  }

  for (const step of deliverySteps) {
    const content = str((step.config ?? {}) as Record<string, unknown>, "content");
    let result: TelegramSendResult = { ok: false, error: "Lead sem Telegram ID" };
    if (bot?.token && lead?.telegram_id) {
      result = await sendMessage(
        bot.token,
        Number(lead.telegram_id),
        `✅ Pagamento confirmado!\n\n${content}`,
      );
    }

    await supabaseAdmin.from("deliveries").insert({
      user_id: payment.user_id,
      payment_id: payment.id,
      flow_step_id: step.id,
      status: result.ok ? "delivered" : "failed",
      delivered_at: result.ok ? new Date().toISOString() : null,
      error: result.ok ? null : (result.error ?? "Falha desconhecida"),
    });

    if (result.ok) {
      await logActivity(payment.user_id, "entrega", "produto entregue", payment.id);
    } else {
      await notify(
        payment.user_id,
        "error",
        "Falha na entrega automática",
        result.error,
        "payment",
        payment.id,
      );
      await logActivity(payment.user_id, "entrega", "falha na entrega", payment.id, { error: result.error });
    }
  }

  if (payment.lead_id) {
    await supabaseAdmin.from("leads").update({ status: "converted" }).eq("id", payment.lead_id);
  }
}
