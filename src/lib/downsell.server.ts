import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  resolveBotFlow,
  sendMessage,
  sendPhoto,
  sendVideo,
  getLeadPreferences,
} from "@/lib/telegram.server";
import { normalizeAdvancedConfig, type SequenceStep } from "@/lib/flow-advanced";

export type DownsellItem = {
  id: string;
  trigger_type: "start" | "pix";
  chat_id: number;
  bot_id: string;
  user_id: string;
  lead_id: string;
  flow_id: string;
  sequence_id: string;
  sequence_title: string;
  order_id?: string | null;
  scheduled_for: string; // ISO 8601 UTC
  status: "pending" | "sent" | "cancelled" | "failed";
  sequence: SequenceStep;
  created_at: string;
  attempts?: number;
  error?: string;
};

/**
 * Calcula o atraso em milissegundos para uma sequência de downsell.
 */
function computeDelayMs(seq: SequenceStep): number {
  const val = Number(seq.delayValue) || 15;
  switch (seq.delayUnit) {
    case "seconds":
      return Math.max(val, 5) * 1000;
    case "hours":
      return Math.max(val, 1) * 3600 * 1000;
    case "days":
      return Math.max(val, 1) * 86400 * 1000;
    case "minutes":
    default:
      return Math.max(val, 1) * 60 * 1000;
  }
}

/**
 * GATILHO 1: Agenda os downsells pós-/start (Abandono Inicial)
 * Disparado quando o lead dá /start e não comprou.
 */
export async function scheduleStartDownsells(params: {
  userId: string;
  botId: string;
  leadId: string;
  chatId: number;
  flowId?: string;
}): Promise<number> {
  try {
    const flow = params.flowId
      ? { id: params.flowId, simple_config: null }
      : await resolveBotFlow(params.botId);

    if (!flow?.id) return 0;

    let simpleConfig = flow.simple_config;
    if (!simpleConfig) {
      const { data: dbFlow } = await supabaseAdmin
        .from("flows")
        .select("simple_config")
        .eq("id", flow.id)
        .maybeSingle();
      simpleConfig = dbFlow?.simple_config;
    }

    const cfg = normalizeAdvancedConfig(simpleConfig as any);
    if (!cfg.downsell?.enabled) return 0;

    const sequences = cfg.downsell.startSequences ?? [];
    const activeSequences = sequences.filter((s) => s.enabled);
    if (activeSequences.length === 0) return 0;

    // Verifica se o lead já tem pedido pago aprovado antes de agendar
    const { data: paid } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("lead_id", params.leadId)
      .eq("status", "approved")
      .limit(1)
      .maybeSingle();

    if (paid) {
      console.log(`[downsell] Lead ${params.leadId} já possui pedido pago aprovado. Ignorando agendamento de /start.`);
      return 0;
    }

    let scheduledCount = 0;
    const now = Date.now();

    for (const seq of activeSequences) {
      const delayMs = computeDelayMs(seq);
      const scheduledFor = new Date(now + delayMs).toISOString();
      const entityId = `start:${params.botId}:${params.leadId}:${seq.id}`;

      // Evita duplicidade se já houver agendamento pendente para a mesma sequência
      const { data: existing } = await supabaseAdmin
        .from("activity_logs")
        .select("id")
        .eq("entity", "scheduled_downsell")
        .eq("entity_id", entityId)
        .eq("action", "pending")
        .limit(1)
        .maybeSingle();

      if (existing) continue;

      const payload: DownsellItem = {
        id: `ds-start-${now}-${Math.random().toString(36).slice(2, 7)}`,
        trigger_type: "start",
        chat_id: params.chatId,
        bot_id: params.botId,
        user_id: params.userId,
        lead_id: params.leadId,
        flow_id: flow.id,
        sequence_id: seq.id,
        sequence_title: seq.title || "Downsell Início /start",
        scheduled_for: scheduledFor,
        status: "pending",
        sequence: seq,
        created_at: new Date(now).toISOString(),
      };

      await supabaseAdmin.from("activity_logs").insert({
        user_id: params.userId,
        entity: "scheduled_downsell",
        entity_id: entityId,
        action: "pending",
        metadata: payload as unknown as Record<string, unknown>,
      });

      scheduledCount++;
    }

    console.log(`[downsell] Agendados ${scheduledCount} downsell(s) de /start para lead ${params.leadId}.`);
    return scheduledCount;
  } catch (error) {
    console.error("[downsell-schedule-start-error]", error);
    return 0;
  }
}

