import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getEmployee, type Employee } from "@/lib/data/employees";
import { getAttendanceHistory, type HistoryRow } from "@/lib/data/attendance";
import { getLeaveRequests, type LeaveRequest } from "@/lib/data/leaves";
import { getCollectionReports, type CollectionReportFull } from "@/lib/data/reports";
import { getTasks, type WorkTask } from "@/lib/data/tasks";
import { getWarnings, type Warning } from "@/lib/data/warnings";
import { getEmployeePhotos } from "@/lib/data/photos";

export type CleaningPlace = { id: string; activity_date: string; location: string; comment: string };

export type WorkerReport = {
  employee: Employee;
  from: string;
  to: string;
  attendance: HistoryRow[];
  summary: { worked: number; absent: number; sick: number; leave: number; rest: number; overtime: number };
  leaves: LeaveRequest[];
  cleaningPlaces: CleaningPlace[];
  collections: CollectionReportFull[];
  tasks: WorkTask[];
  warnings: Warning[];
  photos: Awaited<ReturnType<typeof getEmployeePhotos>>;
};

/** Dossier complet d'un employé sur une période. */
export async function getWorkerReport(employeeId: string, from: string, to: string, includeWarnings: boolean): Promise<WorkerReport | null> {
  const employee = await getEmployee(employeeId);
  if (!employee) return null;
  const supabase = await createClient();
  const [attendance, leaves, cleaning, collections, tasks, warnings, photos] = await Promise.all([
    getAttendanceHistory({ employee: employeeId, from, to }, 1000),
    getLeaveRequests({ employee: employeeId, from, to }),
    supabase.from("cleaning_report_agents").select("id, activity_date, location, comment").eq("employee_id", employeeId).gte("activity_date", from).lte("activity_date", to).order("activity_date", { ascending: false }),
    getCollectionReports({ from, to }, 1000),
    getTasks({ from, to, employee: employeeId }, 1000),
    includeWarnings ? getWarnings({ employee: employeeId, from, to }) : Promise.resolve([] as Warning[]),
    getEmployeePhotos(employeeId, from, to),
  ]);

  const summary = { worked: 0, absent: 0, sick: 0, leave: 0, rest: 0, overtime: 0 };
  const seen = new Set<string>();
  for (const a of attendance) {
    summary.overtime += Number(a.overtime_hours);
    const key = `${a.activity_date}:${a.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (a.status === "present") summary.worked++;
    else if (a.status === "absent") summary.absent++;
    else if (a.status === "absent_maladie") summary.sick++;
    else if (a.status === "conge") summary.leave++;
    else if (a.status === "repos") summary.rest++;
  }

  return {
    employee,
    from,
    to,
    attendance,
    summary,
    leaves,
    cleaningPlaces: cleaning.data ?? [],
    collections: collections.filter((c) => c.chauffeur_id === employeeId || c.rippers.some((r) => r.id === employeeId)),
    tasks,
    warnings,
    photos,
  };
}
