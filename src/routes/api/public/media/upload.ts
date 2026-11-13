import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type MediaKind = "image" | "video" | "audio" | "document";

const METHOD: Record<MediaKind, { method: string; field: string }> = {
  image: { method: "sendPhoto", field: "photo" },
  video: { method: "sendVideo", field: "video" },
  audio: { method: "sendAudio", field: "audio" },
  document: { method: "sendDocument", field: "document" },
};

const MAX_SIZE = 45 * 1024 * 1024;

function kindFromMime(mime: string, explicit: string | null): MediaKind {
  if (explicit === "image" || explicit === "video" || explicit === "audio" || explicit === "document") return explicit;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

type TgResult = {
  ok: boolean;
  description?: string;
  result?: {
    message_id?: number;
    photo?: { file_id: string; file_unique_id: string; width: number }[];
    video?: { file_id: string; file_unique_id: string; thumbnail?: { file_id: string } };
    audio?: { file_id: string; file_unique_id: string };
    document?: { file_id: string; file_unique_id: string; thumbnail?: { file_id: string } };
  };
};

export const Route = createFileRoute("/api/public/media/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
        if (!token) return Response.json({ error: "Não autenticado" }, { status: 401 });

        const url = process.env["SUPABASE_URL"]!;
        const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
        const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

        const { data: userData } = await admin.auth.getUser(token);
        const user = userData.user;
        if (!user) return Response.json({ error: "Sessão inválida" }, { status: 401 });

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return Response.json({ error: "Arquivo ausente" }, { status: 400 });
        if (file.size > MAX_SIZE) return Response.json({ error: "Arquivo maior que 45 MB" }, { status: 400 });

        const kind = kindFromMime(file.type || "", (form.get("kind") as string | null) ?? null);

        const { data: settings } = await admin
          .from("media_cache_settings")
          .select("chat_id,bot_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!settings?.chat_id || !settings.bot_id) {
          return Response.json(
            { error: "Configure o canal de cache de mídia em Configurações antes de enviar arquivos." },
            { status: 400 },
          );
        }

        const { data: bot } = await admin
          .from("bots")
          .select("token")
          .eq("id", settings.bot_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!bot?.token) return Response.json({ error: "Bot do cache indisponível" }, { status: 400 });

        const { method, field } = METHOD[kind];
        const tgForm = new FormData();
        tgForm.append("chat_id", settings.chat_id);
        tgForm.append("caption", file.name.slice(0, 200));
        tgForm.append(field, file, file.name);

        const res = await fetch(`https://api.telegram.org/bot${bot.token}/${method}`, {
          method: "POST",
          body: tgForm,
        });
        const json = (await res.json()) as TgResult;
        if (!json.ok || !json.result) {
          return Response.json({ error: json.description ?? "Falha ao enviar para o Telegram" }, { status: 400 });
        }

        const r = json.result;
        let fileId = "";
        let uniqueId: string | null = null;
        let thumbnail: string | null = null;
        if (kind === "image" && r.photo?.length) {
          const best = [...r.photo].sort((a, b) => a.width - b.width).at(-1)!;
          fileId = best.file_id;
          uniqueId = best.file_unique_id;
          thumbnail = r.photo[0]?.file_id ?? best.file_id;
        } else if (kind === "video" && r.video) {
          fileId = r.video.file_id;
          uniqueId = r.video.file_unique_id;
          thumbnail = r.video.thumbnail?.file_id ?? null;
        } else if (kind === "audio" && r.audio) {
          fileId = r.audio.file_id;
          uniqueId = r.audio.file_unique_id;
        } else if (r.document) {
          fileId = r.document.file_id;
          uniqueId = r.document.file_unique_id;
          thumbnail = r.document.thumbnail?.file_id ?? null;
        }
        if (!fileId) return Response.json({ error: "Telegram não retornou o arquivo" }, { status: 400 });

        const { data: asset, error } = await admin
          .from("media_assets")
          .insert({
            user_id: user.id,
            telegram_file_id: fileId,
            telegram_file_unique_id: uniqueId,
            message_id: r.message_id ?? null,
            file_name: file.name.slice(0, 200),
            file_type: kind,
            mime_type: file.type || null,
            file_size: file.size,
            thumbnail,
          })
          .select("id,telegram_file_id,file_name,file_type,file_size,thumbnail,created_at")
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        await admin
          .from("media_cache_settings")
          .update({ status: "connected", last_error: null, last_checked_at: new Date().toISOString() })
          .eq("user_id", user.id);

        return Response.json({ asset });
      },
    },
  },
});