/**
 * GATILHO 2: Agenda os downsells pós-PIX / Checkout Gerado (Carrinho Abandonado)
 * Disparado assim que um PIX ou checkout é gerado para o lead.
 */
export async function schedulePixDownsells(params: {
  userId: string;
  botId: string;
  leadId: string;
  chatId: number;
  orderId: string;
  flowId?: string;
}): Promise<number> {
  try {
    const flow = params.flowId
      ? { id: params.flowId, simple_config: null }
      : await resolveBotFlow(params.botId);

    if (!flow?.id) return 0;

    let simpleConfig = flow.simple_config;
    if (!simpleConfig) {
      const { data: dbFlow } = await supabaseAdmin
        .from("flows")
        .select("simple_config")
        .eq("id", flow.id)
        .maybeSingle();
      simpleConfig = dbFlow?.simple_config;
    }

    const cfg = normalizeAdvancedConfig(simpleConfig as any);
    if (!cfg.downsell?.enabled) return 0;

    const sequences = cfg.downsell.pixSequences ?? [];
    const activeSequences = sequences.filter((s) => s.enabled);
    if (activeSequences.length === 0) return 0;

    let scheduledCount = 0;
    const now = Date.now();

    for (const seq of activeSequences) {
      const delayMs = computeDelayMs(seq);
      const scheduledFor = new Date(now + delayMs).toISOString();
      const entityId = `pix:${params.botId}:${params.leadId}:${seq.id}:${params.orderId}`;

      const { data: existing } = await supabaseAdmin
        .from("activity_logs")
        .select("id")
        .eq("entity", "scheduled_downsell")
        .eq("entity_id", entityId)
        .eq("action", "pending")
        .limit(1)
        .maybeSingle();

      if (existing) continue;

      const payload: DownsellItem = {
        id: `ds-pix-${now}-${Math.random().toString(36).slice(2, 7)}`,
        trigger_type: "pix",
        order_id: params.orderId,
        chat_id: params.chatId,
        bot_id: params.botId,
        user_id: params.userId,
        lead_id: params.leadId,
        flow_id: flow.id,
        sequence_id: seq.id,
        sequence_title: seq.title || "Downsell PIX Pendente",
        scheduled_for: scheduledFor,
        status: "pending",
        sequence: seq,
        created_at: new Date(now).toISOString(),
      };

      await supabaseAdmin.from("activity_logs").insert({
        user_id: params.userId,
        entity: "scheduled_downsell",
        entity_id: entityId,
        action: "pending",
        metadata: payload as unknown as Record<string, unknown>,
      });

      scheduledCount++;
    }

    console.log(`[downsell] Agendados ${scheduledCount} downsell(s) de PIX para lead ${params.leadId} (Pedido: ${params.orderId}).`);
    return scheduledCount;
  } catch (error) {
    console.error("[downsell-schedule-pix-error]", error);
    return 0;
  }
}

/**
 * CANCELAMENTO IMEDIATO: Cancela todos os downsells pendentes de um lead
 * ou pedido específico assim que o pagamento for aprovado.
 */
export async function cancelPendingDownsells(params: {
  leadId: string;
  orderId?: string;
}): Promise<number> {
  try {
    const { data: pendingRows } = await supabaseAdmin
      .from("activity_logs")
      .select("id,metadata")
      .eq("entity", "scheduled_downsell")
      .eq("action", "pending")
      .limit(100);

    if (!pendingRows || pendingRows.length === 0) return 0;

    let cancelledCount = 0;
    const nowIso = new Date().toISOString();

    for (const row of pendingRows) {
      const meta = (row.metadata as unknown as DownsellItem) || {};
      const matchLead = meta.lead_id === params.leadId;
      const matchOrder = params.orderId && meta.order_id === params.orderId;

      if (matchLead || matchOrder) {
        await supabaseAdmin
          .from("activity_logs")
          .update({
            action: "cancelled",
            metadata: {
              ...meta,
              status: "cancelled",
              cancelled_at: nowIso,
              cancellation_reason: "payment_approved",
            },
          })
          .eq("id", row.id);

        cancelledCount++;
      }
    }

    if (cancelledCount > 0) {
      console.log(`[downsell] ${cancelledCount} downsell(s) cancelado(s) para lead ${params.leadId} (pagamento confirmado).`);
    }

    return cancelledCount;
  } catch (error) {
    console.error("[downsell-cancel-error]", error);
    return 0;
  }
}

/**
 * WORKER / CRON: Processa e dispara os downsells com status = 'pending'
 * e scheduled_for <= NOW(), respeitando o idioma do lead e cancelando
 * automaticamente se o lead já tiver pago.
 */
