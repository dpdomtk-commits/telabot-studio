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
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }): Promise<ActionResult> => {
    const { setWebhook, publicBaseUrl, notify, logActivity } = await import("@/lib/telegram.server");

    const { data: bot } = await context.supabase
      .from("bots")
      .select("id,name,token,webhook_secret")
      .eq("id", data.botId)
      .maybeSingle();
    if (!bot) return { ok: false, message: "Bot não encontrado" };

    const host = getRequest().headers.get("host") ?? "";
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
      return { ok: false, message: "Publique o projeto para registrar o webhook do Telegram" };
    }

    const url = `${publicBaseUrl(host)}/api/public/telegram/${bot.id}`;
    const result = await setWebhook(bot.token, url, bot.webhook_secret);
    if (!result.ok) return { ok: false, message: result.error ?? "Falha ao registrar webhook" };

    await context.supabase
      .from("bots")
      .update({ webhook_set_at: new Date().toISOString(), status: "active" })
      .eq("id", bot.id);
    await notify(context.userId, "success", "Bot ativado", `${bot.name} está recebendo mensagens do Telegram.`, "bot", bot.id);
    await logActivity(context.userId, "bot", "ativado", bot.id);
    return { ok: true, message: "Webhook registrado" };
  });

/** Remove o webhook e desativa o bot. */
export const disableBotWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }): Promise<ActionResult> => {
    const { deleteWebhook, notify, logActivity } = await import("@/lib/telegram.server");

    const { data: bot } = await context.supabase
      .from("bots")
      .select("id,name,token")
      .eq("id", data.botId)
      .maybeSingle();
    if (!bot) return { ok: false, message: "Bot não encontrado" };

    await deleteWebhook(bot.token);
    await context.supabase
      .from("bots")
      .update({ webhook_set_at: null, status: "inactive" })
      .eq("id", bot.id);
    await notify(context.userId, "info", "Bot desativado", `${bot.name} parou de responder no Telegram.`, "bot", bot.id);
    await logActivity(context.userId, "bot", "desativado", bot.id);
    return { ok: true, message: "Bot desativado" };
  });

/** Atualiza a situação de um pagamento PIX (dono ou admin) e dispara a entrega. */
export const updatePaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => paymentSchema.parse(data))
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("payments")
      .update({
        status: data.status,
        paid_at: data.status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", payment.id);
    if (error) return { ok: false, message: error.message };

    await logActivity(payment.user_id, "pagamento", `situação alterada para ${data.status}`, payment.id);

    if (data.status === "approved" && payment.status !== "approved") {
      await notify(
        payment.user_id,
        "success",
        "Pagamento aprovado",
        `${payment.description ?? "Cobrança"} · R$ ${(payment.amount_cents / 100).toFixed(2).replace(".", ",")}`,
        "payment",
        payment.id,
      );
      await deliverForPayment(payment.id);
    }

    return { ok: true, message: "Situação atualizada" };
  });
