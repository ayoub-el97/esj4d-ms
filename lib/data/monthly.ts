import "server-only";
import { createClient } from "@/lib/supabase/server";
import { employeeName, getEmployees } from "@/lib/data/employees";
import { getMonthlyAttendance } from "@/lib/data/attendance";
import { getTruckMonthly } from "@/lib/data/reports";
import { getLeaveRequests } from "@/lib/data/leaves";
import { getWarnings } from "@/lib/data/warnings";
import { workMonthRange } from "@/lib/dates";
import { getProjectStart } from "@/lib/data/settings";
import type { TeamType } from "@/lib/types";

export type MonthlyFilters = { team?: TeamType; employee?: string; truck?: string };

export type PerEmployeeCount = { employee_id: string; name: string; order_number: number; value: number };

export type MonthlyReport = {
  month: string;
  attendance: Awaited<ReturnType<typeof getMonthlyAttendance>>;
  trucks: Awaited<ReturnType<typeof getTruckMonthly>>;
  leaves: PerEmployeeCount[];
  warnings: PerEmployeeCount[];
  cleaningDays: PerEmployeeCount[];
  greenWasteCount: number;
  tasksPlanned: number;
  tasksDone: number;
};

/** Vue mensuelle regroupant pointage, camions, congés, avertissements et interventions (sans doublons). */
export async function getMonthlyReport(month: string, f: MonthlyFilters = {}): Promise<MonthlyReport> {
  const { from, to } = workMonthRange(month, await getProjectStart());
  const supabase = await createClient();
  const [employees, attendance, trucks, leaveRequests, warnings, cleaningAgents, greenWaste, tasks] = await Promise.all([
    getEmployees(),
    getMonthlyAttendance(month, f.team),
    getTruckMonthly(month),
    getLeaveRequests({ status: "acceptee", from, to }, 2000),
    getWarnings({ from, to }, 2000),
    supabase.from("cleaning_report_agents").select("employee_id, activity_date").gte("activity_date", from).lte("activity_date", to),
    supabase.from("green_waste_entries").select("id", { count: "exact", head: true }).gte("activity_date", from).lte("activity_date", to),
    supabase.from("work_tasks").select("status").gte("planned_date", from).lte("planned_date", to),
  ]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const keep = (employeeId: string) => {
    const e = byId.get(employeeId);
    if (!e) return false;
    if (f.employee && employeeId !== f.employee) return false;
    if (f.team && e.team_type !== f.team) return false;
    return true;
  };
  const toRow = (map: Map<string, number>): PerEmployeeCount[] =>
    Array.from(map.entries())
      .filter(([id]) => keep(id))
      .map(([employee_id, value]) => {
        const e = byId.get(employee_id)!;
        return { employee_id, name: employeeName(e), order_number: e.order_number, value };
      })
      .sort((a, b) => a.order_number - b.order_number);

  // Congés : jours acceptés dans le mois (bornés au mois)
  const leaveMap = new Map<string, number>();
  for (const r of leaveRequests) {
    const start = r.start_date < from ? from : r.start_date;
    const end = r.end_date > to ? to : r.end_date;
    const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
    if (days > 0) leaveMap.set(r.employee_id, (leaveMap.get(r.employee_id) ?? 0) + days);
  }
  const warnMap = new Map<string, number>();
  for (const w of warnings) warnMap.set(w.employee_id, (warnMap.get(w.employee_id) ?? 0) + 1);
  const cleanMap = new Map<string, Set<string>>();
  for (const a of cleaningAgents.data ?? []) {
    const s = cleanMap.get(a.employee_id) ?? new Set<string>();
    s.add(a.activity_date);
    cleanMap.set(a.employee_id, s);
  }
  const cleanCount = new Map(Array.from(cleanMap.entries()).map(([k, v]) => [k, v.size]));

  return {
    month,
    attendance: attendance.filter((r) => keep(r.employee_id)),
    trucks: f.truck ? trucks.filter((t) => t.truck?.id === f.truck) : trucks,
    leaves: toRow(leaveMap),
    warnings: toRow(warnMap),
    cleaningDays: toRow(cleanCount),
    greenWasteCount: greenWaste.count ?? 0,
    tasksPlanned: (tasks.data ?? []).filter((t) => t.status === "planifiee").length,
    tasksDone: (tasks.data ?? []).filter((t) => t.status === "realisee").length,
  };
}
