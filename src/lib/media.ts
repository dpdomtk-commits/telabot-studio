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

/** Envia o arquivo ao servidor, que o publica no canal de cache do Telegram. */
export async function uploadMedia(file: File, kind?: MediaKind): Promise<MediaAsset> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sessão expirada");

  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind ?? kindFromFile(file));

  const res = await fetch("/api/public/media/upload", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const json = (await res.json()) as { asset?: MediaAsset; error?: string };
  if (!res.ok || !json.asset) throw new Error(json.error ?? "Falha no envio do arquivo");
  return json.asset;
}
