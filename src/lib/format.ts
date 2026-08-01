export function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function maskToken(token: string) {
  if (token.length <= 8) return "••••";
  return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
}

export const stepLabels: Record<string, string> = {
  message: "Mensagem",
  image: "Imagem",
  button: "Botão",
  delay: "Espera",
  payment: "Pagamento",
  delivery: "Entrega",
};

export const paymentStatusLabels: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  failed: "Falhou",
  refunded: "Estornado",
};

export const leadStatusLabels: Record<string, string> = {
  new: "Novo",
  engaged: "Em contato",
  converted: "Convertido",
};
