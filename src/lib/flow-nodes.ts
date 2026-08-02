import {
  Play,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Mic,
  FileText,
  MousePointerClick,
  List,
  HelpCircle,
  GitBranch,
  Timer,
  Tag,
  TagsIcon,
  Webhook,
  Code2,
  QrCode,
  Repeat,
  TrendingUp,
  TrendingDown,
  PackagePlus,
  Package,
  Radio,
  Users,
  Flag,
  type LucideIcon,
} from "lucide-react";

export type MediaKind = "image" | "video" | "audio" | "document";

export type NodeField = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "number" | "media";
  placeholder?: string;
  /** Tipo de mídia aceito quando kind === "media". */
  mediaKind?: MediaKind;
};

export type NodeGroup = "início" | "conteúdo" | "interação" | "lógica" | "monetização" | "acesso";

export type NodeDefinition = {
  type: string;
  label: string;
  group: NodeGroup;
  icon: LucideIcon;
  /** Token de cor semântica usado na borda/ícone do nó. */
  accent: "primary" | "chart-2" | "chart-3" | "chart-4" | "muted";
  fields: NodeField[];
  outputs?: string[];
};

const text = (key: string, label: string, placeholder?: string): NodeField => ({
  key,
  label,
  kind: "text",
  ...(placeholder ? { placeholder } : {}),
});
const area = (key: string, label: string, placeholder?: string): NodeField => ({
  key,
  label,
  kind: "textarea",
  ...(placeholder ? { placeholder } : {}),
});
const media = (mediaKind: MediaKind): NodeField => ({
  key: "file_id",
  label: "Arquivo",
  kind: "media",
  mediaKind,
});
const num = (key: string, label: string): NodeField => ({ key, label, kind: "number" });

