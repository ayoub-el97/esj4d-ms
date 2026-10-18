"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SafePhoto } from "@/components/safe-photo";
import { cn } from "@/lib/utils";

type Item = { id: string; url: string; caption?: string };

/**
 * Galerie en lecture seule avec agrandissement plein écran et navigation (précédente / suivante).
 * `compact` : petite rangée de miniatures (tableaux d'historique), « +n » pour les suivantes.
 */
export function PhotoGallery({ photos, emptyText, compact = false, max = 4 }: { photos: Item[]; emptyText?: string; compact?: boolean; max?: number }) {
  const { t } = useT();
  const [idx, setIdx] = useState<number | null>(null);
  if (photos.length === 0) return compact ? <span className="text-xs text-muted-foreground">—</span> : <p className="text-sm text-muted-foreground">{emptyText ?? t("Aucune photo sur la période.")}</p>;
  const shown = compact ? photos.slice(0, max) : photos;
  return (
    <>
      <div className={compact ? "flex flex-wrap items-center gap-1" : "grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"}>
        {shown.map((p, i) => (
          <button
            key={p.id}
            type="button"
            aria-label={t("Agrandir la photo")}
            className={cn("group relative overflow-hidden rounded-lg border bg-muted", compact ? "size-10 shrink-0 rounded-md" : "aspect-square")}
            onClick={() => setIdx(i)}
          >
            <SafePhoto id={p.id} url={p.url} alt={p.caption ?? ""} className="size-full object-cover" />
            {!compact && p.caption && <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-[10px] text-white">{p.caption}</span>}
          </button>
        ))}
        {compact && photos.length > max && (
          <button type="button" className="flex size-10 items-center justify-center rounded-md border bg-muted text-xs font-semibold" onClick={() => setIdx(max)}>
            +{photos.length - max}
          </button>
        )}
      </div>
      {idx != null && photos[idx] && (
        <Dialog open onOpenChange={(o) => !o && setIdx(null)}>
          <DialogContent className="max-h-[95vh] p-2 sm:max-w-4xl">
            <DialogTitle className="sr-only">{t("Photo")}</DialogTitle>
            <SafePhoto id={photos[idx].id} url={photos[idx].url} className="max-h-[80vh] w-full rounded object-contain" />
            <div className="flex items-center justify-between px-2 pb-1 text-xs text-muted-foreground">
              <button type="button" disabled={idx === 0} onClick={() => setIdx(idx - 1)} className="rounded px-3 py-2 disabled:opacity-30">
                {t("Précédente")}
              </button>
              <span>
                {idx + 1} / {photos.length}
                {photos[idx].caption ? ` · ${photos[idx].caption}` : ""}
              </span>
              <button type="button" disabled={idx >= photos.length - 1} onClick={() => setIdx(idx + 1)} className="rounded px-3 py-2 disabled:opacity-30">
                {t("Suivante")}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
