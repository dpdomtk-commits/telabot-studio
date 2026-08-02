import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SyncpayStatus = {
  configured: boolean;
  clientIdMasked: string;
  webhookUrl: string;
  activeProvider: string;
  connected: boolean | null;
  lastSyncAt: string | null;
  message: string;
};

type AuthedSupabase = Parameters<Parameters<typeof requireSupabaseAuth.server>[0] extends never ? never : never>[0];

async function assertAdmin(supabase: { rpc: typeof import("@/integrations/supabase/client").supabase.rpc }, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return data === true;
}


/** Estado da integração SyncPay (somente administradores). */
export const getSyncpayStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SyncpayStatus> => {
    const empty: SyncpayStatus = {
      configured: false,
      clientIdMasked: "",
      webhookUrl: "",
      activeProvider: "internal",
      connected: null,
      lastSyncAt: null,
      message: "Sem permissão",
    };
    if (!(await assertAdmin(context.supabase, context.userId))) return empty;

    const { syncpayWebhookUrl } = await import("@/lib/payments/syncpay.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const clientId = process.env["SYNCPAY_CLIENT_ID"] ?? "";
    const secret = process.env["SYNCPAY_CLIENT_SECRET"] ?? "";

    const [{ data: settings }, { data: lastLog }] = await Promise.all([
      supabaseAdmin.from("finance_settings").select("provider").maybeSingle(),
      supabaseAdmin
        .from("activity_logs")
        .select("created_at,metadata")
        .eq("entity", "syncpay")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const meta = (lastLog?.metadata ?? {}) as { ok?: boolean };
    return {
      configured: Boolean(clientId && secret),
      clientIdMasked: clientId ? `${clientId.slice(0, 8)}••••${clientId.slice(-4)}` : "",
      webhookUrl: syncpayWebhookUrl(),
      activeProvider: settings?.provider ?? "internal",
      connected: lastLog ? meta.ok === true : null,
      lastSyncAt: lastLog?.created_at ?? null,
      message: "",
    };
  });

/** Testa a autenticação com a SyncPay e registra a sincronização. */
export const testSyncpay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; message: string }> => {
    if (!(await assertAdmin(context.supabase, context.userId))) return { ok: false, message: "Sem permissão" };

    const { testSyncpayConnection } = await import("@/lib/payments/syncpay.server");
    const { logActivity } = await import("@/lib/telegram.server");
    const result = await testSyncpayConnection();
    await logActivity(context.userId, "syncpay", result.ok ? "conexão testada" : "falha de autenticação", undefined, {
      ok: result.ok,
      message: result.message,
    });
    return result;
  });

/** Define qual provedor recebe os pagamentos da plataforma. */
export const setPlatformProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ provider: z.enum(["internal", "syncpay"]) }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    if (!(await assertAdmin(context.supabase, context.userId))) return { ok: false, message: "Sem permissão" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logActivity } = await import("@/lib/telegram.server");

    if (data.provider === "syncpay") {
      const { testSyncpayConnection } = await import("@/lib/payments/syncpay.server");
      const check = await testSyncpayConnection();
      if (!check.ok) return { ok: false, message: `SyncPay indisponível: ${check.message}` };
    }

    const { error } = await supabaseAdmin
      .from("finance_settings")
      .update({ provider: data.provider })
      .eq("id", true);
    if (error) return { ok: false, message: error.message };

    await logActivity(context.userId, "syncpay", `provedor da plataforma: ${data.provider}`, undefined, { ok: true });
    return { ok: true, message: `Provedor ativo: ${data.provider === "syncpay" ? "SyncPay" : "Gateway interna"}` };
  });
