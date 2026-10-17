"use client";

import { useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { uploadPhotoFile, type UploadTarget } from "@/lib/photo-upload";
import { Button } from "@/components/ui/button";
import { CameraCaptureButton } from "@/components/camera-capture";

export type PendingPhoto = { key: string; file: File; url: string };

/**
 * Photos choisies dans un formulaire de création, avant que l'enregistrement existe :
 * prise de plusieurs photos ou import, aperçu et retrait. L'envoi se fait après la création
 * avec uploadPendingPhotos (les fichiers ne partent pas avec le formulaire).
 * `title` est une clé de traduction.
 */
export function PendingPhotosPicker({ photos, onChange, title }: { photos: PendingPhoto[]; onChange: (photos: PendingPhoto[]) => void; title: string }) {
  const { t } = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const add = (files: FileList | File[] | null) => {
    if (!files) return;
    onChange([...photos, ...Array.from(files).map((file) => ({ key: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))]);
  };
  const remove = (key: string) => {
    const p = photos.find((x) => x.key === key);
    if (p) URL.revokeObjectURL(p.url);
    onChange(photos.filter((x) => x.key !== key));
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{t(title)}</span>
        <span className="text-xs text-muted-foreground">({photos.length})</span>
        <div className="ms-auto flex gap-1">
          <CameraCaptureButton onCapture={add} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <ImagePlus /> {t("Importer")}
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {photos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">{t("Aucune photo")}</div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((p) => (
            <div key={p.key} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="size-full object-cover" />
              <button type="button" aria-label={t("Supprimer")} className="absolute end-1 top-1 rounded-full bg-black/60 p-1 text-white" onClick={() => remove(p.key)}>
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("Les photos sont envoyées lors de l'enregistrement.")}</p>
    </div>
  );
}

/** Envoie les photos en attente vers l'enregistrement créé ; renvoie le nombre d'échecs. */
export async function uploadPendingPhotos(photos: PendingPhoto[], target: UploadTarget): Promise<number> {
  let failed = 0;
  for (const p of photos) {
    try {
      await uploadPhotoFile(p.file, target);
      URL.revokeObjectURL(p.url);
    } catch {
      failed++;
    }
  }
  return failed;
}