export async function processScheduledDownsells(): Promise<{
  processed: number;
  sent: number;
  cancelled: number;
  errors: number;
}> {
  const result = { processed: 0, sent: 0, cancelled: 0, errors: 0 };
  const now = new Date();

  try {
    // Busca até 50 itens pendentes
    const { data: pendingRows, error } = await supabaseAdmin
      .from("activity_logs")
      .select("id,user_id,metadata")
      .eq("entity", "scheduled_downsell")
      .eq("action", "pending")
      .order("created_at", { ascending: true })
      .limit(50);

    if (error || !pendingRows || pendingRows.length === 0) {
      return result;
    }

    for (const row of pendingRows) {
      const item = (row.metadata as unknown as DownsellItem) || {};
      if (!item.scheduled_for) continue;

      const scheduledTime = new Date(item.scheduled_for);
      // Se ainda não chegou o horário agendado, pula
      if (scheduledTime > now) continue;

      result.processed++;

      try {
        // 1. Verificação crucial: se o lead já pagou, cancela imediatamente
        const { data: paid } = await supabaseAdmin
          .from("payments")
          .select("id")
          .eq("lead_id", item.lead_id)
          .eq("status", "approved")
          .limit(1)
          .maybeSingle();

        if (paid) {
          await supabaseAdmin
            .from("activity_logs")
            .update({
              action: "cancelled",
              metadata: {
                ...item,
                status: "cancelled",
                cancelled_at: now.toISOString(),
                cancellation_reason: "lead_already_paid",
              },
            })
            .eq("id", row.id);

          result.cancelled++;
          console.log(`[downsell] Cancelado downsell ${item.id} - lead ${item.lead_id} já realizou pagamento.`);
          continue;
        }

        // 2. Busca o bot e token
        const { data: bot } = await supabaseAdmin
          .from("bots")
          .select("id,token,status")
          .eq("id", item.bot_id)
          .maybeSingle();

        if (!bot || !bot.token || bot.status === "paused") {
          console.warn(`[downsell] Bot ${item.bot_id} não encontrado ou pausado. Pulando envio.`);
          continue;
        }

        // 3. Respeita o idioma selecionado pelo lead
        const prefs = await getLeadPreferences(item.lead_id);
        const lang = prefs.language || "pt";

        const seq = item.sequence;
        if (!seq) {
          console.warn(`[downsell] Sequência ausente no item ${item.id}.`);
          continue;
        }

        // 4. Monta a copy e botões da oferta de Downsell
        const copyText = seq.message?.trim() || "Aproveite esta condição especial exclusiva para você hoje!";

        const inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

        if (seq.plans && seq.plans.length > 0) {
          for (const plan of seq.plans) {
            const price = plan.discountPrice || plan.originalPrice || 0;
            const priceFormatted =
              lang === "en"
                ? `$ ${price.toFixed(2)}`
                : `R$ ${price.toFixed(2).replace(".", ",")}`;
            const btnLabel = `🔥 ${plan.name} por ${priceFormatted}`;
            inline_keyboard.push([
              {
                text: btnLabel,
                callback_data: `downsell_pay:${seq.id}:${plan.id}`,
              },
            ]);
          }
        }

        // 5. Envia com mídia (se houver) ou mensagem de texto nativa
        const hasMedia = seq.media && seq.media.length > 0 && (seq.media[0].fileId || seq.media[0].url);

        let sendResult = { ok: false };
        if (hasMedia) {
          const m = seq.media[0];
          const mediaRef = m.fileId || m.url || "";
          if (m.kind === "video") {
            sendResult = await sendVideo(bot.token, item.chat_id, mediaRef, {
              caption: copyText,
              reply_markup: inline_keyboard.length ? { inline_keyboard } : undefined,
            });
          } else {
            sendResult = await sendPhoto(bot.token, item.chat_id, mediaRef, {
              caption: copyText,
              reply_markup: inline_keyboard.length ? { inline_keyboard } : undefined,
            });
          }
        } else {
          sendResult = await sendMessage(
            bot.token,
            item.chat_id,
            copyText,
            inline_keyboard.length ? { inline_keyboard } : undefined
          );
        }

        if (sendResult.ok) {
          // 6. Marca como enviado com sucesso
          await supabaseAdmin
            .from("activity_logs")
            .update({
              action: "sent",
              metadata: {
                ...item,
                status: "sent",
                sent_at: now.toISOString(),
              },
            })
            .eq("id", row.id);

          result.sent++;
          console.log(`[downsell] Disparado com sucesso: ${item.sequence_title} para chat ${item.chat_id} (Lead: ${item.lead_id}).`);

          // Registra no log de atividades para visibilidade no painel admin
          await supabaseAdmin.from("activity_logs").insert({
            user_id: row.user_id,
            entity: "downsell_execution",
            action: "downsell_sent",
            entity_id: item.lead_id,
            metadata: {
              trigger_type: item.trigger_type,
              sequence_title: item.sequence_title,
              chat_id: item.chat_id,
              bot_id: item.bot_id,
              sent_at: now.toISOString(),
            },
          });
        } else {
          // Incrementa tentativas e registra erro
          const attempts = (item.attempts || 0) + 1;
          const status = attempts >= 3 ? "failed" : "pending";
          await supabaseAdmin
            .from("activity_logs")
            .update({
              action: status,
              metadata: {
                ...item,
                attempts,
                status,
                last_error: "Falha ao enviar mensagem no Telegram",
                last_attempt_at: now.toISOString(),
              },
            })
            .eq("id", row.id);

          result.errors++;
        }
      } catch (itemErr: any) {
        console.error(`[downsell-item-error] Falha ao processar item ${item.id}:`, itemErr);
        result.errors++;
      }
    }

    return result;
  } catch (error) {
    console.error("[downsell-worker-error]", error);
    return result;
  }
}

