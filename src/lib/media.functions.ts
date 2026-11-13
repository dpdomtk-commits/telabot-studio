import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MediaActionResult = { ok: boolean; message: string; title?: string };

/** Testa o canal/grupo de cache de mídia via getChat e atualiza o status. */
export const testMediaCache = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ chatId: z.string().trim().min(2).max(64), botId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<MediaActionResult> => {
    const { data: bot } = await context.supabase
      .from("bots")
      .select("token")
      .eq("id", data.botId)
      .maybeSingle();
    if (!bot?.token) return { ok: false, message: "Bot não encontrado" };

    let title = "";
    let ok = false;
    let message = "Não foi possível acessar o chat";
    try {
      const res = await fetch(`https://api.telegram.org/bot${bot.token}/getChat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: data.chatId }),
      });
      const json = (await res.json()) as { ok: boolean; description?: string; result?: { title?: string } };
      ok = json.ok;
      title = json.result?.title ?? "";
      message = json.ok ? "Conexão validada" : (json.description ?? message);
    } catch {
      message = "Falha de rede ao contatar o Telegram";
    }

    await context.supabase
      .from("media_cache_settings")
      .update({
        status: ok ? "connected" : "error",
        last_error: ok ? null : message,
        chat_title: title || null,
        last_checked_at: new Date().toISOString(),
      })
      .eq("user_id", context.userId);

    return { ok, message, title };
  });

/** Retorna a miniatura de uma mídia como data URL (o arquivo vive no cache do Telegram). */
export const getMediaThumbnail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ assetId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ dataUrl: string | null }> => {
    const { data: asset } = await context.supabase
      .from("media_assets")
      .select("thumbnail,telegram_file_id,file_type")
      .eq("id", data.assetId)
      .maybeSingle();
    const fileId = asset?.thumbnail ?? (asset?.file_type === "image" ? asset.telegram_file_id : null);
    if (!fileId) return { dataUrl: null };

    const { data: settings } = await context.supabase
      .from("media_cache_settings")
      .select("bot_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!settings?.bot_id) return { dataUrl: null };

    const { data: bot } = await context.supabase
      .from("bots")
      .select("token")
      .eq("id", settings.bot_id)
      .maybeSingle();
    if (!bot?.token) return { dataUrl: null };

    try {
      const res = await fetch(`https://api.telegram.org/bot${bot.token}/getFile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });
      const json = (await res.json()) as { ok: boolean; result?: { file_path?: string } };
      const path = json.result?.file_path;
      if (!json.ok || !path) return { dataUrl: null };

      const fileRes = await fetch(`https://api.telegram.org/file/bot${bot.token}/${path}`);
      const buf = new Uint8Array(await fileRes.arrayBuffer());
      if (buf.byteLength > 400_000) return { dataUrl: null };
      let binary = "";
      for (const byte of buf) binary += String.fromCharCode(byte);
      const mime = fileRes.headers.get("content-type") ?? "image/jpeg";
      return { dataUrl: `data:${mime};base64,${btoa(binary)}` };
    } catch {
      return { dataUrl: null };
    }
  });

