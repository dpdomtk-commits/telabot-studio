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
  triggerType?: "start" | "pix_pending";
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
  gate: {
    enabled: boolean;
    welcomeMessagePt: string;
    welcomeMessageEn: string;
    langButtonPt: string;
    langButtonEn: string;
    currencyPromptPt: string;
    currencyPromptEn: string;
    currenciesEnabled: {
      BRL: boolean;
      USD: boolean;
      EUR: boolean;
      GBP: boolean;
    };
  };
  welcome: {
    message: string;
    messagePt: string;
    ctaPt: string;
    messageEn: string;
    ctaEn: string;
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
      buttonText?: string;
      emoji?: string;
      buttonColor?: "default" | "blue" | "green" | "red" | "gold" | "purple";
      deliveryType?: "fallback" | "custom";
      deliveryCustomDestination?: string;
      hasCustomOrderBump?: boolean;
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
    // Área 1: Downsell pós-Start (/start sem gerar PIX) - até 20 sequências
    startSequences: SequenceStep[];
    // Área 2: Downsell pós-PIX (PIX Gerado e não pago) - até 20 sequências
    pixSequences: SequenceStep[];
    // Legado
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
    intervalHours: number; // padrão de 3 em 3 horas
    targetBotId: string; // bot específico do fluxo
    targetAudience: "all" | "pix_pending" | "start_abandoned";
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
  multilingual: {
    enabled: boolean;
    defaultLanguage: "pt" | "en";
    welcomeMessages: {
      pt: string;
      en: string;
    };
    currencyPrompts: {
      pt: string;
      en: string;
    };
    rates: {
      USD: number;
      EUR: number;
      GBP: number;
    };
    currenciesEnabled: {
      USD: boolean;
      EUR: boolean;
      GBP: boolean;
    };
  };
};

