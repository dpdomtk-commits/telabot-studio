import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idSchema = z.object({ botId: z.string().uuid() });
const paymentSchema = z.object({
  paymentId: z.string().uuid(),
  status: z.enum(["pending", "approved", "failed", "refunded", "expired", "cancelled"]),
});

export type ActionResult = { ok: boolean; message: string };

/** Registra o webhook do Telegram apontando para este projeto. */
export const enableBotWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }): Promise<ActionResult> => {
    const [{ supabaseAdmin }, { setWebhook, publicBaseUrl, notify, logActivity, invalidateBotCache }] =
      await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("@/lib/telegram.server"),
      ]);

    const authBot = await context.supabase
      .from("bots")
      .select("id,user_id,name,token,webhook_secret")
      .eq("id", data.botId)
      .maybeSingle();
    const bot =
      authBot.data ??
      (
        await supabaseAdmin
          .from("bots")
          .select("id,user_id,name,token,webhook_secret")
          .eq("id", data.botId)
          .maybeSingle()
      ).data;
    if (!bot) return { ok: false, message: "Bot não encontrado" };

    const host = getRequest().headers.get("host") ?? "";
    const url = `${publicBaseUrl(host)}/api/public/telegram/${bot.id}`;
    const result = await setWebhook(bot.token, url, bot.webhook_secret);
    if (!result.ok) return { ok: false, message: result.error ?? "Falha ao registrar webhook" };

    const patch = { webhook_set_at: new Date().toISOString(), status: "active" as const };
    await Promise.allSettled([
      context.supabase.from("bots").update(patch).eq("id", bot.id),
      supabaseAdmin.from("bots").update(patch).eq("id", bot.id),
    ]);
    invalidateBotCache(bot.id);
    await notify(context.userId, "success", "Bot ativado", `${bot.name} está recebendo mensagens do Telegram.`, "bot", bot.id);
    await logActivity(context.userId, "bot", "ativado", bot.id);
    return { ok: true, message: "Webhook registrado" };
  });

/** Remove o webhook e desativa o bot. */
export const disableBotWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }): Promise<ActionResult> => {
    const [{ supabaseAdmin }, { deleteWebhook, notify, logActivity, invalidateBotCache }] =
      await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("@/lib/telegram.server"),
      ]);

    const authBot = await context.supabase
      .from("bots")
      .select("id,name,token")
      .eq("id", data.botId)
      .maybeSingle();
    const bot =
      authBot.data ??
      (
        await supabaseAdmin
          .from("bots")
          .select("id,name,token")
          .eq("id", data.botId)
          .maybeSingle()
      ).data;
    if (!bot) return { ok: false, message: "Bot não encontrado" };

    await deleteWebhook(bot.token);
    const patch = { webhook_set_at: null, status: "inactive" as const };
    await Promise.allSettled([
      context.supabase.from("bots").update(patch).eq("id", bot.id),
      supabaseAdmin.from("bots").update(patch).eq("id", bot.id),
    ]);
    invalidateBotCache(bot.id);
    await notify(context.userId, "info", "Bot desativado", `${bot.name} parou de responder no Telegram.`, "bot", bot.id);
    await logActivity(context.userId, "bot", "desativado", bot.id);
    return { ok: true, message: "Bot desativado" };
  });

/** Valida o token no Telegram, atualiza @username, re-registra webhook e limpa o cache. */
export const syncBotWebhookAndInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; username?: string | null }> => {
    const [{ supabaseAdmin }, { setWebhook, publicBaseUrl, invalidateBotCache, logActivity }] =
      await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("@/lib/telegram.server"),
      ]);

    const authBot = await context.supabase
      .from("bots")
      .select("id,name,token,webhook_secret")
      .eq("id", data.botId)
      .maybeSingle();
    const bot =
      authBot.data ??
      (
        await supabaseAdmin
          .from("bots")
          .select("id,name,token,webhook_secret")
          .eq("id", data.botId)
          .maybeSingle()
      ).data;
    if (!bot || !bot.token) return { ok: false, message: "Bot não encontrado" };

    let tgUser: { id: number; username?: string; first_name?: string } | undefined;
    try {
      const res = await fetch(`https://api.telegram.org/bot${bot.token}/getMe`);
      const json = (await res.json()) as {
        ok: boolean;
        description?: string;
        result?: { id: number; username?: string; first_name?: string };
      };
      if (!json.ok || !json.result) {
        return { ok: false, message: `Token recusado pelo Telegram: ${json.description ?? "inválido"}` };
      }
      tgUser = json.result;
    } catch {
      return { ok: false, message: "Não foi possível contatar os servidores do Telegram." };
    }

    const host = getRequest().headers.get("host") ?? "";
    const url = `${publicBaseUrl(host)}/api/public/telegram/${bot.id}`;
    const hookRes = await setWebhook(bot.token, url, bot.webhook_secret);
    if (!hookRes.ok) {
      return { ok: false, message: hookRes.error ?? "Falha ao registrar webhook no Telegram" };
    }

    const patch = {
      telegram_username: tgUser.username ?? null,
      telegram_bot_id: tgUser.id,
      status: "active" as const,
      webhook_set_at: new Date().toISOString(),
    };
    await Promise.allSettled([
      context.supabase.from("bots").update(patch).eq("id", bot.id),
      supabaseAdmin.from("bots").update(patch).eq("id", bot.id),
    ]);
    invalidateBotCache(bot.id);
    await logActivity(context.userId, "bot", "sincronizado e conectado", bot.id).catch(() => undefined);

    return {
      ok: true,
      message: `Bot @${tgUser.username ?? bot.name} sincronizado e online!`,
      username: tgUser.username ?? null,
    };
  });

/** Atualiza a situação de um pagamento PIX (dono ou admin) e dispara a entrega. */
export const updatePaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => paymentSchema.parse(data))
  .handler(async ({ data, context }): Promise<ActionResult> => {
    const { deliverForPayment, notify, logActivity } = await import("@/lib/telegram.server");

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    const { data: payment } = await context.supabase
      .from("payments")
      .select("id,user_id,status,amount_cents,description")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!payment) return { ok: false, message: "Pagamento não encontrado" };
    if (!isAdmin && payment.user_id !== context.userId) {
      return { ok: false, message: "Sem permissão" };
    }

    if (data.status === "approved") {
      if (payment.status === "approved") return { ok: true, message: "Pagamento já aprovado" };
      const { creditPayment } = await import("@/lib/finance.server");
      const credited = await creditPayment(payment.id);
      if (!credited.ok) return { ok: false, message: credited.message || "Falha ao creditar" };
      if (!credited.duplicate) {
        const { applyGatewaySplits } = await import("@/lib/payments/gateways.server");
        await applyGatewaySplits(payment.id);
      }


      await logActivity(payment.user_id, "pagamento", "situação alterada para approved", payment.id);
      await notify(
        payment.user_id,
        "success",
        "Pagamento recebido",
        `${payment.description ?? "Cobrança"} · R$ ${(payment.amount_cents / 100).toFixed(2).replace(".", ",")} creditado na carteira`,
        "payment",
        payment.id,
      );
      if (!credited.duplicate) await deliverForPayment(payment.id);
      return { ok: true, message: "Pagamento confirmado" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("payments")
      .update({ status: data.status, paid_at: null })
      .eq("id", payment.id);
    if (error) return { ok: false, message: error.message };

    await logActivity(payment.user_id, "pagamento", `situação alterada para ${data.status}`, payment.id);
    return { ok: true, message: "Situação atualizada" };
  });

