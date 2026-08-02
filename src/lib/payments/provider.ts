import { buildPixPayload } from "./pix";

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
    const key = config.pixReceiverKey;
    const pixCode = key
      ? buildPixPayload({
          key,
          amountCents: input.amountCents,
          merchantName: config.pixReceiverName,
          merchantCity: config.pixReceiverCity,
          reference: input.chargeId.replace(/-/g, "").slice(0, 25),
          description: input.productName ?? input.description,
        })
      : "";
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