/**
 * Processa a compra de um plano pelo botão de Downsell no Telegram.
 * Gera a cobrança PIX com o valor promocional e envia o código copia e cola.
 */
export async function handleDownsellPurchase(params: {
  userId: string;
  botId: string;
  token: string;
  leadId: string;
  chatId: number;
  seqId: string;
  planId: string;
}) {
  try {
    const flow = await resolveBotFlow(params.botId);
    let simpleConfig = flow?.simple_config;
    if (!simpleConfig && flow?.id) {
      const { data: dbFlow } = await supabaseAdmin
        .from("flows")
        .select("simple_config")
        .eq("id", flow.id)
        .maybeSingle();
      simpleConfig = dbFlow?.simple_config;
    }

    const cfg = normalizeAdvancedConfig(simpleConfig as any);
    const allSeqs = [
      ...(cfg.downsell?.startSequences ?? []),
      ...(cfg.downsell?.pixSequences ?? []),
      ...(cfg.downsell?.sequences ?? []),
    ];

    const seq = allSeqs.find((s) => s.id === params.seqId);
    const plan = seq?.plans?.find((p) => p.id === params.planId) || seq?.plans?.[0] || {
      id: params.planId,
      name: "Oferta Especial Downsell",
      discountPrice: 7.9,
      duration: "Acesso Vitalício",
    };

    const amountCents = Math.round(Number(plan.discountPrice || 7.9) * 100);

    const { createPixCharge } = await import("@/lib/finance.server");
    const charge = await createPixCharge({
      userId: params.userId,
      botId: params.botId,
      leadId: params.leadId,
      amountCents,
      description: `Downsell · ${plan.name} (${plan.duration || "Acesso Imediato"})`,
      productName: plan.name,
      successMessage: "Pagamento confirmado! Seu acesso promocional foi liberado com sucesso!",
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
      idempotencyKey: `downsell:${params.seqId}:${plan.id}:${params.leadId}`,
      flowId: flow?.id || null,
    });

    const priceFormatted = (amountCents / 100).toFixed(2).replace(".", ",");
    const lines = [
      `🔥 <b>OFERTA ESPECIAL: ${plan.name}</b>`,
      `Valor exclusivo: <b>R$ ${priceFormatted}</b>`,
    ];

    if (charge.pix_code) {
      lines.push("", "PIX copia e cola:", `<code>${charge.pix_code}</code>`);
    }
    lines.push("", "Assim que o PIX for confirmado, seu acesso é liberado instantaneamente!");

    const replyMarkup = {
      inline_keyboard: [
        [{ text: "✅ Já realizei o pagamento", callback_data: `check_payment:${charge.id}` }],
        [{ text: "↩️ Voltar aos Planos", callback_data: "nav:plans" }],
      ],
    };

    await sendMessage(params.token, params.chatId, lines.join("\n"), replyMarkup);

    // Agenda o downsell de PIX pendente para esta cobrança
    await schedulePixDownsells({
      userId: params.userId,
      botId: params.botId,
      leadId: params.leadId,
      chatId: params.chatId,
      orderId: charge.id,
      flowId: flow?.id,
    });
  } catch (error) {
    console.error("[downsell-purchase-error]", error);
    await sendMessage(
      params.token,
      params.chatId,
      "Não foi possível gerar a cobrança da oferta no momento. Por favor tente novamente em alguns instantes."
    );
  }
}
