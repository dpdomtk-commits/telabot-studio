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

export type UserStripeStatus = {
  configured: boolean;
  publishableKeyMasked: string;
  secretKeyMasked: string;
  webhookSecretMasked: string;
  status: "disconnected" | "connected" | "error";
  lastError: string | null;
  lastCheckedAt: string | null;
  webhookUrl: string;
};

const emptyStripe = (webhookUrl: string): UserStripeStatus => ({
  configured: false,
  publishableKeyMasked: "",
  secretKeyMasked: "",
  webhookSecretMasked: "",
  status: "disconnected",
  lastError: null,
  lastCheckedAt: null,
  webhookUrl,
});

/** Estado da Stripe do próprio usuário. */
export const getMyStripe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserStripeStatus> => {
    const domain = process.env.DOMAIN || "https://telabot-studio.vercel.app";
    const webhookUrl = `${domain}/api/webhook`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data } = await supabaseAdmin
      .from("user_gateway_credentials")
      .select("client_id,client_secret,status,last_error,last_checked_at")
      .eq("user_id", context.userId)
      .eq("provider", "stripe")
      .maybeSingle();

    if (!data) return emptyStripe(webhookUrl);
    const pk = data.client_id ?? "";
    let sk = data.client_secret ?? "";
    let wh = "";

    if (sk.includes(":::")) {
      const parts = sk.split(":::");
      sk = parts[0];
      wh = parts[1] || "";
    } else {
      try {
        const parsed = JSON.parse(sk);
        if (parsed.secretKey) {
          sk = parsed.secretKey;
          wh = parsed.webhookSecret || "";
        }
      } catch {}
    }

    return {
      configured: Boolean(pk && sk),
      publishableKeyMasked: pk ? `${pk.slice(0, 7)}••••${pk.slice(-4)}` : "",
      secretKeyMasked: sk ? `${sk.slice(0, 7)}••••${sk.slice(-4)}` : "",
      webhookSecretMasked: wh ? `${wh.slice(0, 6)}••••${wh.slice(-4)}` : "",
      status: (data.status as UserStripeStatus["status"]) ?? "disconnected",
      lastError: data.last_error ?? null,
      lastCheckedAt: data.last_checked_at ?? null,
      webhookUrl,
    };
  });

/** Salva e valida as credenciais Stripe do usuário. */
export const saveMyStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        publishableKey: z.string().trim().min(8).max(200),
        secretKey: z.string().trim().min(8).max(200),
        webhookSecret: z.string().trim().max(200).optional().default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const Stripe = (await import("stripe")).default;

    let testOk = false;
    let errorMsg: string | null = null;
    try {
      const stripeClient = new Stripe(data.secretKey, {
        apiVersion: "2026-03-25.dahlia" as any,
      });
      await stripeClient.balance.retrieve();
      testOk = true;
    } catch (err: any) {
      testOk = false;
      errorMsg = err?.message || "Chave secreta inválida na Stripe";
    }

    const secretValue = `${data.secretKey}:::${data.webhookSecret || ""}`;

    const { error } = await supabaseAdmin.from("user_gateway_credentials").upsert(
      {
        user_id: context.userId,
        provider: "stripe",
        client_id: data.publishableKey,
        client_secret: secretValue,
        status: testOk ? "connected" : "error",
        last_error: testOk ? null : errorMsg,
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );

    if (error) return { ok: false, message: error.message };

    return {
      ok: testOk,
      message: testOk
        ? "Stripe conectada e validada com sucesso!"
        : `Credenciais salvas com aviso: ${errorMsg}`,
    };
  });

/** Revalida a conexão Stripe já salva. */
export const testMyStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const Stripe = (await import("stripe")).default;

    const { data } = await supabaseAdmin
      .from("user_gateway_credentials")
      .select("client_id,client_secret")
      .eq("user_id", context.userId)
      .eq("provider", "stripe")
      .maybeSingle();

    if (!data?.client_secret) {
      return { ok: false, message: "Nenhuma credencial Stripe salva" };
    }

    let sk = data.client_secret;
    if (sk.includes(":::")) {
      sk = sk.split(":::")[0];
    } else {
      try {
        const parsed = JSON.parse(sk);
        if (parsed.secretKey) sk = parsed.secretKey;
      } catch {}
    }

    try {
      const stripeClient = new Stripe(sk, {
        apiVersion: "2026-03-25.dahlia" as any,
      });
      await stripeClient.balance.retrieve();

      await supabaseAdmin
        .from("user_gateway_credentials")
        .update({
          status: "connected",
          last_error: null,
          last_checked_at: new Date().toISOString(),
        })
        .eq("user_id", context.userId)
        .eq("provider", "stripe");

      return { ok: true, message: "Conexão com a Stripe verificada com sucesso!" };
    } catch (err: any) {
      const errMsg = err?.message || "Falha ao comunicar com a Stripe";
      await supabaseAdmin
        .from("user_gateway_credentials")
        .update({
          status: "error",
          last_error: errMsg,
          last_checked_at: new Date().toISOString(),
        })
        .eq("user_id", context.userId)
        .eq("provider", "stripe");

      return { ok: false, message: `Erro na Stripe: ${errMsg}` };
    }
  });

/** Remove as credenciais Stripe do usuário. */
export const disconnectMyStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_gateway_credentials")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "stripe");

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Stripe desconectada com sucesso" };
  });


