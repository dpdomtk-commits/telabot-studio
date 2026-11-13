/**
 * Gerador e validador de PIX Copia e Cola (BR Code / EMV MPM).
 * Conforme "Manual de Padrões para Iniciação do PIX" (Banco Central) e EMVCo MPM.
 * Puro, sem dependências — usado pelo provedor interno da gateway.
 */

export type PixKeyType = "cpf" | "cnpj" | "phone" | "email" | "evp";

export type PixKeyValidation =
  | { valid: true; type: PixKeyType; key: string }
  | { valid: false; type: null; key: string; error: string };

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const EVP_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function validCpf(cpf: string) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(cpf[len])) return false;
  }
  return true;
}

function validCnpj(cnpj: string) {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * (weights[i] as number);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

/**
 * Valida e normaliza a chave PIX para o formato exigido pelo BR Code.
 * Telefone vira +55DDDNNNNNNNNN, e-mail em minúsculas, CPF/CNPJ só dígitos, EVP em minúsculas.
 */
export function validatePixKey(rawKey: string | null | undefined): PixKeyValidation {
  const key = (rawKey ?? "").trim();
  if (!key) return { valid: false, type: null, key, error: "Chave PIX não configurada" };
  if (key.length > 77) return { valid: false, type: null, key, error: "Chave PIX excede 77 caracteres" };

  if (EVP_RE.test(key.toLowerCase())) return { valid: true, type: "evp", key: key.toLowerCase() };
  if (key.includes("@")) {
    const email = key.toLowerCase();
    return EMAIL_RE.test(email)
      ? { valid: true, type: "email", key: email }
      : { valid: false, type: null, key, error: "E-mail inválido para chave PIX" };
  }

  if (/^[+(\d][\d\s().\-/]*$/.test(key)) {
    const d = digitsOnly(key);
    const explicitPhone = key.trim().startsWith("+");

    // Telefone: +55 + DDD válido (11-99) + 8 ou 9 dígitos (móvel inicia com 9).
    const asPhone = (digits: string) => {
      const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
      if (local.length !== 10 && local.length !== 11) return null;
      const ddd = Number(local.slice(0, 2));
      if (ddd < 11 || ddd > 99) return null;
      if (local.length === 11 && local[2] !== "9") return null;
      if (local.length === 10 && !/[2-5]/.test(local[2] as string)) return null;
      return `+55${local}`;
    };

    if (explicitPhone) {
      const phone = asPhone(d);
      return phone
        ? { valid: true, type: "phone", key: phone }
        : { valid: false, type: null, key, error: "Telefone inválido: use o formato +5511999999999" };
    }

    if (d.length === 11 && validCpf(d)) return { valid: true, type: "cpf", key: d };
    if (d.length === 14 && validCnpj(d)) return { valid: true, type: "cnpj", key: d };

    const phone = asPhone(d);
    if (phone) return { valid: true, type: "phone", key: phone };

    return {
      valid: false,
      type: null,
      key,
      error: "Chave numérica inválida: use CPF, CNPJ válidos ou telefone no formato +5511999999999",
    };
  }

  return { valid: false, type: null, key, error: "Formato de chave PIX não reconhecido" };
}


/** Comprimento em bytes (EMV mede bytes, não code points). */
function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function tag(id: string, value: string) {
  const len = byteLength(value);
  if (len > 99) throw new Error(`Campo ${id} excede 99 bytes (${len})`);
  return `${id}${String(len).padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE, polinômio 0x1021, inicial 0xFFFF — exigido pelo campo 63. */
export function crc16(payload: string) {
  const bytes = new TextEncoder().encode(payload);
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Remove acentos e caracteres não suportados pelo padrão (ASCII imprimível restrito). */
function sanitizeText(value: string, max: number) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim()
    .toUpperCase();
}

/** TXID: apenas alfanumérico, 1..25 caracteres. */
function sanitizeTxid(value: string) {
  const clean = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  return clean || "***";
}

export type PixPayloadInput = {
  key: string;
  amountCents: number;
  merchantName: string;
  merchantCity: string;
  reference: string;
  description?: string;
};

export type TlvNode = { id: string; value: string; children?: TlvNode[] };

/** Faz o parse de uma cadeia TLV EMV em nós id/valor. */
export function parseTlv(payload: string): TlvNode[] {
  const nodes: TlvNode[] = [];
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const lenRaw = payload.slice(i + 2, i + 4);
    if (id.length < 2 || lenRaw.length < 2 || !/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenRaw)) {
      throw new Error(`TLV malformado na posição ${i}`);
    }
    const len = Number(lenRaw);
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length !== len) throw new Error(`Campo ${id} declara ${len} bytes mas tem ${value.length}`);
    nodes.push({ id, value });
    i += 4 + len;
  }
  return nodes;
}

export type PixCodeValidation = { valid: boolean; errors: string[] };

/**
 * Valida um BR Code completo: estrutura TLV, campos obrigatórios,
 * comprimentos e CRC16. Usada antes de devolver o código ao usuário.
 */
export function validatePixCode(code: string): PixCodeValidation {
  const errors: string[] = [];
  if (!code) return { valid: false, errors: ["Código PIX vazio"] };
  if (code.length > 512) errors.push("Código PIX excede 512 caracteres");

  let nodes: TlvNode[];
  try {
    nodes = parseTlv(code);
  } catch (e) {
    return { valid: false, errors: [e instanceof Error ? e.message : "TLV inválido"] };
  }

  const get = (id: string) => nodes.find((n) => n.id === id)?.value;

  if (get("00") !== "01") errors.push("Payload Format Indicator (00) deve ser 01");

  const mai = get("26");
  if (!mai) {
    errors.push("Merchant Account Information (26) ausente");
  } else {
    let sub: TlvNode[] = [];
    try {
      sub = parseTlv(mai);
    } catch {
      errors.push("Merchant Account Information (26) malformado");
    }
    const gui = sub.find((n) => n.id === "00")?.value;
    const key = sub.find((n) => n.id === "01")?.value;
    if (gui?.toLowerCase() !== "br.gov.bcb.pix") errors.push("GUI (26-00) deve ser br.gov.bcb.pix");
    if (!key) errors.push("Chave PIX (26-01) ausente");
    else if (!validatePixKey(key).valid) errors.push("Chave PIX (26-01) inválida");
    const desc = sub.find((n) => n.id === "02")?.value;
    if (desc && byteLength(desc) > 72) errors.push("Descrição (26-02) excede 72 caracteres");
  }

  if (get("52") !== "0000" && !/^\d{4}$/.test(get("52") ?? "")) errors.push("Merchant Category Code (52) inválido");
  if (get("53") !== "986") errors.push("Transaction Currency (53) deve ser 986");

  const amount = get("54");
  if (amount !== undefined) {
    if (!/^\d+\.\d{2}$/.test(amount)) errors.push("Transaction Amount (54) deve estar no formato 0.00");
    if (amount.length > 13) errors.push("Transaction Amount (54) excede 13 caracteres");
    if (Number(amount) <= 0) errors.push("Transaction Amount (54) deve ser maior que zero");
  }

  if (get("58") !== "BR") errors.push("Country Code (58) deve ser BR");

  const name = get("59");
  if (!name) errors.push("Merchant Name (59) ausente");
  else if (byteLength(name) > 25) errors.push("Merchant Name (59) excede 25 caracteres");

  const city = get("60");
  if (!city) errors.push("Merchant City (60) ausente");
  else if (byteLength(city) > 15) errors.push("Merchant City (60) excede 15 caracteres");

  const additional = get("62");
  if (additional) {
    try {
      const txid = parseTlv(additional).find((n) => n.id === "05")?.value;
      if (!txid) errors.push("TXID (62-05) ausente");
      else if (txid !== "***" && !/^[A-Za-z0-9]{1,25}$/.test(txid)) errors.push("TXID (62-05) inválido");
    } catch {
      errors.push("Additional Data Field (62) malformado");
    }
  }

  const crcIndex = code.lastIndexOf("6304");
  if (crcIndex === -1 || crcIndex !== code.length - 8) {
    errors.push("Campo CRC (63) deve ser o último com 4 caracteres");
  } else {
    const expected = crc16(code.slice(0, crcIndex + 4));
    const actual = code.slice(-4);
    if (expected !== actual.toUpperCase()) errors.push(`CRC16 inválido: esperado ${expected}, recebido ${actual}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Monta o BR Code (PIX copia e cola) com identificador da cobrança.
 * Lança erro se a chave PIX for inválida ou se o código gerado não passar na validação —
 * o mesmo código validado alimenta tanto o QR Code quanto o copia e cola.
 */
export function buildPixPayload(input: PixPayloadInput): string {
  const keyCheck = validatePixKey(input.key);
  if (!keyCheck.valid) throw new Error(`Chave PIX inválida: ${keyCheck.error}`);

  if (!Number.isFinite(input.amountCents) || input.amountCents < 0) {
    throw new Error("Valor da cobrança inválido");
  }

  const txid = sanitizeTxid(input.reference);
  const name = sanitizeText(input.merchantName, 25) || "RECEBEDOR";
  const city = sanitizeText(input.merchantCity, 15) || "SAO PAULO";
  // O objeto 26 inteiro cabe em 99 bytes: GUI (18) + chave (4 + n) + descrição (4 + n).
  const descriptionRoom = Math.min(72, 99 - 18 - (4 + keyCheck.key.length) - 4);
  const description =
    input.description && descriptionRoom > 0 ? sanitizeText(input.description, descriptionRoom) : "";

  const merchantAccount =
    tag("00", "br.gov.bcb.pix") + tag("01", keyCheck.key) + (description ? tag("02", description) : "");

  const amount = input.amountCents > 0 ? (input.amountCents / 100).toFixed(2) : null;

  const payload =
    tag("00", "01") +
    tag("01", "12") + // Point of Initiation: uso único (cobrança específica)
    tag("26", merchantAccount) +
    tag("52", "0000") +
    tag("53", "986") +
    (amount ? tag("54", amount) : "") +
    tag("58", "BR") +
    tag("59", name) +
    tag("60", city) +
    tag("62", tag("05", txid));

  const withCrcTag = `${payload}6304`;
  const code = `${withCrcTag}${crc16(withCrcTag)}`;

  const check = validatePixCode(code);
  if (!check.valid) throw new Error(`BR Code inválido: ${check.errors.join("; ")}`);
  return code;
}
