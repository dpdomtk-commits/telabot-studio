import { compileSimpleConfig } from "./flow-simple";

export type FlowMedia = {
  id: string;
  url?: string;
  fileId: string;
  kind: "image" | "video" | "audio";
  name?: string;
  caption?: string;
  isDynamic?: boolean;
};

export type SequenceStep = {
  id: string;
  title: string;
  enabled: boolean;
  delayValue: number;
  delayUnit: "seconds" | "minutes" | "hours" | "days";
  targetBots: string[]; // bot IDs ou 'all'
  media: FlowMedia[];
  mediaMode: "separated" | "grouped";
  message: string;
  discountType: "percent" | "fixed" | "none";
  discountValue: number;
  plans: {
    id: string;
    name: string;
    duration: string;
    originalPrice: number;
    discountPrice: number;
  }[];
  deliveryDestination?: string;
  deliveryMessage?: string;
};

export type AdvancedFlowConfig = {
  bots: {
    linkedBots: string[];
    mediaCacheChannel: string;
    supportUsername: string;
  };
  welcome: {
    message: string;
    media: FlowMedia[];
    mediaMode: "separated" | "grouped";
    hasSecondaryMessage: boolean;
    secondaryMessage: string;
    hasCtaButton: boolean;
    ctaButtonText: string;
    ctaButtonUrl: string;
    redirectButtons: { id: string; label: string; url: string; active: boolean }[];
    miniAppEnabled: boolean;
  };
  plans: {
    currency: string;
    deliveryFallback: string;
    items: {
      id: string;
      name: string;
      price: number;
      duration: string;
      buttonColor: "default" | "blue" | "green" | "red";
      deliveryType: "fallback" | "custom";
      deliveryCustomDestination?: string;
      hasCustomOrderBump: boolean;
    }[];
  };
  upsell: {
    enabled: boolean;
    deliveryDestination: string;
    deliveryMessage: string;
    sequences: SequenceStep[];
  };
  downsell: {
    enabled: boolean;
    deliveryDestination: string;
    sequences: SequenceStep[];
  };
  orderBump: {
    initialFlowEnabled: boolean;
    productName: string;
    price: number;
    description: string;
    acceptButtonText: string;
    refuseButtonText: string;
    ctaMessage: string;
    media: FlowMedia[];
    deliveryDestination: string;
    applyToUpsell: boolean;
    applyToDownsell: boolean;
    applyToPacks: boolean;
  };
  remarketing: {
    enabled: boolean;
    sequences: SequenceStep[];
  };
  payments: {
    layout: "standard" | "compact";
    showPlanConfirmation: boolean;
    pixInstructions: string;
    media: FlowMedia[];
    messageBeforeButtons: boolean;
    messageBeforeButtonsText: string;
    pixCodeInSameMessage: boolean;
    messageBeforePixCode: boolean;
    messageBeforePixCodeText: string;
  };
};

export const defaultAdvancedConfig = (): AdvancedFlowConfig => ({
  bots: {
    linkedBots: [],
    mediaCacheChannel: "",
    supportUsername: "",
  },
  welcome: {
    message: "Olá! Bem-vindo(a) ao nosso atendimento vip.\nEscolha uma das opções abaixo:",
    media: [],
    mediaMode: "separated",
    hasSecondaryMessage: false,
    secondaryMessage: "",
    hasCtaButton: false,
    ctaButtonText: "",
    ctaButtonUrl: "",
    redirectButtons: [],
    miniAppEnabled: false,
  },
  plans: {
    currency: "BRL",
    deliveryFallback: "",
    items: [
      {
        id: "plan-1",
        name: "VITALÍCIO",
        price: 12.99,
        duration: "Vitalício",
        buttonColor: "default",
        deliveryType: "fallback",
        hasCustomOrderBump: false,
      },
    ],
  },
  upsell: {
    enabled: false,
    deliveryDestination: "",
    deliveryMessage: "Parabéns! Seu acesso premium foi liberado.",
    sequences: [
      {
        id: "seq-up-1",
        title: "Sequência 1",
        enabled: true,
        delayValue: 0,
        delayUnit: "seconds",
        targetBots: ["all"],
        media: [],
        mediaMode: "separated",
        message: "Tenho uma oferta exclusiva e única para você complementar seu acesso!",
        discountType: "percent",
        discountValue: 50,
        plans: [
          {
            id: "up-p-1",
            name: "FAZER VERIFICAÇÃO",
            duration: "Vitalício",
            originalPrice: 19.9,
            discountPrice: 8.99,
          },
        ],
      },
    ],
  },
  downsell: {
    enabled: false,
    deliveryDestination: "",
    sequences: [
      {
        id: "seq-down-1",
        title: "Sequência 1",
        enabled: true,
        delayValue: 5,
        delayUnit: "minutes",
        targetBots: ["all"],
        media: [],
        mediaMode: "separated",
        message: "Ainda pensando? Preparei um super desconto especial para você não ficar de fora!",
        discountType: "percent",
        discountValue: 30,
        plans: [
          {
            id: "down-p-1",
            name: "ACESSO PROMOCIONAL",
            duration: "Vitalício",
            originalPrice: 12.99,
            discountPrice: 7.99,
          },
        ],
      },
    ],
  },
  orderBump: {
    initialFlowEnabled: false,
    productName: "Pacote VIP Extra",
    price: 6.99,
    description: "Leve vídeos e bônus extras com mais de 70% de desconto nesta oferta única!",
    acceptButtonText: "ADICIONAR",
    refuseButtonText: "NÃO QUERO",
    ctaMessage: "CLIQUE EM ADICIONAR ANTES QUE TIREM DO AR",
    media: [],
    deliveryDestination: "",
    applyToUpsell: false,
    applyToDownsell: false,
    applyToPacks: false,
  },
  remarketing: {
    enabled: false,
    sequences: [
      {
        id: "seq-rem-1",
        title: "Recuperação 15 min",
        enabled: true,
        delayValue: 15,
        delayUnit: "minutes",
        targetBots: ["all"],
        media: [],
        mediaMode: "separated",
        message: "Seu PIX foi gerado mas ainda não identificamos o pagamento. Posso te ajudar a finalizar?",
        discountType: "none",
        discountValue: 0,
        plans: [],
      },
    ],
  },
  payments: {
    layout: "standard",
    showPlanConfirmation: false,
    pixInstructions: "Como realizar o pagamento:\n1. Abra o app do seu banco.\n2. Escolha PIX Copia e Cola.\n3. Cole a chave abaixo e finalize.",
    media: [],
    messageBeforeButtons: false,
    messageBeforeButtonsText: "Após efetuar o pagamento, clique no botão abaixo:",
    pixCodeInSameMessage: false,
    messageBeforePixCode: true,
    messageBeforePixCodeText: "Copie o código abaixo:",
  },
});

export function normalizeAdvancedConfig(raw: unknown): AdvancedFlowConfig {
  const base = defaultAdvancedConfig();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<AdvancedFlowConfig>;
  return {
    ...base,
    ...value,
    bots: { ...base.bots, ...(value.bots ?? {}) },
    welcome: { ...base.welcome, ...(value.welcome ?? {}) },
    plans: { ...base.plans, ...(value.plans ?? {}) },
    upsell: { ...base.upsell, ...(value.upsell ?? {}) },
    downsell: { ...base.downsell, ...(value.downsell ?? {}) },
    orderBump: { ...base.orderBump, ...(value.orderBump ?? {}) },
    remarketing: { ...base.remarketing, ...(value.remarketing ?? {}) },
    payments: { ...base.payments, ...(value.payments ?? {}) },
  };
}
