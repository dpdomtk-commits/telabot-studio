import { supabase } from "@/integrations/supabase/client";

export type MediaKind = "image" | "video" | "audio" | "document";

export type MediaAsset = {
  id: string;
  telegram_file_id: string;
  file_name: string;
  file_type: MediaKind;
  file_size: number;
  thumbnail: string | null;
  created_at: string;
};

export const mediaKindLabels: Record<MediaKind, string> = {
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  document: "Documento",
};

export const mediaAccept: Record<MediaKind, string> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
  document: "*/*",
};

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function kindFromFile(file: File): MediaKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string" && reader.result) {
        resolve(reader.result);
      } else {
        reject(new Error("Não foi possível ler o arquivo do computador"));
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler arquivo do computador"));
    reader.readAsDataURL(file);
  });
}

/** Envia o arquivo ao servidor/Telegram e usa fallback persistente (Storage / Data URL) se necessário. */
export async function uploadMedia(file: File, kind?: MediaKind): Promise<MediaAsset> {
  const resolvedKind = kind ?? kindFromFile(file);
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (token) {
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", resolvedKind);

      const res = await fetch("/api/public/media/upload", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const json = (await res.json()) as { asset?: MediaAsset };
        if (json.asset) return json.asset;
      }
    } catch (apiErr) {
      console.warn("[uploadMedia-api-fallback]", apiErr);
    }
  }

  let dataUrlOrPublicUrl = await fileToDataUrl(file);
  const userId = sessionData.session?.user?.id;

  if (userId) {
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${userId}/${Date.now()}_${sanitizedName}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: true,
        });
      if (!upErr) {
        const { data: pubData } = supabase.storage.from("media").getPublicUrl(storagePath);
        if (pubData?.publicUrl) {
          dataUrlOrPublicUrl = pubData.publicUrl;
        }
      }
    } catch (storageErr) {
      console.warn("[uploadMedia-storage-fallback]", storageErr);
    }

    try {
      const { data: inserted } = await supabase
        .from("media_assets")
        .insert({
          user_id: userId,
          telegram_file_id: dataUrlOrPublicUrl,
          file_name: file.name.slice(0, 200),
          file_type: resolvedKind,
          mime_type: file.type || null,
          file_size: file.size,
          thumbnail: resolvedKind === "image" ? dataUrlOrPublicUrl : null,
        })
        .select("id,telegram_file_id,file_name,file_type,file_size,thumbnail,created_at")
        .maybeSingle();

      if (inserted) return inserted as MediaAsset;
    } catch (dbErr) {
      console.warn("[uploadMedia-db-fallback]", dbErr);
    }
  }

  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    telegram_file_id: dataUrlOrPublicUrl,
    file_name: file.name,
    file_type: resolvedKind,
    file_size: file.size,
    thumbnail: resolvedKind === "image" ? dataUrlOrPublicUrl : null,
    created_at: new Date().toISOString(),
  };
}
