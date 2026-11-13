import type { ReactNode } from "react";
import { MediaThumb } from "@/components/app/MediaPicker";
import { formatBytes, mediaKindLabels, type MediaAsset } from "@/lib/media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function MediaPickerlessGrid({
  assets,
  onDelete,
  deleteIcon,
}: {
  assets: MediaAsset[];
  onDelete: (id: string) => void;
  deleteIcon: ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((asset) => (
        <article key={asset.id} className="panel overflow-hidden p-0">
          <div className="aspect-video bg-muted/30">
            <MediaThumb asset={asset} />
          </div>
          <div className="space-y-2 p-3">
            <p className="truncate text-sm font-medium" title={asset.file_name}>{asset.file_name}</p>
            <div className="flex items-center justify-between gap-2">
              <Badge variant="secondary">{mediaKindLabels[asset.file_type]}</Badge>
              <span className="text-xs text-muted-foreground">{formatBytes(asset.file_size)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive"
              onClick={() => onDelete(asset.id)}
              aria-label={`Excluir ${asset.file_name}`}
            >
              {deleteIcon} Excluir
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
