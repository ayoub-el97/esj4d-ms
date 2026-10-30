"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Eye, FileText, FileUp, Loader2, Replace, Trash2 } from "lucide-react";
import { deletePhoto, refreshPhotoUrls } from "@/lib/actions/photos";
import { useT } from "@/lib/i18n/client";
import { PhotoUploadError, uploadPhotoFile } from "@/lib/photo-upload";
import type { PhotoItem } from "@/lib/photo-types";
import { formatDateTimeFr } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { CameraCaptureButton } from "@/components/camera-capture";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SafePhoto } from "@/components/safe-photo";

const ACCEPT = "image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf";
const isPdf = (p: PhotoItem) => p.mime_type === "application/pdf" || /\.pdf$/i.test(p.storage_path);

/**
 * Documents d'un certificat médical (une ou plusieurs pages / fichiers) : photo prise avec la
 * caméra ou document importé (JPG, PNG, PDF). Stockage privé ; liens signés temporaires demandés
 * au moment de voir ou télécharger (jamais d'URL publique). Tous les fichiers restent rattachés
 * au même certificat, donc à la même absence. Le document n'a pas de date d'activité : il peut être
 * remis après la clôture de la journée d'absence (la journée elle-même n'est pas modifiée).
 */
export function CertificateDocuments({ certificateId, employeeId, files, canEdit, fileLabel }: { certificateId: string; employeeId: string; files: PhotoItem[]; canEdit: boolean; fileLabel: string }) {
  const { t } = useT();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<PhotoItem | null>(null);
  const [busy, setBusy] = useState(0);
  const [viewer, setViewer] = useState<{ id: string; url: string; pdf: boolean } | null>(null);

  const message = (e: unknown) => (e instanceof PhotoUploadError ? t(e.key, e.vars) : (e as Error)?.message || t("Échec de l'envoi"));
  const target = { entityType: "medical_certificate" as const, entityId: certificateId, phase: "justificatif" as const, activityDate: null, employeeId, allowPdf: true };

  /** Envoi un par un (fiable sur réseau mobile), puis actualisation. */
  const upload = async (list: File[]): Promise<number> => {
    let sent = 0;
    setBusy((n) => n + list.length);
    for (const f of list) {
      try {
        await uploadPhotoFile(f, target);
        sent++;
      } catch (e) {
        toast.error(t("{name} non envoyé : {message}", { name: f.name || t("Fichier"), message: message(e) }), { duration: 9000 });
      }
      setBusy((n) => n - 1);
    }
    return sent;
  };

  const add = async (list: File[]) => {
    if (!list.length) return;
    const sent = await upload(list);
    if (sent) {
      toast.success(t("{count} fichier(s) ajouté(s) au certificat.", { count: sent }));
      router.refresh();
    }
  };

  /** Remplacer : le nouveau fichier est enregistré d'abord, l'ancien n'est retiré qu'ensuite. */
  const replace = async (old: PhotoItem, file: File) => {
    const sent = await upload([file]);
    if (!sent) return;
    const r = await deletePhoto(old.id);
    if (r.ok) toast.success(t("Document remplacé."));
    else toast.warning(t("Nouveau document ajouté, mais l'ancien n'a pas pu être retiré : {message}", { message: r.error }));
    router.refresh();
  };

  const freshUrl = async (p: PhotoItem) => (await refreshPhotoUrls([p.id]))[p.id] ?? p.url;

  const view = async (p: PhotoItem) => {
    // PDF sur téléphone : onglet ouvert immédiatement (bloqueur de fenêtres), lien signé récent chargé ensuite.
    // Sur ordinateur : aperçu dans la fenêtre.
    const small = window.matchMedia("(max-width: 767px)").matches;
    const tab = isPdf(p) && small ? window.open("", "_blank") : null;
    if (tab) tab.opener = null;
    const url = await freshUrl(p);
    if (!url) {
      tab?.close();
      return toast.error(t("Document introuvable."));
    }
    if (tab) tab.location.href = url;
    else if (isPdf(p) && small) window.location.assign(url);
    else setViewer({ id: p.id, url, pdf: isPdf(p) });
  };

  const download = async (p: PhotoItem, i: number) => {
    const url = await freshUrl(p);
    if (!url) return toast.error(t("Document introuvable."));
    const name = `${fileLabel}-${i + 1}.${isPdf(p) ? "pdf" : (p.storage_path.split(".").pop() ?? "jpg")}`;
    const a = document.createElement("a");
    a.href = `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(name)}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const remove = async (p: PhotoItem) => {
    if (!window.confirm(t("Supprimer ce document du certificat ? Cette action est définitive."))) return;
    const r = await deletePhoto(p.id);
    if (r.ok) {
      toast.success(t("Document supprimé."));
      router.refresh();
    } else toast.error(r.error);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{t("Certificat médical")}</span>
        <span className="text-xs text-muted-foreground">({t("{count} fichier(s)", { count: files.length })})</span>
        {busy > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> {t("Envoi en cours…")}
          </span>
        )}
        {canEdit && (
          <div className="ms-auto flex flex-wrap gap-1">
            <CameraCaptureButton onCapture={add} label="Prendre une photo" />
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <FileUp /> {t("Importer un document")}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                void add(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <input
              ref={replaceRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f && replacing) void replace(replacing, f);
                setReplacing(null);
              }}
            />
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("JPG, PNG ou PDF ; plusieurs pages ou fichiers possibles. Documents médicaux privés : visibles uniquement par les utilisateurs autorisés.")}</p>

      {files.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">{t("Aucun document : le certificat est en attente.")}</div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((p, i) => (
            <li key={p.id} className="overflow-hidden rounded-lg border bg-card">
              <button type="button" className="block aspect-[4/3] w-full bg-muted" onClick={() => view(p)} title={t("Voir le certificat")}>
                {isPdf(p) ? (
                  <span className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
                    <FileText className="size-8" />
                    <span className="text-xs font-semibold">PDF</span>
                  </span>
                ) : (
                  <SafePhoto id={p.id} url={p.url} alt={t("Certificat médical")} className="size-full object-cover" />
                )}
              </button>
              <div className="px-2 pt-1 text-[11px] text-muted-foreground">
                {t("Page {n}", { n: i + 1 })} · {formatDateTimeFr(p.created_at)}
              </div>
              <div className="grid gap-0.5 p-1 [&_button]:justify-start">
                <Button type="button" variant="ghost" size="xs" onClick={() => view(p)}>
                  <Eye /> {t("Voir le certificat")}
                </Button>
                <Button type="button" variant="ghost" size="xs" onClick={() => download(p, i)}>
                  <Download /> {t("Télécharger le certificat")}
                </Button>
                {canEdit && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={busy > 0}
                      onClick={() => {
                        setReplacing(p);
                        replaceRef.current?.click();
                      }}
                    >
                      <Replace /> {t("Remplacer le certificat")}
                    </Button>
                    <Button type="button" variant="ghost" size="xs" className="text-destructive" onClick={() => remove(p)}>
                      <Trash2 /> {t("Supprimer le certificat")}
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {viewer && (
        <Dialog open onOpenChange={(o) => !o && setViewer(null)}>
          <DialogContent className="max-h-[95vh] p-2 sm:max-w-4xl">
            <DialogTitle className="sr-only">{t("Certificat médical")}</DialogTitle>
            {viewer.pdf ? <iframe src={viewer.url} title={t("Certificat médical")} className="h-[85vh] w-full rounded border-0" /> : <SafePhoto id={viewer.id} url={viewer.url} className="max-h-[85vh] w-full rounded object-contain" />}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
