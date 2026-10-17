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

/**
 * Compresse une image dans le navigateur, l'envoie dans le bucket privé puis l'enregistre en base.
 * Lève une erreur (message lisible) en cas d'échec.
 */
export async function uploadPhotoFile(file: File, target: UploadTarget): Promise<PhotoItem> {
  const compressed = await imageCompression(file, { maxSizeMB: 0.4, maxWidthOrHeight: 1600, useWebWorker: true, fileType: "image/jpeg" });
  const path = `${target.entityType}/${target.entityId}/${crypto.randomUUID()}.jpg`;
  const supabase = createClient();
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, compressed, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  const r = await registerPhoto({
    storage_path: path,
    entity_type: target.entityType,
    entity_id: target.entityId,
    phase: target.phase,
    activity_date: target.activityDate,
    employee_id: target.employeeId ?? null,
    location: target.location ?? "",
    mime_type: "image/jpeg",
    size_bytes: compressed.size,
  });
  if (!r.ok) throw new Error(r.error);
  if (!r.data) throw new Error("Réponse invalide");
  return r.data;
}
