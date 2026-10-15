"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Item = { id: string; url: string; caption?: string };

/** Galerie de miniatures en lecture seule avec agrandissement. */
export function PhotoGallery({ photos }: { photos: Item[] }) {
  const [idx, setIdx] = useState<number | null>(null);
  if (photos.length === 0) return <p className="text-sm text-muted-foreground">Aucune photo sur la période.</p>;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {photos.map((p, i) => (
          <button key={p.id} type="button" className="group relative aspect-square overflow-hidden rounded-lg border bg-muted" onClick={() => setIdx(i)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption ?? ""} className="size-full object-cover" />
            {p.caption && <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-[10px] text-white">{p.caption}</span>}
          </button>
        ))}
      </div>
      {idx != null && photos[idx] && (
        <Dialog open onOpenChange={(o) => !o && setIdx(null)}>
          <DialogContent className="max-h-[95vh] p-2 sm:max-w-4xl">
            <DialogTitle className="sr-only">Photo</DialogTitle>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[idx].url} alt="" className="max-h-[85vh] w-full rounded object-contain" />
            <div className="flex justify-between px-2 pb-1 text-xs text-muted-foreground">
              <button type="button" disabled={idx === 0} onClick={() => setIdx(idx - 1)} className="disabled:opacity-30">← Précédente</button>
              <span>{photos[idx].caption}</span>
              <button type="button" disabled={idx >= photos.length - 1} onClick={() => setIdx(idx + 1)} className="disabled:opacity-30">Suivante →</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
