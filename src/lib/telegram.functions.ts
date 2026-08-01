import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({ token: z.string().trim().min(20).max(200) });

export type TelegramValidation =
  | { ok: true; username: string | null; botId: number; firstName: string | null }
  | { ok: false; error: string };

export const validateTelegramToken = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<TelegramValidation> => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${data.token}/getMe`);
      const json = (await res.json()) as {
        ok: boolean;
        description?: string;
        result?: { id: number; username?: string; first_name?: string };
      };
      if (!json.ok || !json.result) {
        return { ok: false, error: json.description ?? "Token inválido" };
      }
      return {
        ok: true,
        username: json.result.username ?? null,
        botId: json.result.id,
        firstName: json.result.first_name ?? null,
      };
    } catch {
      return { ok: false, error: "Não foi possível contatar o Telegram" };
    }
  });