export const defaultAdvancedConfig = (): AdvancedFlowConfig => ({
  bots: {
    linkedBots: [],
    mediaCacheChannel: "",
    supportUsername: "",
  },
  gate: {
    enabled: true,
    welcomeMessagePt:
      "Olá! Seja muito bem-vindo(a)! 👋\n\nEstamos felizes em ter você aqui.\n\nAntes de continuar, escolha o idioma que prefere para receber nossas informações.",
    welcomeMessageEn:
      "Hello! Welcome! 👋\n\nWe're happy to have you here.\n\nBefore continuing, please choose your preferred language.",
    langButtonPt: "🇧🇷 Português",
    langButtonEn: "🇺🇸 English",
    currencyPromptPt: "Perfeito! 🇧🇷 Selecione a moeda para visualizar nossos planos:",
    currencyPromptEn: "Perfect! 🌎 Choose your currency to view our plans:",
    currenciesEnabled: {
      BRL: true,
      USD: true,
      EUR: true,
      GBP: true,
    },
  },
  welcome: {
    message: "Olá! Bem-vindo(a) ao nosso atendimento VIP.\nToque abaixo para ver os planos disponíveis:",
    messagePt: "Olá! Bem-vindo(a) ao nosso atendimento VIP.\nToque no botão abaixo para ver nossos planos exclusivos:",
    ctaPt: "💎 Ver Planos",
    messageEn: "Hello! Welcome to our VIP service.\nTap the button below to view our exclusive plans:",
    ctaEn: "💎 View Plans",
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
    deliveryMessage: "Obrigado por adquirir o acesso VIP! Aqui está sua entrega.",
    sequences: [],
  },
  downsell: {
    enabled: false,
    deliveryDestination: "",
    startSequences: [
      {
        id: "seq-down-start-1",
        title: "Downsell /start #1",
        enabled: true,
        triggerType: "start",
        delayValue: 15,
        delayUnit: "minutes",
        targetBots: ["all"],
        media: [],
        mediaMode: "separated",
        message: "Ainda está por aí? Preparei uma condição exclusiva para você liberar seu acesso agora mesmo!",
        discountType: "fixed",
        discountValue: 5,
        plans: [
          {
            id: "down-start-p1",
            name: "PROMOÇÃO START",
            duration: "Vitalício",
            originalPrice: 12.99,
            discountPrice: 9.99,
          },
        ],
      },
    ],
    pixSequences: [
      {
        id: "seq-down-pix-1",
        title: "Downsell PIX Pendente #1",
        enabled: true,
        triggerType: "pix_pending",
        delayValue: 30,
        delayUnit: "minutes",
        targetBots: ["all"],
        media: [],
        mediaMode: "separated",
        message: "Notamos que seu PIX está quase expirando! Para você não perder, reduzi o valor para finalizarmos agora:",
        discountType: "fixed",
        discountValue: 5,
        plans: [
          {
            id: "down-pix-p1",
            name: "PIX COM SUPER DESCONTO",
            duration: "Vitalício",
            originalPrice: 12.99,
            discountPrice: 7.99,
          },
        ],
      },
    ],
    sequences: [],
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
    intervalHours: 3, // disparos de 3 em 3 horas
    targetBotId: "all",
    targetAudience: "all",
    sequences: [
      {
        id: "seq-rem-1",
        title: "Remarketing (3 em 3 horas) #1",
        enabled: true,
        delayValue: 3,
        delayUnit: "hours",
        targetBots: ["all"],
        media: [],
        mediaMode: "separated",
        message: "Última chamada! Seu acesso VIP está reservado com preço especial exclusivo por tempo limitado.",
        discountType: "none",
        discountValue: 0,
        plans: [
          {
            id: "rem-p1",
            name: "PLANO PROMOCIONAL REMARKETING",
            duration: "Vitalício",
            originalPrice: 12.99,
            discountPrice: 9.99,
          },
        ],
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
  multilingual: {
    enabled: true,
    defaultLanguage: "pt",
    welcomeMessages: {
      pt: "Olá! Seja muito bem-vindo(a)! 👋\n\nEstamos felizes em ter você aqui.\n\nAntes de continuar, escolha o idioma que prefere para receber nossas informações.",
      en: "Hello! Welcome! 👋\n\nWe're happy to have you here.\n\nBefore continuing, please choose your preferred language.",
    },
    currencyPrompts: {
      pt: "Perfeito! 🇧🇷\n\nSelecione um dos nossos planos abaixo e escolha a melhor opção para você.",
      en: "Perfect! 🌎\n\nChoose your preferred currency to view our available plans.",
    },
    rates: {
      USD: 0.20,
      EUR: 0.18,
      GBP: 0.16,
    },
    currenciesEnabled: {
      USD: true,
      EUR: true,
      GBP: true,
    },
  },
});

export function normalizeAdvancedConfig(raw: unknown): AdvancedFlowConfig {
  const base = defaultAdvancedConfig();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<AdvancedFlowConfig>;
  
  const rawDownsell = (value.downsell ?? {}) as Partial<AdvancedFlowConfig["downsell"]>;
  const startSequences = Array.isArray(rawDownsell.startSequences)
    ? rawDownsell.startSequences
    : rawDownsell.sequences?.filter((s) => s.triggerType === "start")?.length
      ? rawDownsell.sequences.filter((s) => s.triggerType === "start")
      : base.downsell.startSequences;

  const pixSequences = Array.isArray(rawDownsell.pixSequences)
    ? rawDownsell.pixSequences
    : rawDownsell.sequences?.filter((s) => s.triggerType !== "start")?.length
      ? rawDownsell.sequences.filter((s) => s.triggerType !== "start")
      : base.downsell.pixSequences;

  const rawRemarketing = (value.remarketing ?? {}) as Partial<AdvancedFlowConfig["remarketing"]>;
  const remarketingSequences = Array.isArray(rawRemarketing.sequences) && rawRemarketing.sequences.length > 0
    ? rawRemarketing.sequences
    : base.remarketing.sequences;

  const rawWelcome = (value.welcome ?? {}) as Partial<AdvancedFlowConfig["welcome"]>;
  const welcomeMessage = rawWelcome.message ?? base.welcome.message;

  return {
    ...base,
    ...value,
    bots: { ...base.bots, ...(value.bots ?? {}) },
    gate: {
      ...base.gate,
      ...(value.gate ?? {}),
      currenciesEnabled: {
        ...base.gate.currenciesEnabled,
        ...(value.gate?.currenciesEnabled ?? {}),
      },
    },
    welcome: {
      ...base.welcome,
      ...rawWelcome,
      message: welcomeMessage,
      messagePt: rawWelcome.messagePt || welcomeMessage || base.welcome.messagePt,
      ctaPt: rawWelcome.ctaPt || base.welcome.ctaPt,
      messageEn: rawWelcome.messageEn || base.welcome.messageEn,
      ctaEn: rawWelcome.ctaEn || base.welcome.ctaEn,
    },
    plans: { ...base.plans, ...(value.plans ?? {}) },
    upsell: { ...base.upsell, ...(value.upsell ?? {}) },
    downsell: {
      ...base.downsell,
      ...rawDownsell,
      startSequences,
      pixSequences,
      sequences: [...startSequences, ...pixSequences],
    },
    orderBump: { ...base.orderBump, ...(value.orderBump ?? {}) },
    remarketing: {
      ...base.remarketing,
      ...rawRemarketing,
      intervalHours: rawRemarketing.intervalHours ?? 3,
      sequences: remarketingSequences,
    },
    payments: { ...base.payments, ...(value.payments ?? {}) },
    multilingual: {
      ...base.multilingual,
      ...(value.multilingual ?? {}),
      welcomeMessages: {
        ...base.multilingual.welcomeMessages,
        ...(value.multilingual?.welcomeMessages ?? {}),
      },
      currencyPrompts: {
        ...base.multilingual.currencyPrompts,
        ...(value.multilingual?.currencyPrompts ?? {}),
      },
      rates: {
        ...base.multilingual.rates,
        ...(value.multilingual?.rates ?? {}),
      },
      currenciesEnabled: {
        ...base.multilingual.currenciesEnabled,
        ...(value.multilingual?.currenciesEnabled ?? {}),
      },
    },
  };
}

export function formatCurrencyPrice(
  amountBrl: number,
  currency: "BRL" | "USD" | "EUR" | "GBP",
  _rates?: unknown
): { formatted: string; amount: number; symbol: string } {
  // Conversão 1:1 direta sem cálculo de câmbio (ex: 10 R$ = 10 $ = 10 € = 10 £)
  const val = Number(amountBrl || 0);
  if (currency === "USD") {
    return { formatted: `$ ${val.toFixed(2)}`, amount: val, symbol: "$" };
  }
  if (currency === "EUR") {
    return { formatted: `€ ${val.toFixed(2)}`, amount: val, symbol: "€" };
  }
  if (currency === "GBP") {
    return { formatted: `£ ${val.toFixed(2)}`, amount: val, symbol: "£" };
  }
  return {
    formatted: `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    amount: val,
    symbol: "R$",
  };
}

export type CompiledStep = {
  key: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  position: number;
  position_x: number;
  position_y: number;
};

export type CompiledConnection = {
  source: string;
  target: string;
  sourceHandle: string | null;
  label: string | null;
};

export type CompiledFlow = { steps: CompiledStep[]; connections: CompiledConnection[] };

/**
 * Compila a configuração avançada em nós e conexões do motor Telegram,
 * garantindo que no /start o menu pause e aguarde o lead clicar no botão do plano
 * (o PIX NUNCA é gerado automaticamente no start).
 */
export function compileAdvancedConfig(config: AdvancedFlowConfig): CompiledFlow {
  const steps: CompiledStep[] = [];
  const connections: CompiledConnection[] = [];
  let index = 0;

  const add = (
    key: string,
    type: string,
    title: string,
    stepConfig: Record<string, unknown>,
    column = 0,
  ): string => {
    steps.push({
      key,
      type,
      title,
      config: stepConfig,
      position: index,
      position_x: 120 + column * 340,
      position_y: 80 + index * 170,
    });
    index += 1;
    return key;
  };

  const link = (source: string, target: string, handle: string | null = null, label: string | null = null) =>
    connections.push({ source, target, sourceHandle: handle, label });

  let previous = add("start", "start", "Início", { trigger: "/start" });

  // 1. Mídias de boas-vindas
  if (config.welcome.media && config.welcome.media.length > 0) {
    if (config.welcome.mediaMode === "grouped" && config.welcome.media.length > 1) {
      const albumKey = add("welcome-media-album", "media_group", "Álbum de Mídias", {
        media: config.welcome.media.map((m) => ({
          type: m.kind === "video" ? "video" : "photo",
          url: m.fileId || m.url || "",
          caption: m.caption || "",
        })),
      });
      link(previous, albumKey);
      previous = albumKey;
    } else {
      for (let i = 0; i < config.welcome.media.length; i++) {
        const m = config.welcome.media[i];
        const mediaKey = add(`welcome-media-${i + 1}`, m.kind || "image", `Mídia ${i + 1}`, {
          url: m.url || "",
          file_id: m.fileId || "",
          caption: m.caption || "",
        });
        link(previous, mediaKey);
        previous = mediaKey;
      }
    }
  }

  // 4. Menu de Planos (com valor do lado, cores e botões extras)
  const planItems = config.plans?.items?.length
    ? config.plans.items
    : [
        {
          id: "plan-1",
          name: "VITALÍCIO",
          price: 9.23,
          duration: "Vitalício",
          emoji: "🎗️",
          buttonColor: "blue" as const,
        },
      ];

  const formatBRLPrice = (val: number) => {
    return Number(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const buttonsConfig: Array<{ text: string; handle?: string; url?: string; color?: string }> = [];
  const planOptions: string[] = [];

  planItems.forEach((plan, i) => {
    const handleKey = `plan-${plan.id || i}`;
    const priceStr = formatBRLPrice(plan.price);
    const emoji = plan.emoji ? `${plan.emoji} ` : "";
    const emojiRight = plan.emoji ? ` ${plan.emoji}` : "";
    const label = plan.buttonText?.trim() || `${emoji}${plan.name}${emojiRight} por R$ ${priceStr}`;

    planOptions.push(label);
    buttonsConfig.push({
      text: label,
      handle: handleKey,
      color: plan.buttonColor || "blue",
    });
  });

  // Botões de links externos / pagamentos mundiais
  if (config.welcome.redirectButtons && config.welcome.redirectButtons.length > 0) {
    for (const b of config.welcome.redirectButtons) {
      if (b.active && b.url) {
        buttonsConfig.push({
          text: b.label || "PAGAMENTOS MUNDIAIS 🇺🇸 🇬🇧 🇪🇺 ↗",
          url: b.url,
          color: (b as any).color || "red",
        });
      }
    }
  }

  // 2 e 3. Mensagem de Boas-vindas e Menu de Planos (SEM REPETIÇÃO DE TEXTO!)
  if (config.welcome.hasSecondaryMessage && config.welcome.secondaryMessage) {
    // Caso com 2 mensagens distintas:
    // Envia primeiro a mensagem principal de boas-vindas:
    const welcomeKey = add("welcome", "message", "Boas-vindas", {
      text: config.welcome.message || "Olá! Seja bem-vindo(a).",
    });
    link(previous, welcomeKey);
    previous = welcomeKey;

    // Envia a segunda mensagem contendo os botões de planos anexados:
    const plansMenuKey = add("plans-menu", "menu", "Escolha do Plano", {
      text: config.welcome.secondaryMessage,
      options: planOptions.join("\n"),
      buttons: buttonsConfig,
    });
    link(previous, plansMenuKey);
    previous = plansMenuKey;
  } else {
    // Caso padrão (apenas 1 mensagem):
    // A mensagem de boas-vindas já carrega os botões de planos DIRETAMENTE — NUNCA REPETE!
    const plansMenuKey = add("plans-menu", "menu", "Boas-vindas e Planos", {
      text: config.welcome.message || "Olá! Seja bem-vindo(a). Escolha seu plano abaixo:",
      options: planOptions.join("\n"),
      buttons: buttonsConfig,
    });
    link(previous, plansMenuKey);
    previous = plansMenuKey;
  }

  // 5. Para cada plano: cria um nó PIX com valor e nome EXATOS do plano
  const pixKeys: string[] = [];
  planItems.forEach((plan, i) => {
    const handleKey = `plan-${plan.id || i}`;
    const priceStr = formatBRLPrice(plan.price);
    const emoji = plan.emoji ? `${plan.emoji} ` : "";
    const emojiRight = plan.emoji ? ` ${plan.emoji}` : "";
    const label = plan.buttonText?.trim() || `${emoji}${plan.name}${emojiRight} por R$ ${priceStr}`;

    const pixKey = add(
      `pix-${plan.id || i}`,
      "pix",
      `PIX · ${plan.name}`,
      {
        product_name: plan.name,
        amount: plan.price ?? 0,
        description: `Plano ${plan.name} (${plan.duration || "Acesso Imediato"})`,
        expires_minutes: 30,
        success_message: "Pagamento confirmado com sucesso! Liberando seu acesso...",
      },
      1
    );

    // Múltiplos vínculos para garantir que qualquer clique resolva para este nó PIX
    link(plansMenuKey, pixKey, handleKey, label);
    link(plansMenuKey, pixKey, label.slice(0, 24), label);
    link(plansMenuKey, pixKey, plan.name.slice(0, 24), plan.name);
    pixKeys.push(pixKey);
  });

  // 6. Nó de entrega pós-pagamento
  const deliveryKey = add("delivery", "end", "Entrega do Acesso", {
    message: config.plans.deliveryFallback || "Seu acesso VIP foi liberado com sucesso!",
  });
  for (const pKey of pixKeys) {
    link(pKey, deliveryKey, "pago", "pago");
  }

  return { steps, connections };
}
