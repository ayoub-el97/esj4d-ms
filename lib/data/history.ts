import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TeamType } from "@/lib/types";

/** Tables dont le journal des modifications est consultable (migration 044). */
export type ChangeTable = "attendance" | "cleaning_reports" | "cleaning_report_agents" | "collection_reports" | "collection_report_rippers" | "cleaning_daily_summary" | "truck_daily_reports" | "truck_report_crew";

export type ChangeEntry = { record_id: string; at: string; action: "INSERT" | "UPDATE" | "DELETE"; user_email: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null };

export type ChangeSummary = { modified: boolean; last_at: string | null; last_user: string | null };

export type SheetSummary = { activity_date: string; team_type: TeamType; rows_count: number; worked_count: number; last_at: string | null; last_user: string | null; modified: boolean; closed: boolean };

export type DailyReportsSummary = {
  activity_date: string;
  cleaning_agents: number;
  collection_count: number;
  truck_lines: number;
  tonnage: number;
  summary_rows: number;
  last_at: string | null;
  last_user: string | null;
  modified: boolean;
  closed: boolean;
};

/** Feuilles de présence enregistrées par date et par équipe, de la plus récente à la plus ancienne. */
export async function getAttendanceSheetsSummary(from: string, to: string): Promise<SheetSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attendance_sheets_summary", { p_from: from, p_to: to });
  if (error) return [];
  return (data ?? []) as SheetSummary[];
}

/** Rapports journaliers (nettoiement, collecte, camions, global) par date, du plus récent au plus ancien. */
export async function getDailyReportsSummary(from: string, to: string): Promise<DailyReportsSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("daily_reports_summary", { p_from: from, p_to: to });
  if (error) return [];
  return ((data ?? []) as DailyReportsSummary[]).map((r) => ({ ...r, tonnage: Number(r.tonnage ?? 0) }));
}

/** Journal détaillé (champ, avant, après, qui, quand) par identifiants et / ou par date d'activité. */
export async function getRecordChanges(table: ChangeTable, opts: { ids?: string[]; date?: string }): Promise<ChangeEntry[]> {
  if (!opts.ids?.length && !opts.date) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_changes", { p_table: table, p_ids: opts.ids?.length ? opts.ids : null, p_date: opts.date ?? null });
  if (error) return [];
  return (data ?? []) as ChangeEntry[];
}

/** Indicateur « modifié » et dernière modification réelle, par enregistrement. */
export async function getChangeSummary(table: ChangeTable, ids: string[]): Promise<Map<string, ChangeSummary>> {
  const result = new Map<string, ChangeSummary>();
  if (!ids.length) return result;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_change_summary", { p_table: table, p_ids: ids });
  if (error) return result;
  for (const r of (data ?? []) as (ChangeSummary & { record_id: string })[]) result.set(r.record_id, r);
  return result;
}
