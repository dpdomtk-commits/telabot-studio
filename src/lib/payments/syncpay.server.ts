import { registerProvider, type PaymentProvider } from "./provider";

/**
 * Integração real com a SyncPay.
 * Suporta a conta central da plataforma (variáveis de ambiente) e também
 * credenciais próprias de cada usuário (tabela user_gateway_credentials).
 * O client_secret nunca sai do servidor.
 */

const DEFAULT_BASE_URL = "https://api.syncpayments.com.br";

export type SyncpayCredentials = { clientId: string; clientSecret: string };

function config() {
  return {
    baseUrl: (process.env["SYNCPAY_BASE_URL"] || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    clientId: process.env["SYNCPAY_CLIENT_ID"] ?? "",
    clientSecret: process.env["SYNCPAY_CLIENT_SECRET"] ?? "",
    webhookToken: process.env["SYNCPAY_WEBHOOK_TOKEN"] ?? "",
    publicUrl: (process.env["PUBLIC_SITE_URL"] || "https://aurumapi.lovable.app").replace(/\/+$/, ""),
  };
}

export function syncpayWebhookUrl() {
  const { publicUrl, webhookToken } = config();
  return `${publicUrl}/api/public/webhooks/syncpay?token=${webhookToken}`;
}

export function syncpayWebhookTokenMatches(token: string | null) {
  const expected = config().webhookToken;
  if (!expected || !token || token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

const tokenCache = new Map<string, { value: string; expiresAt: number }>();

function resolveCredentials(creds?: SyncpayCredentials | null): SyncpayCredentials {
  if (creds?.clientId && creds.clientSecret) return creds;
  const { clientId, clientSecret } = config();
  return { clientId, clientSecret };
}

/** Gera (e reaproveita por 1 hora) o Bearer Token da SyncPay. */
export async function syncpayAuthToken(force = false, creds?: SyncpayCredentials | null): Promise<string> {
  const { baseUrl } = config();
  const { clientId, clientSecret } = resolveCredentials(creds);
  if (!clientId || !clientSecret) throw new Error("Credenciais da SyncPay não configuradas");

  const cached = tokenCache.get(clientId);
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  const response = await fetch(`${baseUrl}/api/partner/v1/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    message?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.message || `Falha na autenticação SyncPay (${response.status})`);
  }
  tokenCache.set(clientId, {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  });
  return payload.access_token;
}

async function syncpayFetch(
  path: string,
  init: RequestInit,
  creds?: SyncpayCredentials | null,
  retry = true,
): Promise<Response> {
  const { baseUrl } = config();
  const token = await syncpayAuthToken(false, creds);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 401 && retry) {
    tokenCache.delete(resolveCredentials(creds).clientId);
    return syncpayFetch(path, init, creds, false);
  }
  return response;
}

/** Testa a conexão gerando um novo token de aplicação. */
export async function testSyncpayConnection(
  creds?: SyncpayCredentials | null,
): Promise<{ ok: boolean; message: string }> {
  try {
    await syncpayAuthToken(true, creds);
    return { ok: true, message: "Conectado" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erro de autenticação" };
  }
}

/** Consulta o status atual de uma transação (usado para conciliação). */
export async function syncpayTransaction(identifier: string, creds?: SyncpayCredentials | null) {
  const response = await syncpayFetch(`/api/partner/v1/transaction/${identifier}`, { method: "GET" }, creds);
  const payload = (await response.json().catch(() => ({}))) as {
    data?: { status?: string; amount?: number; reference_id?: string };
  };
  return payload.data ?? null;
}

function onlyDigits(value: string | null | undefined, fallback: string) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits : fallback;
}

const syncpayProvider: PaymentProvider = {
  id: "syncpay",
  async createPixCharge(input, providerConfig) {
    const reference = input.chargeId;
    const creds = providerConfig.credentials?.clientId
      ? {
          clientId: providerConfig.credentials.clientId,
          clientSecret: providerConfig.credentials.clientSecret ?? "",
        }
      : null;

    const body = {
      amount: Number((input.amountCents / 100).toFixed(2)),
      description: (input.productName ?? input.description ?? "Pagamento").slice(0, 120),
      webhook_url: syncpayWebhookUrl(),
      client: {
        name: (input.payerName ?? "Cliente AURUMBOT").slice(0, 60),
        cpf: onlyDigits(input.payerDocument, "11122233396"),
        email: input.payerEmail ?? `cobranca-${reference.slice(0, 8)}@aurumbot.app`,
        phone: onlyDigits(input.payerPhone, "11999999999"),
      },
    };

    const response = await syncpayFetch(
      "/api/partner/v1/cash-in",
      { method: "POST", body: JSON.stringify(body) },
      creds,
    );
    const payload = (await response.json().catch(() => ({}))) as {
      pix_code?: string;
      identifier?: string;
      message?: string;
    };
    if (!response.ok || !payload.pix_code || !payload.identifier) {
      throw new Error(payload.message || `SyncPay recusou a cobrança (${response.status})`);
    }
    return { provider: "syncpay", externalId: payload.identifier, pixCode: payload.pix_code };
  },
};

registerProvider(syncpayProvider);

export { syncpayProvider };
