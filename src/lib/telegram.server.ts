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

/** URL pública estável do projeto (o Telegram só aceita hosts públicos HTTPS). */
const STABLE_PUBLIC_URL = "https://project--bc07337f-068d-4ee7-a47b-447c0c8aa62c-dev.lovable.app";

export function publicBaseUrl(_host?: string): string {
  // Sempre o host estável de preview: recebe o build mais recente do projeto.
  return STABLE_PUBLIC_URL;
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
 * Resolve qual fluxo o bot deve executar: o ativo e, se nenhum estiver
 * marcado como ativo, o fluxo mais recente que já tenha etapas compiladas.
 * Assim o /start nunca fica mudo por causa de um flag esquecido.
 */
async function resolveBotFlow(botId: string): Promise<{ id: string } | null> {
  const { data: active } = await supabaseAdmin
    .from("flows")
    .select("id")
    .eq("bot_id", botId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) return active;

  const { data: candidates } = await supabaseAdmin
    .from("flows")
    .select("id,flow_steps(id)")
    .eq("bot_id", botId)
    .order("updated_at", { ascending: false })
    .limit(10);

  const withSteps = (candidates ?? []).find(
    (f) => Array.isArray((f as { flow_steps?: unknown[] }).flow_steps) && (f as { flow_steps: unknown[] }).flow_steps.length > 0,
  );
  return withSteps ? { id: (withSteps as { id: string }).id } : null;
}

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
  /** Retoma o fluxo a partir da saída desta etapa (clique em botão/menu). */
  resumeFromStepId?: string | undefined;
  resumeHandle?: string | undefined;
}) {
  const flow = await resolveBotFlow(params.botId);
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
      outgoing.find((c) => (c.source_handle ?? "saída") === handle) ?? outgoing[0];
    return match ? byId.get(match.target_step_id) : undefined;
  };

  // Nó inicial: retomada por clique, o "start" do canvas ou a primeira etapa.
  let current: StepRow | undefined;
  if (params.resumeFromStepId) {
    current = nextStep(params.resumeFromStepId, params.resumeHandle ?? "saída");
    if (!current) {
      await finish("completed");
      return;
    }
  } else {
    current = steps.find((s) => s.type === "start") ?? steps[0];
    if (current?.type === "start") current = nextStep(current.id);
  }

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
          platformFeePercent:
            config["platform_fee_percent"] === undefined || config["platform_fee_percent"] === ""
              ? null
              : Number(config["platform_fee_percent"]),
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
      const mediaStep = ["image", "video", "audio", "document"].includes(step.type);
      await notify(
        params.userId,
        mediaStep ? "warning" : "error",
        mediaStep ? "Mídia do fluxo não pôde ser enviada" : "Falha ao enviar etapa do fluxo",
        `Etapa "${step.type}": ${result.error}`,
        "flow_step",
        step.id,
      );
      await log(mediaStep ? "warn" : "error", `Falha na etapa ${step.type}: ${result.error}`, step.id);
      await logActivity(params.userId, "fluxo", "falha no envio da etapa", step.id, { error: result.error });
      if (!mediaStep) {
        await finish("failed", step.id);
        return;
      }
      // Mídia inválida (ex.: file_id de outro bot) não interrompe o funil.
      current = nextStep(step.id, handle);
      continue;
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
    platformFeePercent?: number | null;
    payerName?: string | null;
  },
): Promise<TelegramSendResult> {
  const { createPixCharge } = await import("@/lib/finance.server");
  let charge: { id: string; pix_code?: string | null };
  try {
    charge = await createPixCharge({
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
    platformFeePercent: input.platformFeePercent ?? null,
      payerName: input.payerName ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar a cobrança";
    await notify(
      params.userId,
      "error",
      "Não foi possível gerar o PIX",
      `${message}. Configure uma gateway de pagamento ou a chave PIX da plataforma.`,
      "flow_step",
      step.id,
    );
    await sendMessage(
      params.token,
      params.chatId,
      "Não conseguimos gerar o pagamento agora. Tente novamente em instantes.",
    );
    return { ok: false, error: message };
  }

  if (!charge.pix_code) {
    await notify(
      params.userId,
      "error",
      "Cobrança criada sem código PIX",
      "A gateway não retornou o código copia e cola. Verifique as credenciais em Gateways.",
      "flow_step",
      step.id,
    );
  }

  const lines = [
    `<b>${input.productName ?? input.description}</b>`,
    `Valor: R$ ${(input.amount / 100).toFixed(2).replace(".", ",")}`,
  ];
  if (charge.pix_code) lines.push("", "PIX copia e cola:", `<code>${charge.pix_code}</code>`);
  if (input.expiresMinutes > 0) lines.push("", `Esta cobrança expira em ${input.expiresMinutes} minutos.`);
  lines.push("", "Assim que o PIX for confirmado, o produto é entregue automaticamente aqui.");

  // QR Code do PIX enviado como imagem, além do copia e cola.
  if (charge.pix_code) {
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=12&data=${encodeURIComponent(
      charge.pix_code,
    )}`;
    await sendPhoto(params.token, params.chatId, qr, "Escaneie o QR Code para pagar");
  }

  const result = await sendMessage(params.token, params.chatId, lines.join("\n"));
  // Order bump: ofertas complementares logo após o PIX principal.
  if (result.ok) {
    await sendFlowOffers({
      token: params.token,
      chatId: params.chatId,
      flowId: params.flowId,
      kind: "order_bump",
    });
  }

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

  const flow = await resolveBotFlow(payment.bot_id);

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

  // Upsell: oferta enviada logo após o pagamento aprovado.
  if (flow && bot?.token && lead?.telegram_id) {
    await sendFlowOffers({
      token: bot.token,
      chatId: Number(lead.telegram_id),
      flowId: flow.id,
      kind: "upsell",
    });
  }

  if (payment.lead_id) {
    await supabaseAdmin.from("leads").update({ status: "converted" }).eq("id", payment.lead_id);
  }

}

/* ──────────────── Ofertas por fluxo (order bump, upsell, downsell) ──────────────── */

type OfferRow = {
  id: string;
  name: string;
  pitch: string | null;
  description: string | null;
  amount_cents: number;
};

/**
 * Envia as ofertas ativas de um fluxo como botões.
 * Cada botão gera o PIX daquela oferta somente quando clicado.
 */
export async function sendFlowOffers(args: {
  token: string;
  chatId: number;
  flowId: string;
  kind: "order_bump" | "upsell" | "downsell";
}) {
  const { data } = await supabaseAdmin
    .from("flow_offers")
    .select("id,name,pitch,description,amount_cents")
    .eq("flow_id", args.flowId)
    .eq("kind", args.kind)
    .eq("is_active", true)
    .order("position", { ascending: true });

  const offers = (data ?? []) as OfferRow[];
  if (offers.length === 0) return;

  const title =
    args.kind === "order_bump"
      ? "🎁 Aproveite também"
      : args.kind === "upsell"
        ? "🚀 Oferta especial para você"
        : "💡 Que tal uma opção mais leve?";

  const lines = [`<b>${title}</b>`];
  for (const offer of offers) {
    const pitch = offer.pitch ?? offer.description ?? "";
    lines.push(
      `\n• <b>${offer.name}</b> — R$ ${(offer.amount_cents / 100).toFixed(2).replace(".", ",")}${
        pitch ? `\n${pitch}` : ""
      }`,
    );
  }

  await sendMessage(args.token, args.chatId, lines.join("\n"), {
    inline_keyboard: offers.map((offer) => [
      {
        text: `${offer.name} · R$ ${(offer.amount_cents / 100).toFixed(2).replace(".", ",")}`,
        callback_data: `offer:${offer.id}`,
      },
    ]),
  });
}

/** Gera e envia o PIX de uma oferta clicada no Telegram. */
export async function sendOfferCharge(args: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
  offerId: string;
}) {
  const { data: offer } = await supabaseAdmin
    .from("flow_offers")
    .select("id,flow_id,name,pitch,description,amount_cents,is_active")
    .eq("id", args.offerId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (!offer || !offer.is_active) return;

  const { createPixCharge } = await import("@/lib/finance.server");
  try {
    const charge = await createPixCharge({
      userId: args.userId,
      botId: args.botId,
      leadId: args.leadId,
      amountCents: offer.amount_cents,
      description: offer.pitch ?? offer.description ?? offer.name,
      productName: offer.name,
      idempotencyKey: `offer:${offer.id}:lead:${args.leadId}`,
      flowId: offer.flow_id,
    });

    const lines = [
      `<b>${offer.name}</b>`,
      `Valor: R$ ${(offer.amount_cents / 100).toFixed(2).replace(".", ",")}`,
    ];
    if (charge.pix_code) {
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=12&data=${encodeURIComponent(
        charge.pix_code,
      )}`;
      await sendPhoto(args.token, args.chatId, qr, "Escaneie o QR Code para pagar");
      lines.push("", "PIX copia e cola:", `<code>${charge.pix_code}</code>`);
    }
    lines.push("", "Assim que o PIX for confirmado, liberamos o acesso automaticamente.");
    await sendMessage(args.token, args.chatId, lines.join("\n"));
    await logActivity(args.userId, "pagamento", "cobrança de oferta criada", charge.id);
  } catch (error) {
    await sendMessage(
      args.token,
      args.chatId,
      "Não conseguimos gerar o pagamento desta oferta agora. Tente novamente em instantes.",
    );
    await notify(
      args.userId,
      "error",
      "Falha ao gerar PIX da oferta",
      error instanceof Error ? error.message : "Erro desconhecido",
      "flow_offer",
      offer.id,
    );
  }
}
