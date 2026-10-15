import "server-only";
import { createClient } from "@/lib/supabase/server";
import { employeeName, getEmployees } from "@/lib/data/employees";
import { getPhotosFor } from "@/lib/data/photos";
import type { PhotoItem } from "@/lib/photo-types";
import type { WarningStatus } from "@/lib/module-types";
export { WARNING_STATUS_LABELS, type WarningStatus } from "@/lib/module-types";

export type Warning = {
  id: string;
  employee_id: string;
  incident_date: string;
  description: string;
  observations: string;
  status: WarningStatus;
  created_at: string;
  updated_at: string;
  name: string;
  order_number: number;
  photos: PhotoItem[];
};

export type WarningFilters = { employee?: string; from?: string; to?: string; status?: string };

export async function getWarnings(f: WarningFilters = {}, limit = 500): Promise<Warning[]> {
  const supabase = await createClient();
  let q = supabase.from("warnings").select("*").order("incident_date", { ascending: false }).limit(limit);
  if (f.employee) q = q.eq("employee_id", f.employee);
  if (f.from) q = q.gte("incident_date", f.from);
  if (f.to) q = q.lte("incident_date", f.to);
  if (f.status) q = q.eq("status", f.status);
  const [{ data }, employees] = await Promise.all([q, getEmployees()]);
  const rows = data ?? [];
  const [photos] = await Promise.all([getPhotosFor("warning", rows.map((r) => r.id))]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  return rows.map((r) => {
    const e = byId.get(r.employee_id);
    return { ...r, name: e ? employeeName(e) : "?", order_number: e?.order_number ?? 0, photos: photos.get(r.id) ?? [] } as Warning;
  });
}

export async function getWarning(id: string): Promise<Warning | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("warnings").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const [employees, photos] = await Promise.all([getEmployees(), getPhotosFor("warning", [id])]);
  const e = employees.find((x) => x.id === data.employee_id);
  return { ...data, name: e ? employeeName(e) : "?", order_number: e?.order_number ?? 0, photos: photos.get(id) ?? [] } as Warning;
}
