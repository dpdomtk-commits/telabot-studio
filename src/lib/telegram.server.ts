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

type ConnectionRow = {
  source_step_id: string;
  target_step_id: string;
  source_handle: string | null;
};

/**
 * Executa o fluxo ativo de um bot para um lead percorrendo o grafo visual
 * (nós + conexões). Para nos nós de cobrança (aguardando pagamento),
 * nas perguntas/menus (aguardando resposta) e nos nós de entrega,
 * que só rodam após o pagamento aprovado.
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

  const [{ data: stepsData }, { data: connectionsData }] = await Promise.all([
    supabaseAdmin
      .from("flow_steps")
      .select("id,type,position,config")
      .eq("flow_id", flow.id)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("flow_connections")
      .select("source_step_id,target_step_id,source_handle")
      .eq("flow_id", flow.id),
  ]);

  const steps = (stepsData ?? []) as unknown as StepRow[];
  if (steps.length === 0) return;
  const connections = (connectionsData ?? []) as unknown as ConnectionRow[];
  const byId = new Map(steps.map((s) => [s.id, s]));

  const { data: execution } = await supabaseAdmin
    .from("flow_executions")
    .insert({ user_id: params.userId, flow_id: flow.id, lead_id: params.leadId, status: "running" })
    .select("id")
    .maybeSingle();

  const log = async (level: string, message: string, stepId?: string) => {
    await supabaseAdmin.from("flow_logs").insert({
      user_id: params.userId,
      flow_id: flow.id,
      execution_id: execution?.id ?? null,
      step_id: stepId ?? null,
      level,
      message,
    });
  };

  const finish = async (status: "completed" | "failed" | "waiting_payment", currentStepId?: string) => {
    if (!execution) return;
    await supabaseAdmin
      .from("flow_executions")
      .update({
        status,
        current_step_id: currentStepId ?? null,
        finished_at: status === "waiting_payment" ? null : new Date().toISOString(),
      })
      .eq("id", execution.id);
  };

  const nextStep = (stepId: string, handle = "saída"): StepRow | undefined => {
    const outgoing = connections.filter((c) => c.source_step_id === stepId);
    const match =
      outgoing.find((c) => (c.source_handle ?? "saída") === handle) ?? (outgoing.length === 1 ? outgoing[0] : undefined);
    return match ? byId.get(match.target_step_id) : undefined;
  };

  // Nó inicial: o "start" do canvas ou, sem ele, a primeira etapa.
  let current: StepRow | undefined = steps.find((s) => s.type === "start") ?? steps[0];
  if (current?.type === "start") current = nextStep(current.id);

  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.id)) break; // proteção contra laços infinitos
    visited.add(current.id);

    const step: StepRow = current;
    const config = (step.config ?? {}) as Record<string, unknown>;
    let result: TelegramSendResult = { ok: true };
    let handle = "saída";

    switch (step.type) {
      case "message":
      case "end":
        result = await sendMessage(params.token, params.chatId, str(config, "text") || str(config, "message") || "…");
        break;
      case "image":
        result = await sendPhoto(params.token, params.chatId, str(config, "file_id") || str(config, "url"), str(config, "caption"));
        break;
      case "video":
        result = await callTelegram(params.token, "sendVideo", {
          chat_id: params.chatId,
          video: str(config, "file_id") || str(config, "url"),
          caption: str(config, "caption") || undefined,
        });
        break;
      case "audio":
        result = await callTelegram(params.token, "sendAudio", {
          chat_id: params.chatId,
          audio: str(config, "file_id") || str(config, "url"),
          caption: str(config, "caption") || undefined,
        });
        break;
      case "document":
        result = await callTelegram(params.token, "sendDocument", {
          chat_id: params.chatId,
          document: str(config, "file_id") || str(config, "url"),
          caption: str(config, "caption") || undefined,
        });
        break;
      case "button": {
        const label = str(config, "label") || "Continuar";
        result = await sendMessage(params.token, params.chatId, str(config, "text") || label, {
          inline_keyboard: [[{ text: label, callback_data: `step:${step.id}` }]],
        });
        break;
      }
      case "menu": {
        const options = str(config, "options")
          .split("\n")
          .map((o) => o.trim())
          .filter(Boolean);
        result = await sendMessage(params.token, params.chatId, str(config, "text") || "Escolha uma opção", {
          inline_keyboard: options.map((o) => [{ text: o, callback_data: `menu:${step.id}:${o.slice(0, 24)}` }]),
        });
        break;
      }
      case "question":
        result = await sendMessage(params.token, params.chatId, str(config, "text") || "…");
        await finish("waiting_payment", step.id);
        return; // aguarda a resposta do lead
      case "delay": {
        const seconds = Math.min(Number(config["seconds"]) || 0, 5);
        if (seconds > 0) await new Promise((r) => setTimeout(r, seconds * 1000));
        break;
      }
      case "tag":
      case "untag":
        await logActivity(params.userId, "fluxo", `etiqueta ${str(config, "tag")}`, step.id);
        break;
      case "condition":
        handle = "sim";
        break;
      case "webhook":
      case "api": {
        const url = str(config, "url");
        if (url) {
          try {
            await fetch(url, {
              method: str(config, "method") || "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                event: str(config, "event") || "flow_step",
                lead_id: params.leadId,
                flow_id: flow.id,
                step_id: step.id,
              }),
            });
          } catch {
            result = { ok: false, error: "Falha ao chamar o endpoint externo" };
          }
        }
        break;
      }
      case "release_channel":
      case "release_group": {
        const message = str(config, "message") || "Seu acesso VIP foi liberado.";
        result = await sendMessage(params.token, params.chatId, message);
        break;
      }
      case "subscription": {
        const amount = Math.round((Number(config["amount"]) || 0) * 100);
        const intervalDays = Math.max(Number(config["interval_days"]) || 30, 1);
        const planName = str(config, "plan_name") || "Assinatura";
        await supabaseAdmin.from("subscriptions").insert({
          user_id: params.userId,
          bot_id: params.botId,
          lead_id: params.leadId,
          flow_id: flow.id,
          plan_name: planName,
          amount_cents: amount,
          interval_days: intervalDays,
          status: "past_due",
        });
        result = await sendCharge({ ...params, flowId: flow.id }, step, {
          amount,
          productName: planName,
          description: `${planName} · a cada ${intervalDays} dias`,
          successMessage: str(config, "success_message"),
          expiresMinutes: 0,
        });
        await finish("waiting_payment", step.id);
        return;
      }
      case "pix":
      case "payment":
      case "upsell":
      case "downsell":
      case "order_bump":
      case "pack": {
        const amount = Math.round((Number(config["amount"]) || 0) * 100);
        result = await sendCharge({ ...params, flowId: flow.id }, step, {
          amount,
          productName: str(config, "product_name") || null,
          description: str(config, "description") || str(config, "pitch") || "Pagamento",
          successMessage: str(config, "success_message"),
          expiresMinutes: Number(config["expires_minutes"]) || 0,
        });
        await finish("waiting_payment", step.id);
        return; // aguarda confirmação do pagamento
      }
      case "delivery":
        current = nextStep(step.id, handle);
        continue; // só roda após o pagamento aprovado
      default:
        break;
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
      await log("error", `Falha na etapa ${step.type}: ${result.error}`, step.id);
      await logActivity(params.userId, "fluxo", "falha no envio da etapa", step.id, { error: result.error });
      await finish("failed", step.id);
      return;
    }

    await log("info", `Etapa ${step.type} executada`, step.id);
    if (step.type === "end") break;
    current = nextStep(step.id, handle);
  }

  await finish("completed");
}

/** Cria a cobrança PIX de um nó de monetização e envia o copia e cola no Telegram. */
async function sendCharge(
  params: { userId: string; botId: string; token: string; leadId: string; chatId: number; flowId: string },
  step: StepRow,
  input: {
    amount: number;
    productName: string | null;
    description: string;
    successMessage: string;
    expiresMinutes: number;
  },
): Promise<TelegramSendResult> {
  const { createPixCharge } = await import("@/lib/finance.server");
  const charge = await createPixCharge({
    userId: params.userId,
    botId: params.botId,
    leadId: params.leadId,
    amountCents: input.amount,
    description: input.description,
    productName: input.productName,
    successMessage: input.successMessage || null,
    expiresAt:
      input.expiresMinutes > 0 ? new Date(Date.now() + input.expiresMinutes * 60000).toISOString() : null,
    idempotencyKey: `step:${step.id}:lead:${params.leadId}`,
    flowId: params.flowId,
  });

  const lines = [
    `<b>${input.productName ?? input.description}</b>`,
    `Valor: R$ ${(input.amount / 100).toFixed(2).replace(".", ",")}`,
  ];
  if (charge.pix_code) lines.push("", "PIX copia e cola:", `<code>${charge.pix_code}</code>`);
  if (input.expiresMinutes > 0) lines.push("", `Esta cobrança expira em ${input.expiresMinutes} minutos.`);
  lines.push("", "Assim que o PIX for confirmado, o produto é entregue automaticamente aqui.");

  const result = await sendMessage(params.token, params.chatId, lines.join("\n"));
  await logActivity(params.userId, "pagamento", "cobrança criada", charge.id);
  return result;
}


/** Entrega automática do produto após pagamento aprovado. */
export async function deliverForPayment(paymentId: string) {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id,user_id,bot_id,lead_id,amount_cents,description,success_message")
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
        `✅ ${payment.success_message ?? "Pagamento confirmado!"}\n\n${content}`,
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
