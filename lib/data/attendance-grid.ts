import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getEmployees } from "@/lib/data/employees";
import { getSettings } from "@/lib/data/settings";
import { attendancePeriod, buildGrid, normalizeStartDay, type GridData, type GridEmployee, type GridRecord } from "@/lib/attendance-grid";
import type { Position, TeamType } from "@/lib/types";

export async function getPeriodStartDay(): Promise<number> {
  return normalizeStartDay((await getSettings()).pointage_period_start_day);
}

/** Toutes les lignes de pointage de la période (lecture par pages de 1000). */
async function fetchRecords(from: string, to: string) {
  const supabase = await createClient();
  const out: (GridRecord & { position: Position; team_type: TeamType })[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("attendance")
      .select("employee_id, activity_date, status, position, team_type, shift")
      .gte("activity_date", from)
      .lte("activity_date", to)
      .order("activity_date")
      .order("employee_id")
      .order("shift")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * Grille calculée en direct depuis le Pointage. Employés retenus : ceux qui ont un pointage
 * dans la période, et les employés actifs embauchés au plus tard à la fin de la période.
 * Fonction et équipe : celles enregistrées dans le pointage de la période (sinon la fiche).
 */
export async function getLiveGrid(month: string, startDay?: number): Promise<GridData> {
  const day = startDay ?? (await getPeriodStartDay());
  const { from, to } = attendancePeriod(month, day);
  const supabase = await createClient();
  const [employees, records, { data: holidays }] = await Promise.all([
    getEmployees(),
    fetchRecords(from, to),
    supabase.from("holidays").select("date, label").gte("date", from).lte("date", to),
  ]);
  const lastSnapshot = new Map<string, { position: Position; team_type: TeamType }>();
  for (const r of records) lastSnapshot.set(r.employee_id, { position: r.position, team_type: r.team_type });
  const gridEmployees: GridEmployee[] = employees
    .filter((e) => lastSnapshot.has(e.id) || (e.is_active && (!e.hire_date || e.hire_date <= to)))
    .map((e) => ({
      id: e.id,
      order_number: e.order_number,
      matricule: e.matricule,
      last_name: e.last_name,
      first_name: e.first_name,
      position: lastSnapshot.get(e.id)?.position ?? e.position,
      job_title: e.job_title ?? "",
      team_type: lastSnapshot.get(e.id)?.team_type ?? e.team_type,
    }));
  return buildGrid({ month, from, to, employees: gridEmployees, records, holidays: holidays ?? [] });
}

export type PeriodSnapshot = {
  id: string;
  period_month: string;
  revision: number;
  period_start: string;
  period_end: string;
  data: GridData;
  reason: string;
  created_at: string;
  created_by: string;
  created_by_name: string;
};

/** Versions finalisées d'une période (la plus récente en premier). */
export async function getPeriodSnapshots(month: string): Promise<PeriodSnapshot[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_period_snapshots")
    .select("id, period_month, revision, period_start, period_end, data, reason, created_at, created_by")
    .eq("period_month", month)
    .order("revision", { ascending: false });
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.created_by as string))];
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string) || (p.email as string) || ""]));
  return rows.map((r) => ({ ...(r as Omit<PeriodSnapshot, "created_by_name">), created_by_name: names.get(r.created_by as string) ?? "" }));
}

export type PeriodHistoryItem = { month: string; revision: number; finalized_at: string };

/** Périodes finalisées (dernière version de chacune). */
export async function getFinalizedPeriods(): Promise<PeriodHistoryItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("attendance_period_snapshots").select("period_month, revision, created_at").order("period_month", { ascending: false }).order("revision", { ascending: false }).limit(500);
  const seen = new Map<string, PeriodHistoryItem>();
  for (const r of data ?? []) if (!seen.has(r.period_month)) seen.set(r.period_month, { month: r.period_month, revision: r.revision, finalized_at: r.created_at });
  return [...seen.values()];
}
