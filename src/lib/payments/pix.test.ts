import { describe, expect, it } from "vitest";
import { buildPixPayload, crc16, parseTlv, validatePixCode, validatePixKey } from "./pix";

const base = {
  amountCents: 1990,
  merchantName: "Loja Ação Ltda",
  merchantCity: "São Paulo",
  reference: "PAY_ABC-123",
  description: "Pacote Premium",
};

describe("crc16 (CCITT-FALSE)", () => {
  it("calcula o vetor de referência do BCB", () => {
    // Exemplo oficial do Manual do BR Code
    const payload =
      "00020126330014BR.GOV.BCB.PIX011112345678901520400005303986540510.005802BR5913Fulano de Tal6008BRASILIA62070503***6304";
    expect(crc16(payload)).toBe("C39F");
  });

  it("retorna sempre 4 caracteres hexadecimais", () => {
    expect(crc16("A")).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe("validatePixKey", () => {
  it("aceita CPF, CNPJ, e-mail, EVP e telefone", () => {
    expect(validatePixKey("111.444.777-35")).toMatchObject({ valid: true, type: "cpf", key: "11144477735" });
    expect(validatePixKey("11.222.333/0001-81")).toMatchObject({ valid: true, type: "cnpj" });
    expect(validatePixKey("Loja@Exemplo.com")).toMatchObject({ valid: true, type: "email", key: "loja@exemplo.com" });
    expect(validatePixKey("123E4567-E89B-12D3-A456-426614174000")).toMatchObject({ valid: true, type: "evp" });
    expect(validatePixKey("(11) 99999-8888")).toMatchObject({ valid: true, type: "phone", key: "+5511999998888" });
    expect(validatePixKey("+5511999998888")).toMatchObject({ valid: true, type: "phone" });
  });

  it("rejeita chaves inválidas", () => {
    expect(validatePixKey("").valid).toBe(false);
    expect(validatePixKey("111.444.777-30").valid).toBe(false); // dígito verificador errado
    expect(validatePixKey("00000000000").valid).toBe(false);
    expect(validatePixKey("sem-arroba").valid).toBe(false);
    expect(validatePixKey("usuario@@dominio").valid).toBe(false);
    expect(validatePixKey("12345").valid).toBe(false);
  });
});

describe("buildPixPayload", () => {
  const keys = [
    "11144477735",
    "11222333000181",
    "loja@exemplo.com",
    "123e4567-e89b-12d3-a456-426614174000",
    "+5511999998888",
  ];

  it.each(keys)("gera BR Code válido para a chave %s", (key) => {
    const code = buildPixPayload({ ...base, key });
    expect(validatePixCode(code)).toEqual({ valid: true, errors: [] });
  });

  it("respeita a estrutura TLV e os campos obrigatórios", () => {
    const code = buildPixPayload({ ...base, key: "loja@exemplo.com" });
    const nodes = parseTlv(code);
    const map = Object.fromEntries(nodes.map((n) => [n.id, n.value]));
    expect(map["00"]).toBe("01");
    expect(map["52"]).toBe("0000");
    expect(map["53"]).toBe("986");
    expect(map["54"]).toBe("19.90");
    expect(map["58"]).toBe("BR");
    expect(map["59"]).toBe("LOJA ACAO LTDA");
    expect(map["60"]).toBe("SAO PAULO");
    const mai = parseTlv(map["26"] as string);
    expect(mai.find((n) => n.id === "00")?.value).toBe("br.gov.bcb.pix");
    expect(mai.find((n) => n.id === "01")?.value).toBe("loja@exemplo.com");
  });

  it("gera TXID apenas alfanumérico com no máximo 25 caracteres", () => {
    const code = buildPixPayload({ ...base, key: "11144477735", reference: "pay_abc-123/xyz".repeat(5) });
    const additional = parseTlv(code).find((n) => n.id === "62")?.value as string;
    const txid = parseTlv(additional).find((n) => n.id === "05")?.value as string;
    expect(txid).toMatch(/^[A-Za-z0-9]{1,25}$/);
    expect(txid.length).toBeLessThanOrEqual(25);
  });

  it("mantém nome e cidade dentro dos limites do padrão", () => {
    const code = buildPixPayload({
      ...base,
      key: "11144477735",
      merchantName: "Estabelecimento Com Nome Extremamente Longo",
      merchantCity: "Cidade Com Nome Muito Grande",
    });
    const map = Object.fromEntries(parseTlv(code).map((n) => [n.id, n.value]));
    expect((map["59"] as string).length).toBeLessThanOrEqual(25);
    expect((map["60"] as string).length).toBeLessThanOrEqual(15);
    expect(validatePixCode(code).valid).toBe(true);
  });

  it("não emite o campo de valor quando a cobrança é zero", () => {
    const code = buildPixPayload({ ...base, key: "11144477735", amountCents: 0 });
    expect(parseTlv(code).some((n) => n.id === "54")).toBe(false);
    expect(validatePixCode(code).valid).toBe(true);
  });

  it("formata o valor com duas casas decimais", () => {
    const code = buildPixPayload({ ...base, key: "11144477735", amountCents: 100000 });
    const map = Object.fromEntries(parseTlv(code).map((n) => [n.id, n.value]));
    expect(map["54"]).toBe("1000.00");
  });

  it("nunca ultrapassa 99 bytes no objeto 26 mesmo com descrição longa", () => {
    const code = buildPixPayload({
      ...base,
      key: "usuario.com.nome.bastante.longo@dominio-de-exemplo.com.br",
      description: "Descrição de produto muito longa ".repeat(10),
    });
    const mai = parseTlv(code).find((n) => n.id === "26")?.value as string;
    expect(mai.length).toBeLessThanOrEqual(99);
    expect(validatePixCode(code).valid).toBe(true);
  });

  it("lança erro quando a chave PIX é inválida", () => {
    expect(() => buildPixPayload({ ...base, key: "chave-invalida" })).toThrow(/Chave PIX inválida/);
    expect(() => buildPixPayload({ ...base, key: "" })).toThrow(/Chave PIX inválida/);
  });

  it("produz códigos idênticos para as mesmas entradas (QR e copia e cola)", () => {
    const a = buildPixPayload({ ...base, key: "11144477735" });
    const b = buildPixPayload({ ...base, key: "11144477735" });
    expect(a).toBe(b);
  });

  it("gera apenas caracteres ASCII imprimíveis", () => {
    const code = buildPixPayload({ ...base, key: "11144477735" });
    expect(code).toMatch(/^[\x20-\x7E]+$/);
  });
});

describe("validatePixCode", () => {
  const valid = buildPixPayload({ ...base, key: "11144477735" });

  it("detecta CRC adulterado", () => {
    const broken = `${valid.slice(0, -4)}0000`;
    const result = validatePixCode(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/CRC16 inválido/);
  });

  it("detecta corpo adulterado (CRC deixa de bater)", () => {
    const tampered = valid.replace("19.90", "99.90");
    expect(validatePixCode(tampered).valid).toBe(false);
  });

  it("detecta TLV malformado", () => {
    expect(validatePixCode("0002zz").valid).toBe(false);
  });

  it("rejeita código vazio", () => {
    expect(validatePixCode("").valid).toBe(false);
  });
});
