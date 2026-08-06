/**
 * Modo Simples de fluxos: configuração por páginas (sem editor visual).
 * A configuração é compilada para nós/conexões reais, mantendo compatibilidade
 * total com o motor de execução e com o editor avançado (estilo n8n).
 */

export type SimplePlan = {
  id: string;
  name: string;
  price: number;
  intervalDays: number;
  description: string;
};

export type SimpleOffer = {
  enabled: boolean;
  productName: string;
  price: number;
  pitch: string;
};

export type SimplePack = {
  id: string;
  name: string;
  price: number;
  content: string;
};

export type SimpleConfig = {
  welcome: {
    message: string;
    mediaFileId: string;
    mediaKind: "" | "image" | "video";
    caption: string;
    media2FileId: string;
    media2Kind: "" | "image" | "video";
    caption2: string;
  };

  plans: {
    intro: string;
    items: SimplePlan[];
  };
  payment: {
    expiresMinutes: number;
    successMessage: string;
    instructions: string;
  };
  subscription: {
    enabled: boolean;
    planName: string;
    price: number;
    intervalDays: number;
    successMessage: string;
  };
  upsell: SimpleOffer;
  downsell: SimpleOffer;
  orderBump: SimpleOffer;
  packs: { items: SimplePack[] };
  vip: {
    channelId: string;
    groupId: string;
    message: string;
  };
  conversions: {
    thankYouMessage: string;
    tag: string;
  };
};

export const simplePages = [
  { key: "welcome", label: "Boas-vindas" },
  { key: "plans", label: "Planos" },
  { key: "payment", label: "Pagamentos" },
  { key: "subscription", label: "Assinaturas" },
  { key: "upsell", label: "Upsell" },
  { key: "downsell", label: "Downsell" },
  { key: "orderBump", label: "Order Bump" },
  { key: "packs", label: "Packs" },
  { key: "vip", label: "Grupo VIP" },
  { key: "conversions", label: "Conversões" },
] as const;

export type SimplePageKey = (typeof simplePages)[number]["key"];

export const emptyOffer = (): SimpleOffer => ({ enabled: false, productName: "", price: 0, pitch: "" });

export function defaultSimpleConfig(): SimpleConfig {
  return {
    welcome: {
      message: "Olá! Bem-vindo(a). Escolha uma das opções abaixo para começar.",
      mediaFileId: "",
      mediaKind: "",
      caption: "",
    },
    plans: {
      intro: "Estes são os planos disponíveis:",
      items: [
        { id: "plan-1", name: "Plano Mensal", price: 29.9, intervalDays: 30, description: "Acesso completo por 30 dias" },
      ],
    },
    payment: {
      expiresMinutes: 30,
      successMessage: "Pagamento aprovado! Liberando seu acesso agora.",
      instructions: "Pague o PIX abaixo para liberar o acesso automaticamente.",
    },
    subscription: {
      enabled: false,
      planName: "Assinatura VIP",
      price: 29.9,
      intervalDays: 30,
      successMessage: "Assinatura ativada com sucesso!",
    },
    upsell: emptyOffer(),
    downsell: emptyOffer(),
    orderBump: emptyOffer(),
    packs: { items: [] },
    vip: { channelId: "", groupId: "", message: "Acesso liberado! Entre pelo link abaixo." },
    conversions: { thankYouMessage: "Obrigado pela compra!", tag: "cliente" },
  };
}

