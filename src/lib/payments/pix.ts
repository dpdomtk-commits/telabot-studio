/**
 * Gerador de PIX Copia e Cola (BR Code / EMV MPM).
 * Puro, sem dependências — usado pelo provedor interno da gateway.
 */

function tag(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitize(value: string, max: number) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .-]/g, "")
    .trim()
    .slice(0, max);
}

export type PixPayloadInput = {
  key: string;
  amountCents: number;
  merchantName: string;
  merchantCity: string;
  reference: string;
  description?: string;
};

/** Monta o código PIX copia e cola estático com identificador da cobrança. */
export function buildPixPayload(input: PixPayloadInput): string {
  const merchantAccount =
    tag("00", "br.gov.bcb.pix") +
    tag("01", input.key) +
    (input.description ? tag("02", sanitize(input.description, 60)) : "");

  const payload =
    tag("00", "01") +
    tag("26", merchantAccount) +
    tag("52", "0000") +
    tag("53", "986") +
    tag("54", (input.amountCents / 100).toFixed(2)) +
    tag("58", "BR") +
    tag("59", sanitize(input.merchantName, 25) || "RECEBEDOR") +
    tag("60", sanitize(input.merchantCity, 15) || "SAO PAULO") +
    tag("62", tag("05", sanitize(input.reference, 25) || "***"));

  const withCrcTag = `${payload}6304`;
  return `${withCrcTag}${crc16(withCrcTag)}`;
}
