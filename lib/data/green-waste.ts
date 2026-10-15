import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPhotosFor } from "@/lib/data/photos";
import type { PhotoItem } from "@/lib/photo-types";

export type GreenWasteEntry = {
  id: string;
  activity_date: string;
  location: string;
  comment: string;
  created_at: string;
  photosAvant: PhotoItem[];
  photosApres: PhotoItem[];
};

export async function getGreenWasteEntries(f: { date?: string; from?: string; to?: string } = {}, limit = 300): Promise<GreenWasteEntry[]> {
  const supabase = await createClient();
  let q = supabase.from("green_waste_entries").select("*").order("activity_date", { ascending: false }).order("created_at").limit(limit);
  if (f.date) q = q.eq("activity_date", f.date);
  if (f.from) q = q.gte("activity_date", f.from);
  if (f.to) q = q.lte("activity_date", f.to);
  const { data } = await q;
  const rows = data ?? [];
  const photos = await getPhotosFor("green_waste", rows.map((r) => r.id));
  return rows.map((r) => {
    const ph = photos.get(r.id) ?? [];
    return { ...r, photosAvant: ph.filter((p) => p.phase === "avant"), photosApres: ph.filter((p) => p.phase === "apres") };
  });
}

export async function getGreenWasteEntry(id: string): Promise<GreenWasteEntry | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("green_waste_entries").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const photos = await getPhotosFor("green_waste", [id]);
  const ph = photos.get(id) ?? [];
  return { ...data, photosAvant: ph.filter((p) => p.phase === "avant"), photosApres: ph.filter((p) => p.phase === "apres") };
}
