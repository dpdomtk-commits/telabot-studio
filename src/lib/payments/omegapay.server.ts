import { registerProvider, type ChargeInput, type ChargeResult, type PaymentProvider, type ProviderConfig } from "./provider";

/**
 * Integração oficial nativa com a Omega Payments (OmegaPay).
 * Gateway central de processamento PIX para todos os bots e clientes.
 * Base URL: https://app.omegapayments.com.br/api/v1
 */

const DEFAULT_BASE_URL = "https://app.omegapayments.com.br/api/v1";
const DEFAULT_CLIENT_ID = "dpz09_c9f6ehxwzo48qa4t";
const DEFAULT_CLIENT_SECRET = "abd0sa6z3mg8pur9crwxip2etwa2ow27kh0ksl9ah7aoxbipi0a72v7nw76lx9rw";

export type OmegaCredentials = {
  clientId: string;
  clientSecret: string;
};

export function getOmegaConfig() {
  const domain = (process.env.DOMAIN || "https://telabot-studio.vercel.app").replace(/\/+$/, "");
  return {
    baseUrl: (process.env.OMEGAPAY_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    clientId: process.env.OMEGAPAY_CLIENT_ID || DEFAULT_CLIENT_ID,
    clientSecret: process.env.OMEGAPAY_CLIENT_SECRET || DEFAULT_CLIENT_SECRET,
    webhookUrl: `${domain}/api/public/webhooks/omegapay`,
  };
}

export async function testOmegaConnection(creds?: Partial<OmegaCredentials>): Promise<{ ok: boolean; message: string; producer?: any }> {
  const cfg = getOmegaConfig();
  const publicKey = creds?.clientId || cfg.clientId;
  const secretKey = creds?.clientSecret || cfg.clientSecret;

  if (!publicKey || !secretKey) {
    return { ok: false, message: "Chaves de API OmegaPay não configuradas" };
  }

  try {
    const res = await fetch(`${cfg.baseUrl}`, {
      method: "GET",
      headers: {
        "x-public-key": publicKey,
        "x-secret-key": secretKey,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.producer) {
      return {
        ok: true,
        message: `Conectado como ${data.producer.name || data.producer.email}`,
        producer: data.producer,
      };
    }
    return {
      ok: false,
      message: data?.message || `Erro de autenticação HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || "Falha ao conectar com a API OmegaPay",
    };
  }
}

/**
 * Cria uma cobrança PIX nativa na Omega Payments via POST /gateway/pix/receive
 */
export async function createOmegaPixCharge(
  input: ChargeInput,
  credsOverride?: Partial<OmegaCredentials>
): Promise<ChargeResult & { qrCodeImage?: string; checkoutUrl?: string }> {
  const cfg = getOmegaConfig();
  const publicKey = credsOverride?.clientId || cfg.clientId;
  const secretKey = credsOverride?.clientSecret || cfg.clientSecret;

  if (!publicKey || !secretKey) {
    throw new Error("Credenciais da Omega Payments não configuradas no servidor.");
  }

  const amountReais = Number((input.amountCents / 100).toFixed(2));
  const productName = input.productName || input.description || "Acesso VIP";
  const payerName = input.payerName || "Cliente Telegram";
  const payerEmail = input.payerEmail || "cliente@cashbot.com";
  const payerPhone = input.payerPhone || "11999999999";
  const payerDocument = (input.payerDocument || "39158371801").replace(/\D/g, "") || "39158371801";

  const payload = {
    identifier: input.chargeId,
    amount: amountReais,
    client: {
      name: payerName,
      email: payerEmail,
      phone: payerPhone,
      document: payerDocument,
    },
    products: [
      {
        id: "prod_vip",
        name: productName,
        quantity: 1,
        price: amountReais,
      },
    ],
    metadata: {
      orderId: input.chargeId,
      provider: "cashbot",
    },
    callbackUrl: cfg.webhookUrl,
  };

  const response = await fetch(`${cfg.baseUrl}/gateway/pix/receive`, {
    method: "POST",
    headers: {
      "x-public-key": publicKey,
      "x-secret-key": secretKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.pix?.code) {
    const errMsg = data?.message || data?.errorDescription || `HTTP ${response.status} ao gerar PIX na OmegaPay`;
    console.error("[omegapay-create-error]", { status: response.status, data });
    throw new Error(errMsg);
  }

  return {
    provider: "omegapay",
    externalId: data.transactionId || data.order?.id || null,
    pixCode: data.pix.code,
    qrCodeImage: data.pix.image || undefined,
    checkoutUrl: data.order?.url || undefined,
  };
}

export const omegaProvider: PaymentProvider = {
  id: "omegapay",
  async createPixCharge(input: ChargeInput, config: ProviderConfig): Promise<ChargeResult> {
    const credsOverride = config.credentials ? {
      clientId: config.credentials.clientId || undefined,
      clientSecret: config.credentials.clientSecret || undefined,
    } : undefined;
    return createOmegaPixCharge(input, credsOverride);
  },
  async verifyWebhook(rawBody: string, headers: Headers): Promise<boolean> {
    // Validação básica do corpo e token de webhook
    try {
      const parsed = JSON.parse(rawBody);
      return Boolean(parsed?.event || parsed?.transaction);
    } catch {
      return false;
    }
  },
};

// Registra o provedor 'omegapay' no registry global de gateways
registerProvider(omegaProvider);
