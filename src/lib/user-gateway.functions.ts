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

    let clientId = data?.client_id ?? "";
    let clientSecret = data?.client_secret ?? "";
    let status = (data?.status as UserGatewayStatus["status"]) ?? "disconnected";
    let lastError = data?.last_error ?? null;
    let lastCheckedAt = data?.last_checked_at ?? null;

    if (!clientId || !clientSecret) {
      try {
        const { data: gw } = await supabaseAdmin
          .from("payment_gateways")
          .select("credentials, updated_at")
          .eq("user_id", context.userId)
          .eq("name", "SyncPay")
          .maybeSingle();

        if (gw?.credentials && typeof gw.credentials === "object") {
          const c = gw.credentials as any;
          if (c.clientId && c.clientSecret) {
            clientId = c.clientId;
            clientSecret = c.clientSecret;
            status = c.status || "connected";
            lastError = c.last_error || null;
            lastCheckedAt = c.last_checked_at || gw.updated_at || null;
          }
        }
      } catch {}
    }

    if (!clientId && !clientSecret) return empty(webhookUrl);
    return {
      configured: Boolean(clientId && clientSecret),
      clientIdMasked: clientId ? `${clientId.slice(0, 8)}••••${clientId.slice(-4)}` : "",
      status,
      lastError,
      lastCheckedAt,
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

    let saved = false;
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
    if (!error) {
      saved = true;
    } else {
      console.warn("[saveMySyncpay-fallback-to-payment_gateways]", error.message);
      try {
        const payload = {
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          status: check.ok ? "connected" : "error",
          last_error: check.ok ? null : check.message,
          last_checked_at: new Date().toISOString(),
        };
        const { data: existingGw } = await supabaseAdmin
          .from("payment_gateways")
          .select("id")
          .eq("user_id", context.userId)
          .eq("name", "SyncPay")
          .maybeSingle();

        if (existingGw?.id) {
          const { error: updErr } = await supabaseAdmin
            .from("payment_gateways")
            .update({ credentials: payload, is_active: true, updated_at: new Date().toISOString() })
            .eq("id", existingGw.id);
          if (!updErr) saved = true;
        } else {
          const { error: insErr } = await supabaseAdmin
            .from("payment_gateways")
            .insert({
              user_id: context.userId,
              name: "SyncPay",
              provider: "custom",
              is_active: true,
              credentials: payload,
            });
          if (!insErr) saved = true;
        }
      } catch (fbErr) {
        console.warn("[saveMySyncpay-fallback-failed]", fbErr);
      }
    }

    if (!saved && error) return { ok: false, message: error.message };

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

    let pk = data?.client_id ?? "";
    let sk = data?.client_secret ?? "";
    let wh = "";
    let status = (data?.status as UserStripeStatus["status"]) ?? "disconnected";
    let lastError = data?.last_error ?? null;
    let lastCheckedAt = data?.last_checked_at ?? null;

    if (sk.includes(":::")) {
      const parts = sk.split(":::");
      sk = parts[0];
      wh = parts[1] || "";
    } else if (sk) {
      try {
        const parsed = JSON.parse(sk);
        if (parsed.secretKey) {
          sk = parsed.secretKey;
          wh = parsed.webhookSecret || "";
        }
      } catch {}
    }

    if (!pk || !sk) {
      try {
        const { data: gw } = await supabaseAdmin
          .from("payment_gateways")
          .select("credentials, updated_at")
          .eq("user_id", context.userId)
          .eq("name", "Stripe")
          .maybeSingle();

        if (gw?.credentials && typeof gw.credentials === "object") {
          const c = gw.credentials as any;
          if (c.publishableKey || c.secretKey) {
            pk = c.publishableKey || pk;
            sk = c.secretKey || sk;
            wh = c.webhookSecret || wh;
            status = c.status || "connected";
            lastError = c.last_error || null;
            lastCheckedAt = c.last_checked_at || gw.updated_at || null;
          }
        }
      } catch {}
    }

    if (!pk && !sk) return emptyStripe(webhookUrl);

    return {
      configured: Boolean(pk && sk),
      publishableKeyMasked: pk ? `${pk.slice(0, 7)}••••${pk.slice(-4)}` : "",
      secretKeyMasked: sk ? `${sk.slice(0, 7)}••••${sk.slice(-4)}` : "",
      webhookSecretMasked: wh ? `${wh.slice(0, 6)}••••${wh.slice(-4)}` : "",
      status,
      lastError,
      lastCheckedAt,
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

    let saved = false;
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

    if (!error) {
      saved = true;
    } else {
      console.warn("[saveMyStripe-fallback-to-payment_gateways]", error.message);
      try {
        const payload = {
          publishableKey: data.publishableKey,
          secretKey: data.secretKey,
          webhookSecret: data.webhookSecret || "",
          status: testOk ? "connected" : "error",
          last_error: testOk ? null : errorMsg,
          last_checked_at: new Date().toISOString(),
        };
        const { data: existingGw } = await supabaseAdmin
          .from("payment_gateways")
          .select("id")
          .eq("user_id", context.userId)
          .eq("name", "Stripe")
          .maybeSingle();

        if (existingGw?.id) {
          const { error: updErr } = await supabaseAdmin
            .from("payment_gateways")
            .update({ credentials: payload, is_active: true, updated_at: new Date().toISOString() })
            .eq("id", existingGw.id);
          if (!updErr) saved = true;
        } else {
          const { error: insErr } = await supabaseAdmin
            .from("payment_gateways")
            .insert({
              user_id: context.userId,
              name: "Stripe",
              provider: "custom",
              is_active: true,
              credentials: payload,
            });
          if (!insErr) saved = true;
        }
      } catch (fbErr) {
        console.warn("[saveMyStripe-fallback-failed]", fbErr);
      }
    }

    if (!saved && error) return { ok: false, message: error.message };

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

    let sk = data?.client_secret || "";

    if (!sk) {
      try {
        const { data: gw } = await supabaseAdmin
          .from("payment_gateways")
          .select("credentials")
          .eq("user_id", context.userId)
          .eq("name", "Stripe")
          .maybeSingle();
        if (gw?.credentials && typeof gw.credentials === "object") {
          sk = (gw.credentials as any).secretKey || "";
        }
      } catch {}
    }

    if (!sk) {
      return { ok: false, message: "Nenhuma credencial Stripe salva" };
    }

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
    await supabaseAdmin
      .from("user_gateway_credentials")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "stripe");

    await supabaseAdmin
      .from("payment_gateways")
      .delete()
      .eq("user_id", context.userId)
      .eq("name", "Stripe");

    return { ok: true, message: "Stripe desconectada com sucesso" };
  });