export const nodeDefinitions: NodeDefinition[] = [
  { type: "start", label: "Início", group: "início", icon: Play, accent: "primary", fields: [text("trigger", "Comando de disparo", "/start")] },

  { type: "message", label: "Mensagem", group: "conteúdo", icon: MessageSquare, accent: "chart-2", fields: [area("text", "Texto da mensagem")] },
  { type: "image", label: "Imagem", group: "conteúdo", icon: ImageIcon, accent: "chart-2", fields: [media("image"), text("caption", "Legenda")] },
  { type: "video", label: "Vídeo", group: "conteúdo", icon: Video, accent: "chart-2", fields: [media("video"), text("caption", "Legenda")] },
  { type: "audio", label: "Áudio", group: "conteúdo", icon: Mic, accent: "chart-2", fields: [media("audio"), text("caption", "Legenda")] },
  { type: "document", label: "Documento", group: "conteúdo", icon: FileText, accent: "chart-2", fields: [media("document"), text("caption", "Legenda")] },

  {
    type: "button",
    label: "Botões",
    group: "interação",
    icon: MousePointerClick,
    accent: "chart-3",
    fields: [area("text", "Texto acima dos botões"), text("label", "Rótulo do botão"), text("action", "Ação (ex.: comprar)")],
  },
  { type: "menu", label: "Menu", group: "interação", icon: List, accent: "chart-3", fields: [area("text", "Texto do menu"), area("options", "Opções (uma por linha)")] },
  { type: "question", label: "Pergunta", group: "interação", icon: HelpCircle, accent: "chart-3", fields: [area("text", "Pergunta"), text("variable", "Salvar resposta em")] },

  {
    type: "condition",
    label: "Condicional",
    group: "lógica",
    icon: GitBranch,
    accent: "chart-4",
    fields: [text("variable", "Variável"), text("operator", "Operador (igual, contém, maior)"), text("value", "Valor comparado")],
    outputs: ["sim", "não"],
  },
  { type: "delay", label: "Espera", group: "lógica", icon: Timer, accent: "chart-4", fields: [num("seconds", "Segundos de espera")] },
  { type: "tag", label: "Etiqueta", group: "lógica", icon: Tag, accent: "chart-4", fields: [text("tag", "Nome da etiqueta")] },
  { type: "untag", label: "Remover etiqueta", group: "lógica", icon: TagsIcon, accent: "chart-4", fields: [text("tag", "Nome da etiqueta")] },
  { type: "webhook", label: "Webhook", group: "lógica", icon: Webhook, accent: "chart-4", fields: [text("url", "URL de destino"), text("event", "Evento enviado")] },
  {
    type: "api",
    label: "API",
    group: "lógica",
    icon: Code2,
    accent: "chart-4",
    fields: [text("url", "URL da API"), text("method", "Método (GET, POST)"), area("body", "Corpo da requisição")],
  },

  {
    type: "pix",
    label: "PIX",
    group: "monetização",
    icon: QrCode,
    accent: "primary",
    fields: [
      text("product_name", "Nome do produto"),
      area("description", "Descrição"),
      num("amount", "Valor em reais"),
      num("expires_minutes", "Validade em minutos"),
      num("platform_fee_percent", "Comissão da plataforma (%)"),
      area("success_message", "Mensagem após pagamento"),
    ],
    outputs: ["pago", "expirado"],
  },
  {
    type: "subscription",
    label: "Assinatura",
    group: "monetização",
    icon: Repeat,
    accent: "primary",
    fields: [text("plan_name", "Nome do plano"), num("amount", "Valor em reais"), num("interval_days", "Intervalo em dias"), area("success_message", "Mensagem após pagamento")],
  },
  { type: "upsell", label: "Upsell", group: "monetização", icon: TrendingUp, accent: "primary", fields: [text("product_name", "Produto"), num("amount", "Valor em reais"), area("pitch", "Oferta")] },
  { type: "downsell", label: "Downsell", group: "monetização", icon: TrendingDown, accent: "primary", fields: [text("product_name", "Produto"), num("amount", "Valor em reais"), area("pitch", "Oferta")] },
  { type: "order_bump", label: "Order Bump", group: "monetização", icon: PackagePlus, accent: "primary", fields: [text("product_name", "Produto adicional"), num("amount", "Valor em reais"), area("pitch", "Chamada")] },
  { type: "pack", label: "Pack", group: "monetização", icon: Package, accent: "primary", fields: [text("product_name", "Nome do pack"), num("amount", "Valor em reais"), area("content", "Conteúdo entregue")] },

  { type: "release_channel", label: "Liberar canal", group: "acesso", icon: Radio, accent: "chart-2", fields: [text("channel_id", "ID do canal VIP"), area("message", "Mensagem de acesso")] },
  { type: "release_group", label: "Liberar grupo", group: "acesso", icon: Users, accent: "chart-2", fields: [text("group_id", "ID do grupo VIP"), area("message", "Mensagem de acesso")] },
  { type: "delivery", label: "Entrega", group: "acesso", icon: Package, accent: "chart-2", fields: [area("content", "Conteúdo entregue (link ou texto)")] },
  { type: "payment", label: "Pagamento (legado)", group: "monetização", icon: QrCode, accent: "muted", fields: [num("amount", "Valor em reais"), text("description", "Descrição")] },
  { type: "end", label: "Finalizar fluxo", group: "acesso", icon: Flag, accent: "muted", fields: [area("message", "Mensagem final")] },
];

export const nodeByType = Object.fromEntries(nodeDefinitions.map((n) => [n.type, n])) as Record<
  string,
  NodeDefinition
>;

export const nodeGroups: NodeGroup[] = [
  "início",
  "conteúdo",
  "interação",
  "lógica",
  "monetização",
  "acesso",
];

export const accentClasses: Record<NodeDefinition["accent"], string> = {
  primary: "border-primary/60 text-primary",
  "chart-2": "border-[var(--color-chart-2)]/60 text-[var(--color-chart-2)]",
  "chart-3": "border-[var(--color-chart-3)]/60 text-[var(--color-chart-3)]",
  "chart-4": "border-[var(--color-chart-4)]/60 text-[var(--color-chart-4)]",
  muted: "border-border text-muted-foreground",
};
