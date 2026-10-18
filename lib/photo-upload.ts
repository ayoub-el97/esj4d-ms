import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { registerPhoto } from "@/lib/actions/photos";
import { PHOTO_BUCKET, type PhotoEntityType, type PhotoItem, type PhotoPhase } from "@/lib/photo-types";

export type UploadTarget = {
  entityType: PhotoEntityType;
  entityId: string;
  phase: PhotoPhase;
  activityDate: string | null;
  employeeId?: string | null;
  location?: string;
};

/** Limite du stockage (bucket « photos ») et formats acceptés. */
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/** Erreur lisible (clé de traduction + variables) pour l'utilisateur. */
export class PhotoUploadError extends Error {
  constructor(
    public key: string,
    public vars?: Record<string, string | number>,
  ) {
    super(key);
  }
}

const isHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

/**
 * Prépare l'image : compression en JPEG (≈ 400 Ko, 1600 px). Si la compression échoue
 * (navigateur ancien, image inhabituelle), l'original est envoyé s'il est accepté par le stockage.
 */
async function prepare(file: File): Promise<{ blob: Blob; type: string }> {
  try {
    const compressed = await imageCompression(file, { maxSizeMB: 0.4, maxWidthOrHeight: 1600, useWebWorker: true, fileType: "image/jpeg", initialQuality: 0.8 });
    if (compressed.size > 0) return { blob: compressed, type: "image/jpeg" };
  } catch {
    // on tente l'original ci-dessous
  }
  if (isHeic(file)) throw new PhotoUploadError("Format HEIC non lu par ce navigateur : sur iPhone, réglez Réglages › Appareil photo › Formats › « Le plus compatible », ou prenez la photo avec le bouton « Prendre des photos ».");
  if (!ACCEPTED.includes(file.type)) throw new PhotoUploadError("Format d'image non pris en charge ({type}) : utilisez une photo JPEG ou PNG.", { type: file.type || "?" });
  if (file.size > MAX_BYTES) throw new PhotoUploadError("Photo trop lourde ({size} Mo, maximum 5 Mo).", { size: (file.size / 1024 / 1024).toFixed(1) });
  return { blob: file, type: file.type };
}

/**
 * Compresse une image dans le navigateur, l'envoie dans le bucket privé puis l'enregistre en base.
 * Lève une PhotoUploadError (message lisible) en cas d'échec ; le fichier stocké est retiré si
 * l'enregistrement en base échoue (pas de fichier orphelin).
 */
export async function uploadPhotoFile(file: File, target: UploadTarget): Promise<PhotoItem> {
  if (!file.type.startsWith("image/") && !isHeic(file)) throw new PhotoUploadError("Ce fichier n'est pas une image.");
  const { blob, type } = await prepare(file);
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${target.entityType}/${target.entityId}/${crypto.randomUUID()}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: type, upsert: false, cacheControl: "3600" });
  if (error) {
    if (/row-level security|unauthorized|403/i.test(error.message)) throw new PhotoUploadError("Envoi refusé : droits insuffisants ou journée clôturée.");
    if (/fetch|network|Failed/i.test(error.message)) throw new PhotoUploadError("Connexion interrompue : vérifiez le réseau puis appuyez sur « Réessayer ».");
    throw new PhotoUploadError("Envoi impossible : {message}", { message: error.message });
  }
  const r = await registerPhoto({
    storage_path: path,
    entity_type: target.entityType,
    entity_id: target.entityId,
    phase: target.phase,
    activity_date: target.activityDate,
    employee_id: target.employeeId ?? null,
    location: target.location ?? "",
    mime_type: type,
    size_bytes: blob.size,
  });
  if (!r.ok) throw new PhotoUploadError(r.error);
  if (!r.data) throw new PhotoUploadError("Réponse invalide");
  return r.data;
}
