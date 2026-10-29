import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET, PHOTO_URL_TTL, type PhotoEntityType, type PhotoItem, type PhotoPhase } from "@/lib/photo-types";

type PhotoRow = { id: string; storage_path: string; entity_id: string; phase: PhotoPhase; caption: string; created_at: string; mime_type: string | null };

/** Photos d'un ensemble d'entités, avec URL signées (accès privé contrôlé). */
export async function getPhotosFor(entityType: PhotoEntityType, entityIds: string[]): Promise<Map<string, PhotoItem[]>> {
  const result = new Map<string, PhotoItem[]>();
  if (entityIds.length === 0) return result;

  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("id, storage_path, entity_id, phase, caption, created_at, mime_type")
    .eq("entity_type", entityType)
    .in("entity_id", entityIds)
    .order("created_at")
    .returns<PhotoRow[]>();
  const rows = data ?? [];
  if (rows.length === 0) return result;

  const urls = await signPaths(rows.map((r) => r.storage_path));
  for (const r of rows) {
    const list = result.get(r.entity_id) ?? [];
    list.push({ id: r.id, storage_path: r.storage_path, phase: r.phase, caption: r.caption, created_at: r.created_at, url: urls.get(r.storage_path) ?? "", mime_type: r.mime_type ?? undefined });
    result.set(r.entity_id, list);
  }
  return result;
}

export async function signPaths(paths: string[], expiresIn = PHOTO_URL_TTL): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, expiresIn);
  for (const d of data ?? []) if (d.path && d.signedUrl) map.set(d.path, d.signedUrl);
  return map;
}

/** Photos liées à un employé sur une période (rapports travailleurs). */
export async function getEmployeePhotos(employeeId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("id, storage_path, entity_type, entity_id, phase, caption, activity_date, location, created_at")
    .eq("employee_id", employeeId)
    .gte("activity_date", from)
    .lte("activity_date", to)
    .order("activity_date", { ascending: false });
  const rows = data ?? [];
  const urls = await signPaths(rows.map((r) => r.storage_path));
  return rows.map((r) => ({ ...r, url: urls.get(r.storage_path) ?? "" }));
}