/** Mescla configuração salva com os padrões, tolerando dados parciais/antigos. */
export function normalizeSimpleConfig(raw: unknown): SimpleConfig {
  const base = defaultSimpleConfig();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<SimpleConfig>;
  return {
    welcome: { ...base.welcome, ...(value.welcome ?? {}) },
    plans: {
      ...base.plans,
      ...(value.plans ?? {}),
      items: value.plans?.items?.length ? value.plans.items : base.plans.items,
    },
    payment: { ...base.payment, ...(value.payment ?? {}) },
    subscription: { ...base.subscription, ...(value.subscription ?? {}) },
    upsell: { ...base.upsell, ...(value.upsell ?? {}) },
    downsell: { ...base.downsell, ...(value.downsell ?? {}) },
    orderBump: { ...base.orderBump, ...(value.orderBump ?? {}) },
    packs: { items: value.packs?.items ?? [] },
    vip: { ...base.vip, ...(value.vip ?? {}) },
    conversions: { ...base.conversions, ...(value.conversions ?? {}) },
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
 * Converte a configuração do Modo Simples em um grafo real de nós e conexões,
 * exatamente no mesmo formato usado pelo editor avançado.
 */
export function compileSimpleConfig(config: SimpleConfig): CompiledFlow {
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

  if (config.welcome.mediaFileId && config.welcome.mediaKind) {
    const media = add("welcome-media", config.welcome.mediaKind, "Mídia de boas-vindas", {
      file_id: config.welcome.mediaFileId,
      caption: config.welcome.caption,
    });
    link(previous, media);
    previous = media;
  }

  const welcome = add("welcome", "message", "Boas-vindas", { text: config.welcome.message });
  link(previous, welcome);
  previous = welcome;

  const plansText = [
    config.plans.intro,
    ...config.plans.items.map((p) => `• ${p.name} — R$ ${p.price.toFixed(2)} (${p.intervalDays} dias)${p.description ? ` — ${p.description}` : ""}`),
  ].join("\n");
  const plans = add("plans", "menu", "Planos", {
    text: plansText,
    options: config.plans.items.map((p) => p.name).join("\n"),
  });
  link(previous, plans);
  previous = plans;

  if (config.orderBump.enabled) {
    const bump = add("order-bump", "order_bump", "Order Bump", {
      product_name: config.orderBump.productName,
      amount: config.orderBump.price,
      pitch: config.orderBump.pitch,
    });
    link(previous, bump);
    previous = bump;
  }

  // PIX sob demanda: um nó de cobrança por plano, disparado apenas quando o
  // lead clica no botão daquele plano no menu.
  const pixKeys: string[] = [];
  if (config.subscription.enabled) {
    const sub = add("subscription", "subscription", "Assinatura", {
      plan_name: config.subscription.planName,
      amount: config.subscription.price,
      interval_days: config.subscription.intervalDays,
      success_message: config.subscription.successMessage,
    });
    link(previous, sub);
    pixKeys.push(sub);
  } else {
    config.plans.items.forEach((plan, i) => {
      const key = add(
        `pix-${plan.id}`,
        "pix",
        `Pagamento · ${plan.name}`,
        {
          product_name: plan.name || "Acesso",
          description: plan.description || config.payment.instructions,
          amount: plan.price ?? 0,
          expires_minutes: config.payment.expiresMinutes,
          success_message: config.payment.successMessage,
        },
        1,
      );
      // O handle precisa bater com o callback_data do menu (24 caracteres).
      link(previous, key, plan.name.slice(0, 24), plan.name);
      pixKeys.push(key);
      if (i === 0 && config.downsell.enabled) {
        const down = add(
          "downsell",
          "downsell",
          "Downsell",
          {
            product_name: config.downsell.productName,
            amount: config.downsell.price,
            pitch: config.downsell.pitch,
          },
          2,
        );
        link(key, down, "expirado", "expirado");
      }
    });
  }

  const paidHandle = config.subscription.enabled ? null : "pago";
  let branch: string | null = null;
  const chain = (key: string, type: string, title: string, stepConfig: Record<string, unknown>) => {
    const created = add(key, type, title, stepConfig);
    if (branch === null) {
      // Primeira etapa pós-pagamento: sai de todas as cobranças pelo "pago".
      for (const source of pixKeys) link(source, created, paidHandle, "pago");
    } else {
      link(branch, created, null, null);
    }
    branch = created;
  };

  if (config.upsell.enabled) {
    chain("upsell", "upsell", "Upsell", {
      product_name: config.upsell.productName,
      amount: config.upsell.price,
      pitch: config.upsell.pitch,
    });
  }

  for (const pack of config.packs.items) {
    chain(`pack-${pack.id}`, "pack", pack.name || "Pack", {
      product_name: pack.name,
      amount: pack.price,
      content: pack.content,
    });
  }

  if (config.vip.channelId) {
    chain("vip-channel", "release_channel", "Liberar canal VIP", {
      channel_id: config.vip.channelId,
      message: config.vip.message,
    });
  }
  if (config.vip.groupId) {
    chain("vip-group", "release_group", "Liberar grupo VIP", {
      group_id: config.vip.groupId,
      message: config.vip.message,
    });
  }

  if (config.conversions.tag) {
    chain("tag", "tag", "Marcar conversão", { tag: config.conversions.tag });
  }

  chain("end", "end", "Finalizar", { message: config.conversions.thankYouMessage });


  return { steps, connections };
}
