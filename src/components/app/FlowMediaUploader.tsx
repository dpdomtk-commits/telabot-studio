import { useRef, useState } from "react";
import { Plus, Trash2, Video, Image as ImageIcon, Music, Sparkles, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { uploadMedia, kindFromFile, type MediaKind } from "@/lib/media";

export type FlowMediaItem = {
  id: string;
  url?: string;
  fileId: string;
  kind: "image" | "video" | "audio";
  name?: string;
  caption?: string;
  isDynamic?: boolean;
};

interface FlowMediaUploaderProps {
  media: FlowMediaItem[];
  onChange: (items: FlowMediaItem[]) => void;
  maxItems?: number;
  mode?: "separated" | "grouped";
  onModeChange?: (mode: "separated" | "grouped") => void;
}

export function FlowMediaUploader({
  media = [],
  onChange,
  maxItems = 3,
  mode = "separated",
  onModeChange,
}: FlowMediaUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const availableSlots = maxItems - media.length;
    if (availableSlots <= 0) {
      toast.error(`Limite máximo de ${maxItems} mídias atingido`);
      return;
    }

    const filesToUpload = Array.from(fileList).slice(0, availableSlots);
    setUploading(true);

    try {
      const addedItems: FlowMediaItem[] = [];

      for (const file of filesToUpload) {
        const kind = kindFromFile(file);

        // Converte primeiro para base64 persistente para garantir visualização e envio
        const base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string) || "");
          reader.readAsDataURL(file);
        });

        let telegramFileId = "";
        let finalUrl = base64Data;

        // Tenta upload para o servidor/Telegram em background
        try {
          const asset = await uploadMedia(file, kind);
          if (asset?.telegram_file_id) {
            telegramFileId = asset.telegram_file_id;
            if (asset.telegram_file_id.startsWith("http")) {
              finalUrl = asset.telegram_file_id;
            }
          }
        } catch (uploadErr) {
          console.warn("Upload fallback permanente base64:", uploadErr);
        }

        addedItems.push({
          id: Math.random().toString(36).slice(2, 9),
          url: finalUrl,
          fileId: telegramFileId || finalUrl,
          kind: kind === "audio" ? "audio" : kind === "video" ? "video" : "image",
          name: file.name,
          caption: "",
          isDynamic: false,
        });
      }

      onChange([...media, ...addedItems]);
      toast.success(
        addedItems.length === 1
          ? "Mídia adicionada com sucesso!"
          : `${addedItems.length} mídias adicionadas com sucesso!`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar mídia");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemove(id: string) {
    onChange(media.filter((m) => m.id !== id));
  }

  function handleToggleDynamic(id: string) {
    onChange(
      media.map((m) => (m.id === id ? { ...m, isDynamic: !m.isDynamic } : m))
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <ImageIcon className="size-4 text-primary" /> Mídias
          </label>
          <span className="text-xs text-muted-foreground">Adicione até {maxItems} mídias</span>
        </div>

        {onModeChange && (
          <div className="flex items-center gap-1 rounded-lg bg-surface/80 p-0.5 border border-border text-xs">
            <span className="text-muted-foreground px-1.5 text-[11px]">Envio:</span>
            <button
              type="button"
              onClick={() => onModeChange("separated")}
              className={`rounded px-2 py-0.5 transition ${
                mode === "separated"
                  ? "bg-primary/20 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Separadas
            </button>
            <button
              type="button"
              onClick={() => onModeChange("grouped")}
              className={`rounded px-2 py-0.5 transition ${
                mode === "grouped"
                  ? "bg-primary/20 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Agrupadas
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {media.map((item) => (
          <div
            key={item.id}
            className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border/80 bg-surface/50 p-1 w-32 h-44 transition hover:border-primary/50 shadow-sm"
          >
            {/* Visual preview */}
            <div className="relative w-full h-32 rounded-lg overflow-hidden bg-black/40 flex items-center justify-center">
              {item.kind === "video" ? (
                <div className="relative w-full h-full flex items-center justify-center bg-black/60">
                  {item.url ? (
                    <video src={item.url} className="w-full h-full object-cover" />
                  ) : (
                    <Video className="size-8 text-primary" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="rounded-full bg-black/70 p-2 text-white shadow-md">
                      <Video className="size-4" />
                    </span>
                  </div>
                </div>
              ) : item.kind === "audio" ? (
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <Music className="size-8 text-primary mb-1" />
                  <span className="text-[10px] text-center px-1 truncate w-28">{item.name}</span>
                </div>
              ) : (
                <img
                  src={item.url || "/placeholder.svg"}
                  alt={item.name || "Preview"}
                  className="w-full h-full object-cover"
                />
              )}

              {/* Botão de excluir */}
              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-red-400 opacity-90 transition hover:bg-red-500 hover:text-white"
                title="Remover mídia"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            {/* Controle Mídia Dinâmica */}
            <div className="mt-1 flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => handleToggleDynamic(item.id)}
                className={`flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 transition ${
                  item.isDynamic
                    ? "bg-primary/20 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="size-3 text-pink-500" />
                Mídia Dinâmica
              </button>
            </div>
          </div>
        ))}

        {media.length < maxItems && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/80 bg-surface/30 w-32 h-44 text-muted-foreground transition hover:border-primary/60 hover:text-primary hover:bg-primary/5 cursor-pointer disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="size-6 animate-spin mb-1 text-primary" />
                <span className="text-[11px] font-medium">Enviando...</span>
              </>
            ) : (
              <>
                <div className="rounded-full bg-surface-hover p-2 mb-2 border border-border group-hover:border-primary/40">
                  <Plus className="size-5" />
                </div>
                <span className="text-xs font-medium text-foreground">Adicionar mídia</span>
                <span className="text-[10px] text-muted-foreground">({media.length}/{maxItems})</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
