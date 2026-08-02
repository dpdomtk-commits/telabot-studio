import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Image as ImageIcon, Video, Mic, FileText, Upload, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMediaThumbnail } from "@/lib/media.functions";
import { formatBytes, mediaAccept, mediaKindLabels, uploadMedia, type MediaAsset, type MediaKind } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const icons: Record<MediaKind, typeof ImageIcon> = { image: ImageIcon, video: Video, audio: Mic, document: FileText };

export function useMediaAssets(kind?: MediaKind) {
  return useQuery({
    queryKey: ["media-assets", kind ?? "all"],
    queryFn: async (): Promise<MediaAsset[]> => {
      let query = supabase
        .from("media_assets")
        .select("id,telegram_file_id,file_name,file_type,file_size,thumbnail,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (kind) query = query.eq("file_type", kind);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as MediaAsset[];
    },
  });
}

export function MediaThumb({ asset, className = "" }: { asset: MediaAsset; className?: string }) {
  const fetchThumb = useServerFn(getMediaThumbnail);
  const Icon = icons[asset.file_type];
  const { data } = useQuery({
    queryKey: ["media-thumb", asset.id],
    queryFn: () => fetchThumb({ data: { assetId: asset.id } }),
    enabled: asset.file_type === "image" || Boolean(asset.thumbnail),
    staleTime: 30 * 60 * 1000,
  });

  if (data?.dataUrl) {
    return <img src={data.dataUrl} alt={asset.file_name} className={`size-full object-cover ${className}`} loading="lazy" />;
  }
  return (
    <div className={`flex size-full items-center justify-center bg-muted/40 ${className}`}>
      <Icon className="size-6 text-muted-foreground" />
    </div>
  );
}

export function MediaUploadButton({
  kind,
  onUploaded,
  label = "Enviar arquivo",
  variant = "default",
}: {
  kind?: MediaKind;
  onUploaded?: (asset: MediaAsset) => void;
  label?: string;
  variant?: "default" | "secondary" | "outline";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  async function handle(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const asset = await uploadMedia(file, kind);
      toast.success("Arquivo enviado para o cache do Telegram");
      qc.invalidateQueries({ queryKey: ["media-assets"] });
      onUploaded?.(asset);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={kind ? mediaAccept[kind] : undefined}
        onChange={(e) => handle(e.target.files?.[0])}
      />
      <Button type="button" variant={variant} disabled={busy} onClick={() => inputRef.current?.click()}>
        <Upload /> {busy ? "Enviando…" : label}
      </Button>
    </>
  );
}

export function MediaPicker({
  kind,
  value,
  onSelect,
}: {
  kind: MediaKind;
  value?: string;
  onSelect: (asset: MediaAsset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const { data: assets = [] } = useMediaAssets(kind);
  const filtered = assets.filter((a) => a.file_name.toLowerCase().includes(term.toLowerCase()));
  const selected = assets.find((a) => a.telegram_file_id === value);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="secondary" size="sm">
              Selecionar da Biblioteca
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Biblioteca de {mediaKindLabels[kind]}</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Pesquisar" className="pl-8" />
              </div>
              <MediaUploadButton kind={kind} label="Upload rápido" variant="outline" onUploaded={(a) => { onSelect(a); setOpen(false); }} />
            </div>
            <div className="grid max-h-[50vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
              {filtered.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => { onSelect(asset); setOpen(false); }}
                  className={`overflow-hidden rounded-lg border text-left transition-colors hover:border-primary ${
                    asset.telegram_file_id === value ? "border-primary" : "border-border"
                  }`}
                >
                  <div className="aspect-square">
                    <MediaThumb asset={asset} />
                  </div>
                  <p className="truncate px-2 py-1 text-xs">{asset.file_name}</p>
                </button>
              ))}
              {filtered.length === 0 ? (
                <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                  Nenhum arquivo. Faça um upload rápido.
                </p>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
        <MediaUploadButton kind={kind} variant="outline" onUploaded={onSelect} label="Enviar arquivo" />
      </div>
      <p className="text-xs text-muted-foreground">
        {selected ? `${selected.file_name} · ${formatBytes(selected.file_size)}` : value ? "Mídia selecionada" : "Nenhuma mídia selecionada"}
      </p>
    </div>
  );
}
