import { buildPixPayload, validatePixKey } from "./pix";

/**
 * Camada de abstração de gateway de pagamento.
 * Qualquer provedor (Mercado Pago, Asaas, Efí, Pagar.me, OpenPix, Stripe)
 * pode ser plugado implementando esta interface, sem alterar o restante do sistema.
 */
export type ChargeInput = {
  chargeId: string;
  amountCents: number;
  description: string;
  productName?: string | null;
  expiresAt?: string | null;
  payerName?: string | null;
  payerDocument?: string | null;
  payerEmail?: string | null;
  payerPhone?: string | null;
};


export type ChargeResult = {
  provider: string;
  externalId: string | null;
  pixCode: string;
};

export type ProviderConfig = {
  pixReceiverKey: string | null;
  pixReceiverName: string;
  pixReceiverCity: string;
  /** Credenciais próprias do usuário (quando o provedor exige API própria). */
  credentials?: { clientId: string | null; clientSecret: string | null } | null;
};


export interface PaymentProvider {
  readonly id: string;
  createPixCharge(input: ChargeInput, config: ProviderConfig): Promise<ChargeResult>;
  /** Verificação de assinatura de webhook — implementada por provedores externos. */
  verifyWebhook?(rawBody: string, headers: Headers): Promise<boolean>;
}

/** Provedor interno: gera BR Code estático a partir da chave PIX configurada. */
const internalProvider: PaymentProvider = {
  id: "internal",
  async createPixCharge(input, config) {
    // Se a chave não estiver cadastrada ou for inválida, usa a chave padrão da gateway nativa CASH BOT
    const defaultKey = "e3b0c442-98fc-1c14-9afb-f4c5962079cd";
    const keyCheck = validatePixKey(config.pixReceiverKey);
    const validKey = keyCheck.valid ? keyCheck.key : defaultKey;

    const pixCode = buildPixPayload({
      key: validKey,
      amountCents: input.amountCents,
      merchantName: config.pixReceiverName || "CASH BOT",
      merchantCity: config.pixReceiverCity || "SAO PAULO",
      reference: input.chargeId.replace(/-/g, "").slice(0, 25),
      description: input.productName ?? input.description ?? "Pagamento CASH BOT",
    });
    return { provider: "internal", externalId: null, pixCode };
  },
};


const providers: Record<string, PaymentProvider> = {
  internal: internalProvider,
};

/** Registra um novo provedor (Mercado Pago, Asaas, etc.) na gateway. */
export function registerProvider(provider: PaymentProvider) {
  providers[provider.id] = provider;
}

export function getProvider(id: string | null | undefined): PaymentProvider {
  return providers[id ?? "internal"] ?? internalProvider;
}
