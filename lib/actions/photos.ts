"use server";

import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET, type PhotoEntityType, type PhotoItem } from "@/lib/photo-types";
import type { ActionResult, AppModule } from "@/lib/types";

const ENTITY_MODULE: Record<PhotoEntityType, AppModule> = {
  cleaning_report_agent: "rapport_journalier",
  collection_report: "rapport_journalier",
  warning: "avertissements",
  green_waste: "dechet_vert",
  work_task: "programme",
  fuel_entry: "rapport_camions",
};

const registerSchema = z.object({
  storage_path: z.string().min(1),
  entity_type: z.enum(["cleaning_report_agent", "collection_report", "warning", "green_waste", "work_task", "fuel_entry"]),
  entity_id: z.string().uuid(),
  phase: z.enum(["avant", "apres", "justificatif"]),
  activity_date: z.string().date().nullable(),
  employee_id: z.string().uuid().nullable(),
  location: z.string().max(200).default(""),
  mime_type: z.string().default("image/jpeg"),
  size_bytes: z.number().int().nonnegative().default(0),
});

export type RegisterPhotoInput = z.input<typeof registerSchema>;

/** Enregistre en base une photo déjà téléversée dans le bucket privé. */
export async function registerPhoto(input: RegisterPhotoInput): Promise<ActionResult<PhotoItem>> {
  const t = await getT();
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("Données de photo invalides.") };
  const d = parsed.data;

  const auth = await assertModule(ENTITY_MODULE[d.entity_type], "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!d.storage_path.startsWith(`${d.entity_type}/${d.entity_id}/`)) return { ok: false, error: t("Chemin de stockage incohérent.") };

  const supabase = await createClient();
  const { data, error } = await supabase.from("photos").insert({ ...d, uploaded_by: auth.user.id }).select("id, storage_path, phase, caption, created_at").single();
  if (error) {
    // Nettoyage du fichier orphelin
    await supabase.storage.from(PHOTO_BUCKET).remove([d.storage_path]);
    return { ok: false, error: t(friendlyError(error.message)) };
  }
  const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(d.storage_path, 3600);
  return { ok: true, data: { ...data, url: signed?.signedUrl ?? "" } };
}

export async function deletePhoto(id: string): Promise<ActionResult> {
  const t = await getT();
  const supabase = await createClient();
  const { data: photo } = await supabase.from("photos").select("id, storage_path, entity_type").eq("id", id).maybeSingle();
  if (!photo) return { ok: false, error: t("Photo introuvable.") };

  const auth = await assertModule(ENTITY_MODULE[photo.entity_type as PhotoEntityType] ?? "rapport_journalier", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };

  const { error } = await supabase.from("photos").delete().eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
  return { ok: true, message: t("Photo supprimée.") };
}

/** Supprime toutes les photos d'une entité (appelé lors de la suppression d'un rapport). */
export async function deletePhotosOfEntity(entityType: PhotoEntityType, entityId: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("photos").select("id, storage_path").eq("entity_type", entityType).eq("entity_id", entityId);
  if (!data?.length) return;
  await supabase.storage.from(PHOTO_BUCKET).remove(data.map((p) => p.storage_path));
  await supabase.from("photos").delete().in("id", data.map((p) => p.id));
}
