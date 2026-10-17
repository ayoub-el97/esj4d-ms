import "server-only";
import { createClient } from "@/lib/supabase/server";
import { employeeName, getEmployee, getEmployees, type Employee } from "@/lib/data/employees";
import { getAttendanceHistory, getAttendanceSummary, type HistoryRow } from "@/lib/data/attendance";
import type { Position, TeamType } from "@/lib/types";
import { getLeaveRequests, type LeaveRequest } from "@/lib/data/leaves";
import { getCollectionReports, type CollectionReportFull } from "@/lib/data/reports";
import { getTasks, type WorkTask } from "@/lib/data/tasks";
import { getWarnings, type Warning } from "@/lib/data/warnings";
import { getEmployeePhotos } from "@/lib/data/photos";

// ---------------------------------------------------------------------------
// Rapport global des employés sur une période (calculs : fonction attendance_summary)
// ---------------------------------------------------------------------------
export type WorkersFilters = { categorie?: string; employe?: string; poste?: string; equipe?: string; q?: string };

export type WorkerPeriodRow = {
  employee_id: string;
  order_number: number;
  matricule: string;
  name: string;
  team_type: TeamType;
  position: Position;
  crew: string;
  worked_days: number;
  rest_days_worked: number;
  overtime_total: number;
  absences: number;
  sick_days: number;
  leave_days: number;
  recovery_days: number;
  holidays_worked: number;
};

export async function getWorkersPeriodReport(from: string, to: string, f: WorkersFilters): Promise<WorkerPeriodRow[]> {
  const team = f.categorie === "collecte" || f.categorie === "nettoiement" ? (f.categorie as TeamType) : undefined;
  const [summary, employees] = await Promise.all([getAttendanceSummary(from, to, team), getEmployees()]);
  const byEmployee = new Map(summary.map((s) => [s.employee_id, s]));
  const names = new Map(employees.map((e) => [e.id, employeeName(e)]));
  const q = (f.q ?? "").toLowerCase();

  return employees
    .filter((e) => e.is_active || byEmployee.has(e.id))
    .filter((e) => !team || e.team_type === team)
    .filter((e) => !f.employe || e.id === f.employe)
    .filter((e) => !f.poste || e.position === f.poste)
    .filter((e) => !f.equipe || e.id === f.equipe || e.chauffeur_id === f.equipe)
    .filter((e) => !q || `${employeeName(e)} ${e.matricule}`.toLowerCase().includes(q))
    .map((e) => {
      const s = byEmployee.get(e.id);
      const crewChauffeur = e.position === "chauffeur" ? e.id : e.chauffeur_id;
      return {
        employee_id: e.id,
        order_number: e.order_number,
        matricule: e.matricule,
        name: employeeName(e),
        team_type: e.team_type,
        position: e.position,
        crew: crewChauffeur ? (names.get(crewChauffeur) ?? "") : "",
        worked_days: s?.worked_days ?? 0,
        rest_days_worked: s?.rest_days_worked ?? 0,
        overtime_total: s?.overtime_total ?? 0,
        absences: s?.absences ?? 0,
        sick_days: s?.sick_days ?? 0,
        leave_days: s?.leave_days ?? 0,
        recovery_days: s?.recovery_days ?? 0,
        holidays_worked: s?.holidays_worked ?? 0,
      };
    })
    .sort((a, b) => a.order_number - b.order_number);
}

export type CleaningPlace ={ id: string; activity_date: string; location: string; comment: string };

export type WorkerReport = {
  employee: Employee;
  from: string;
  to: string;
  attendance: HistoryRow[];
  summary: { worked: number; restWorked: number; absent: number; sick: number; leave: number; recovery: number; rest: number; overtime: number };
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

  // Même calcul centralisé que le rapport global (un jour n'est compté qu'une fois)
  const s = (await getAttendanceSummary(from, to)).find((r) => r.employee_id === employeeId);
  const summary = {
    worked: s?.worked_days ?? 0,
    restWorked: s?.rest_days_worked ?? 0,
    absent: s?.absences ?? 0,
    sick: s?.sick_days ?? 0,
    leave: s?.leave_days ?? 0,
    recovery: s?.recovery_days ?? 0,
    rest: s?.rest_days ?? 0,
    overtime: s?.overtime_total ?? 0,
  };

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
