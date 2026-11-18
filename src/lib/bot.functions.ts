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

type RegisterWebhookContext = {
  supabase: any;
  supabaseAdmin: any;
  host?: string;
  bot: { id: string; user_id: string; name: string; token: string; webhook_secret: string | null };
  preloadedFlow?: { id: string; is_active: boolean; simple_config: unknown } | null;
};

/** Resolve o fluxo ativo do bot, aquece os caches em memória e registra o webhook auto-contido no Telegram. */
async function registerSelfContainedBotWebhook(args: RegisterWebhookContext) {
  const [
    {
      setWebhook,
      buildBotWebhookUrl,
      invalidateBotCache,
      setCachedBotConfig,
      primeBotDbCache,
    },
    { normalizeAdvancedConfig },
  ] = await Promise.all([
    import("@/lib/telegram.server"),
    import("@/lib/flow-advanced"),
  ]);

  let flow = args.preloadedFlow ?? null;
  if (!flow) {
    const authFlow = await args.supabase
      .from("flows")
      .select("id,is_active,simple_config")
      .eq("bot_id", args.bot.id)
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    flow =
      authFlow.data ??
      (
        await args.supabaseAdmin
          .from("flows")
          .select("id,is_active,simple_config")
          .eq("bot_id", args.bot.id)
          .order("is_active", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data;
  }

  const normalizedCfg = normalizeAdvancedConfig(flow?.simple_config as any);
  const webhookUrl = buildBotWebhookUrl({
    host: args.host,
    botId: args.bot.id,
    token: args.bot.token,
    userId: args.bot.user_id,
    secret: args.bot.webhook_secret,
    cfg: normalizedCfg,
  });

  const result = await setWebhook(args.bot.token, webhookUrl, args.bot.webhook_secret ?? "");
  if (result.ok) {
    invalidateBotCache(args.bot.id);
    if (flow) {
      setCachedBotConfig(args.bot.id, flow, normalizedCfg);
    } else {
      setCachedBotConfig(args.bot.id, { id: args.bot.id, is_active: true, simple_config: normalizedCfg }, normalizedCfg);
    }
    primeBotDbCache({
      id: args.bot.id,
      user_id: args.bot.user_id,
      token: args.bot.token,
      status: "active",
      webhook_secret: args.bot.webhook_secret,
    });
  }
  return result;
}

/** Registra o webhook do Telegram apontando para este projeto. */
export const enableBotWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }): Promise<ActionResult> => {
    const [{ supabaseAdmin }, { notify, logActivity }] = await Promise.all([
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
    const result = await registerSelfContainedBotWebhook({
      supabase: context.supabase,
      supabaseAdmin,
      host,
      bot,
    });
    if (!result.ok) return { ok: false, message: result.error ?? "Falha ao registrar webhook" };

    const patch = { webhook_set_at: new Date().toISOString(), status: "active" as const };
    await Promise.allSettled([
      context.supabase.from("bots").update(patch).eq("id", bot.id),
      supabaseAdmin.from("bots").update(patch).eq("id", bot.id),
    ]);
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
    const [{ supabaseAdmin }, { logActivity }] = await Promise.all([
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
    const hookRes = await registerSelfContainedBotWebhook({
      supabase: context.supabase,
      supabaseAdmin,
      host,
      bot,
    });
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
    await logActivity(context.userId, "bot", "sincronizado e conectado", bot.id).catch(() => undefined);

    return {
      ok: true,
      message: `Bot @${tgUser.username ?? bot.name} sincronizado e online!`,
      username: tgUser.username ?? null,
    };
  });

/** Sincroniza automaticamente os webhooks auto-contidos de todos os bots do usuário. */
export const syncAllUserBotsWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; synced: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const host = getRequest().headers.get("host") ?? "";

    const [botsRes, flowsRes] = await Promise.all([
      context.supabase
        .from("bots")
        .select("id,user_id,name,token,status,webhook_secret")
        .eq("user_id", context.userId),
      context.supabase
        .from("flows")
        .select("id,bot_id,is_active,simple_config,updated_at")
        .eq("user_id", context.userId)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false }),
    ]);

    const bots = (botsRes.data ?? []).filter((b: any) => b?.id && b?.token);
    const flows = flowsRes.data ?? [];
    if (bots.length === 0) return { ok: true, synced: 0 };

    let synced = 0;
    await Promise.allSettled(
      bots.map(async (bot: any) => {
        const chosenFlow =
          flows.find((f: any) => f.bot_id === bot.id && f.is_active) ??
          flows.find((f: any) => f.bot_id === bot.id) ??
          flows.find((f: any) => Array.isArray(f?.simple_config?.bots?.linkedBots) && f.simple_config.bots.linkedBots.includes(bot.id)) ??
          flows[0] ??
          null;

        const hookRes = await registerSelfContainedBotWebhook({
          supabase: context.supabase,
          supabaseAdmin,
          host,
          bot: {
            id: bot.id,
            user_id: bot.user_id || context.userId,
            name: bot.name,
            token: bot.token,
            webhook_secret: bot.webhook_secret ?? null,
          },
          preloadedFlow: chosenFlow,
        });
        if (hookRes.ok) {
          synced += 1;
          if (bot.status !== "active") {
            const patch = { status: "active" as const, webhook_set_at: new Date().toISOString() };
            await Promise.allSettled([
              context.supabase.from("bots").update(patch).eq("id", bot.id),
              supabaseAdmin.from("bots").update(patch).eq("id", bot.id),
            ]);
          }
        }
      }),
    );

    return { ok: true, synced };
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

const registerAccountSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
});

export const registerCashBotAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => registerAccountSchema.parse(data))
  .handler(async ({ data }): Promise<{ autoConfirmed: boolean; message?: string }> => {
    try {
      const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] || "";
      if (!serviceKey || serviceKey.startsWith("sb_publishable_")) {
        return { autoConfirmed: false };
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: {
          name: data.name,
          full_name: data.name,
          app_name: "CASH BOT",
          site_name: "CASH BOT",
          brand: "CASH BOT",
        },
      });
      if (error || !created?.user) {
        return { autoConfirmed: false, message: error?.message };
      }
      return { autoConfirmed: true };
    } catch {
      return { autoConfirmed: false };
    }
  });

