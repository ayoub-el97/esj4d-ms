"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { deletePhoto } from "@/lib/actions/photos";
import { useT } from "@/lib/i18n/client";
import { PhotoUploadError, uploadPhotoFile } from "@/lib/photo-upload";
import { PHOTO_PHASE_LABELS, type PhotoEntityType, type PhotoItem, type PhotoPhase } from "@/lib/photo-types";
import { Button } from "@/components/ui/button";
import { CameraCaptureButton } from "@/components/camera-capture";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SafePhoto } from "@/components/safe-photo";
import { cn } from "@/lib/utils";

type Item = PhotoItem & { status: "done" | "queued" | "uploading" | "error"; file?: File; error?: string };

/**
 * Photos d'un enregistrement : prise de plusieurs photos (caméra du téléphone) ou import,
 * compression dans le navigateur, envoi une par une (fiable sur réseau mobile), nouvelle
 * tentative en cas d'échec, miniatures avec l'heure de prise, agrandissement, suppression.
 * Les photos déjà enregistrées ne sont jamais touchées quand on en ajoute d'autres.
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
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(photos.map((p) => ({ ...p, status: "done" })));
  const [viewer, setViewer] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queue = useRef<{ id: string; file: File }[]>([]);
  const running = useRef(false);
  const phaseLabel = t(PHOTO_PHASE_LABELS[phase]);

  const messageOf = (e: unknown) => (e instanceof PhotoUploadError ? t(e.key, e.vars) : (e as Error)?.message || t("Échec de l'envoi"));

  // Envoi séquentiel : une photo à la fois, puis une seule actualisation de la page
  const pump = async () => {
    if (running.current) return;
    running.current = true;
    let sent = 0;
    while (queue.current.length) {
      const job = queue.current.shift()!;
      setItems((prev) => prev.map((i) => (i.id === job.id ? { ...i, status: "uploading", error: undefined } : i)));
      try {
        const saved = await uploadPhotoFile(job.file, { entityType, entityId, phase, activityDate, employeeId, location });
        setItems((prev) => prev.map((i) => (i.id === job.id ? { ...saved, status: "done" } : i)));
        sent++;
      } catch (e) {
        const message = messageOf(e);
        setItems((prev) => prev.map((i) => (i.id === job.id ? { ...i, status: "error", error: message } : i)));
        toast.error(t("Photo non envoyée : {message}", { message }), { duration: 8000 });
      }
    }
    running.current = false;
    if (sent) {
      toast.success(t("{count} photo(s) enregistrée(s).", { count: sent }));
      router.refresh(); // compteurs avant / après, statut du rapport
    }
  };

  const enqueue = (id: string, file: File) => {
    queue.current.push({ id, file });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "queued", error: undefined } : i)));
    void pump();
  };

  const onFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files);
    const added: Item[] = list.map((file) => ({ id: `tmp-${crypto.randomUUID()}`, storage_path: "", phase, caption: "", created_at: new Date().toISOString(), url: URL.createObjectURL(file), status: "queued", file }));
    setItems((prev) => [...prev, ...added]);
    added.forEach((it) => queue.current.push({ id: it.id, file: it.file! }));
    void pump();
  };

  const remove = async (item: Item) => {
    if (item.status !== "done") {
      queue.current = queue.current.filter((j) => j.id !== item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      return;
    }
    if (!window.confirm(t("Supprimer cette photo ?"))) return;
    const r = await deletePhoto(item.id);
    if (r.ok) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success(r.message);
      router.refresh();
    } else toast.error(r.error);
  };

  const doneItems = items.filter((i) => i.status === "done");
  const busy = items.some((i) => i.status === "queued" || i.status === "uploading");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{title ? t(title) : t("Photos {phase}", { phase: phaseLabel })}</span>
        <span className="text-xs text-muted-foreground">({doneItems.length})</span>
        {busy && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> {t("Envoi en cours…")}
          </span>
        )}
        {canEdit && (
          <div className="ms-auto flex gap-1">
            <CameraCaptureButton onCapture={onFiles} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus /> {t("Importer")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">{t("Aucune photo")}</div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <div key={item.id} className={cn("group relative aspect-square overflow-hidden rounded-lg border bg-muted", item.status === "error" && "border-destructive")}>
              <SafePhoto
                id={item.id}
                url={item.url}
                alt={item.caption || phaseLabel}
                className={cn("size-full cursor-zoom-in object-cover", item.status !== "done" && "opacity-50")}
                onClick={() => item.status === "done" && setViewer(doneItems.findIndex((d) => d.id === item.id))}
              />
              {item.status === "done" && item.created_at && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-1 text-center text-[10px] leading-4 text-white tabular-nums">
                  {new Date(item.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Casablanca" })}
                </span>
              )}
              {(item.status === "uploading" || item.status === "queued") && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-white drop-shadow">
                  <Loader2 className={cn("size-6", item.status === "uploading" && "animate-spin")} />
                  {item.status === "queued" ? t("En attente") : t("Envoi…")}
                </div>
              )}
              {item.status === "error" && item.file && (
                <button
                  type="button"
                  title={item.error}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/80 p-1 text-center text-[10px] leading-tight text-destructive"
                  onClick={() => enqueue(item.id, item.file!)}
                >
                  <RefreshCw className="size-5" /> {t("Réessayer")}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  aria-label={t("Supprimer")}
                  className="absolute end-1 top-1 rounded-full bg-black/60 p-1.5 text-white transition sm:p-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                  onClick={() => remove(item)}
                >
                  {item.status === "done" ? <Trash2 className="size-3.5" /> : <X className="size-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {items.some((i) => i.status === "error") && <p className="text-xs text-destructive">{items.find((i) => i.status === "error")?.error}</p>}

      {viewer != null && doneItems[viewer] && (
        <Dialog open onOpenChange={(o) => !o && setViewer(null)}>
          <DialogContent className="max-h-[95vh] p-2 sm:max-w-4xl">
            <DialogTitle className="sr-only">{t("Photo")}</DialogTitle>
            <SafePhoto id={doneItems[viewer].id} url={doneItems[viewer].url} className="max-h-[85vh] w-full rounded object-contain" />
            <div className="flex justify-between px-2 pb-1 text-xs text-muted-foreground">
              <button type="button" disabled={viewer === 0} onClick={() => setViewer(viewer - 1)} className="px-2 py-1 disabled:opacity-30">
                {t("Précédente")}
              </button>
              <span>
                {viewer + 1} / {doneItems.length}
              </span>
              <button type="button" disabled={viewer >= doneItems.length - 1} onClick={() => setViewer(viewer + 1)} className="px-2 py-1 disabled:opacity-30">
                {t("Suivante")}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
