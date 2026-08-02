import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { MediaPickerlessGrid } from "@/components/app/MediaLibraryGrid";
import { MediaUploadButton, useMediaAssets } from "@/components/app/MediaPicker";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MediaKind } from "@/lib/media";

export const Route = createFileRoute("/_authenticated/app/media")({
  head: () => ({
    meta: [
      { title: "Mídias | AURUMBOT" },
      { name: "description", content: "Biblioteca de mídias em cache no Telegram: imagens, vídeos, áudios e documentos." },
      { property: "og:title", content: "Mídias | AURUMBOT" },
      { property: "og:description", content: "Envie arquivos e use-os nos fluxos sem depender de URLs externas." },
    ],
  }),
  component: MediaPage,
});

const tabs = [
  { value: "all", label: "Todas" },
  { value: "image", label: "Imagens" },
  { value: "video", label: "Vídeos" },
  { value: "audio", label: "Áudios" },
  { value: "document", label: "Documentos" },
] as const;

function MediaPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]["value"]>("all");
  const [term, setTerm] = useState("");
  const qc = useQueryClient();
  const kind = tab === "all" ? undefined : (tab as MediaKind);
  const { data: assets = [], isLoading } = useMediaAssets(kind);

  const filtered = assets.filter((a) => a.file_name.toLowerCase().includes(term.toLowerCase()));

  async function remove(id: string) {
    const { error } = await supabase.from("media_assets").delete().eq("id", id);
    if (error) { toast.error("Não foi possível excluir"); return; }
    toast.success("Mídia removida da biblioteca");
    qc.invalidateQueries({ queryKey: ["media-assets"] });
  }

  return (
    <div>
      <PageHeader
        title="Mídias"
        description="Arquivos guardados no cache do Telegram e reutilizados nos fluxos pelo file_id."
        action={<MediaUploadButton label="Enviar arquivo" />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Pesquisar arquivos" className="pl-8" />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          Nenhuma mídia encontrada. Configure o canal de cache em Configurações e envie seu primeiro arquivo.
        </div>
      ) : (
        <MediaPickerlessGrid
          assets={filtered}
          onDelete={remove}
          deleteIcon={<Trash2 className="size-4" />}
        />
      )}
    </div>
  );
}
