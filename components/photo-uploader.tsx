"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { deletePhoto, registerPhoto } from "@/lib/actions/photos";
import { useT } from "@/lib/i18n/client";
import { PHOTO_BUCKET, PHOTO_PHASE_LABELS, type PhotoEntityType, type PhotoItem, type PhotoPhase } from "@/lib/photo-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Item = PhotoItem & { status: "done" | "uploading" | "error"; file?: File; error?: string };

/**
 * Téléversement de plusieurs photos (prise de photo sur téléphone ou import),
 * compression côté navigateur, nouvelle tentative en cas d'échec, miniatures et agrandissement.
 * `title` est une clé de traduction (texte français).
 */
export function PhotoUploader({
  entityType,
  entityId,
  phase,
  activityDate,
  employeeId,
  location,
  photos,
  canEdit,
  title,
}: {
  entityType: PhotoEntityType;
  entityId: string;
  phase: PhotoPhase;
  activityDate: string | null;
  employeeId?: string | null;
  location?: string;
  photos: PhotoItem[];
  canEdit: boolean;
  title?: string;
}) {
  const { t } = useT();
  const [items, setItems] = useState<Item[]>(photos.map((p) => ({ ...p, status: "done" })));
  const [viewer, setViewer] = useState<number | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const phaseLabel = t(PHOTO_PHASE_LABELS[phase]);

  const upload = async (tempId: string, file: File) => {
    setItems((prev) => prev.map((i) => (i.id === tempId ? { ...i, status: "uploading", error: undefined } : i)));
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 0.4, maxWidthOrHeight: 1600, useWebWorker: true, fileType: "image/jpeg" });
      const path = `${entityType}/${entityId}/${crypto.randomUUID()}.jpg`;
      const supabase = createClient();
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, compressed, { contentType: "image/jpeg", upsert: false });
      if (error) throw new Error(error.message);
      const r = await registerPhoto({
        storage_path: path,
        entity_type: entityType,
        entity_id: entityId,
        phase,
        activity_date: activityDate,
        employee_id: employeeId ?? null,
        location: location ?? "",
        mime_type: "image/jpeg",
        size_bytes: compressed.size,
      });
      if (!r.ok || !r.data) throw new Error(r.ok ? t("Réponse invalide") : r.error);
      const saved = r.data;
      setItems((prev) => prev.map((i) => (i.id === tempId ? { ...saved, status: "done" } : i)));
    } catch (e) {
      const message = (e as Error).message || t("Échec de l'envoi");
      setItems((prev) => prev.map((i) => (i.id === tempId ? { ...i, status: "error", error: message } : i)));
      toast.error(t("Photo non envoyée : {message}", { message }));
    }
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const tempId = `tmp-${crypto.randomUUID()}`;
      const item: Item = { id: tempId, storage_path: "", phase, caption: "", created_at: new Date().toISOString(), url: URL.createObjectURL(file), status: "uploading", file };
      setItems((prev) => [...prev, item]);
      void upload(tempId, file);
    }
  };

  const remove = async (item: Item) => {
    if (item.status !== "done") {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      return;
    }
    if (!window.confirm(t("Supprimer cette photo ?"))) return;
    const r = await deletePhoto(item.id);
    if (r.ok) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success(r.message);
    } else toast.error(r.error);
  };

  const doneItems = items.filter((i) => i.status === "done");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{title ? t(title) : t("Photos {phase}", { phase: phaseLabel })}</span>
        <span className="text-xs text-muted-foreground">({doneItems.length})</span>
        {canEdit && (
          <div className="ms-auto flex gap-1">
            <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()}>
              <Camera /> {t("Prendre une photo")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus /> {t("Importer")}
            </Button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">{t("Aucune photo")}</div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <div key={item.id} className={cn("group relative aspect-square overflow-hidden rounded-lg border bg-muted", item.status === "error" && "border-destructive")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.caption || phaseLabel}
                className={cn("size-full cursor-zoom-in object-cover", item.status !== "done" && "opacity-50")}
                onClick={() => item.status === "done" && setViewer(doneItems.findIndex((d) => d.id === item.id))}
              />
              {item.status === "uploading" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-white drop-shadow" />
                </div>
              )}
              {item.status === "error" && item.file && (
                <button type="button" className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/70 text-xs text-destructive" onClick={() => upload(item.id, item.file!)}>
                  <RefreshCw className="size-5" /> {t("Réessayer")}
                </button>
              )}
              {canEdit && (
                <button type="button" aria-label={t("Supprimer")} className="absolute end-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100" onClick={() => remove(item)}>
                  {item.status === "done" ? <Trash2 className="size-3.5" /> : <X className="size-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {viewer != null && doneItems[viewer] && (
        <Dialog open onOpenChange={(o) => !o && setViewer(null)}>
          <DialogContent className="max-h-[95vh] p-2 sm:max-w-4xl">
            <DialogTitle className="sr-only">{t("Photo")}</DialogTitle>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={doneItems[viewer].url} alt="" className="max-h-[85vh] w-full rounded object-contain" />
            <div className="flex justify-between px-2 pb-1 text-xs text-muted-foreground">
              <button type="button" disabled={viewer === 0} onClick={() => setViewer(viewer - 1)} className="disabled:opacity-30">{t("Précédente")}</button>
              <span>{viewer + 1} / {doneItems.length}</span>
              <button type="button" disabled={viewer >= doneItems.length - 1} onClick={() => setViewer(viewer + 1)} className="disabled:opacity-30">{t("Suivante")}</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
