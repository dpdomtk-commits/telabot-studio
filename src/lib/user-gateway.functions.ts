import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UserGatewayStatus = {
  configured: boolean;
  clientIdMasked: string;
  status: "disconnected" | "connected" | "error";
  lastError: string | null;
  lastCheckedAt: string | null;
  webhookUrl: string;
};

const empty = (webhookUrl: string): UserGatewayStatus => ({
  configured: false,
  clientIdMasked: "",
  status: "disconnected",
  lastError: null,
  lastCheckedAt: null,
  webhookUrl,
});

/** Estado da SyncPay do próprio usuário. */
export const getMySyncpay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserGatewayStatus> => {
    const { syncpayWebhookUrl } = await import("@/lib/payments/syncpay.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const webhookUrl = syncpayWebhookUrl();

    const { data } = await supabaseAdmin
      .from("user_gateway_credentials")
      .select("client_id,client_secret,status,last_error,last_checked_at")
      .eq("user_id", context.userId)
      .eq("provider", "syncpay")
      .maybeSingle();

    if (!data) return empty(webhookUrl);
    const clientId = data.client_id ?? "";
    return {
      configured: Boolean(clientId && data.client_secret),
      clientIdMasked: clientId ? `${clientId.slice(0, 8)}••••${clientId.slice(-4)}` : "",
      status: (data.status as UserGatewayStatus["status"]) ?? "disconnected",
      lastError: data.last_error ?? null,
      lastCheckedAt: data.last_checked_at ?? null,
      webhookUrl,
    };
  });

/** Salva e valida as credenciais SyncPay do usuário. */
export const saveMySyncpay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        clientId: z.string().trim().min(6).max(200),
        clientSecret: z.string().trim().min(6).max(400),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { testSyncpayConnection } = await import("@/lib/payments/syncpay.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const check = await testSyncpayConnection({
      clientId: data.clientId,
      clientSecret: data.clientSecret,
    });

    const { error } = await supabaseAdmin.from("user_gateway_credentials").upsert(
      {
        user_id: context.userId,
        provider: "syncpay",
        client_id: data.clientId,
        client_secret: data.clientSecret,
        status: check.ok ? "connected" : "error",
        last_error: check.ok ? null : check.message,
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
    if (error) return { ok: false, message: error.message };

    return {
      ok: check.ok,
      message: check.ok ? "SyncPay conectada com sucesso" : `Credenciais recusadas: ${check.message}`,
    };
  });

/** Revalida a conexão já salva. */
export const testMySyncpay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { testSyncpayConnection } = await import("@/lib/payments/syncpay.server");

    const { data } = await supabaseAdmin
      .from("user_gateway_credentials")
      .select("client_id,client_secret")
      .eq("user_id", context.userId)
      .eq("provider", "syncpay")
      .maybeSingle();
    if (!data?.client_id || !data.client_secret) {
      return { ok: false, message: "Nenhuma credencial salva" };
    }

    const check = await testSyncpayConnection({
      clientId: data.client_id,
      clientSecret: data.client_secret,
    });
    await supabaseAdmin
      .from("user_gateway_credentials")
      .update({
        status: check.ok ? "connected" : "error",
        last_error: check.ok ? null : check.message,
        last_checked_at: new Date().toISOString(),
      })
      .eq("user_id", context.userId)
      .eq("provider", "syncpay");
    return check;
  });

/** Remove as credenciais do usuário (volta para a gateway da plataforma). */
export const disconnectMySyncpay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_gateway_credentials")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "syncpay");
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Credenciais removidas" };
  });

