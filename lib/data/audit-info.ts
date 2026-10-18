import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AuditTable = "collection_reports" | "cleaning_report_agents" | "green_waste_entries" | "work_tasks" | "warnings" | "truck_daily_reports" | "truck_repairs" | "fuel_entries";

export type RecordAuditInfo = {
  created_at: string | null;
  created_by_email: string | null;
  updated_at: string | null;
  updated_by_email: string | null;
  photos_added: number;
  photos_removed: number;
};

/** Création / dernière modification et photos ajoutées / retirées (journal d'audit, droits du module). */
export async function getRecordAuditInfo(table: AuditTable, ids: string[]): Promise<Map<string, RecordAuditInfo>> {
  const result = new Map<string, RecordAuditInfo>();
  if (!ids.length) return result;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_audit_info", { p_table: table, p_ids: ids });
  if (error) return result;
  for (const r of (data ?? []) as (RecordAuditInfo & { record_id: string })[]) result.set(r.record_id, r);
  return result;
}
