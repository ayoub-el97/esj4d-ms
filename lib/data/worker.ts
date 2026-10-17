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
  /** Jours de congé dont l'employé a bénéficié sur la période (même règle que le solde de congés) */
  leave_days: number;
  /** Jours de récupération pris sur la période (repos travaillé rendu) */
  recovery_days: number;
  /** Jours de récupération encore dus à la fin de la période */
  recovery_balance: number;
  /** Total des congés acquis à la fin de la période (1,5 j par mois complet de service) */
  leave_accrued: number;
  /** Congé restant à la fin de la période (acquis − pris + corrections) */
  leave_balance: number;
  holidays_worked: number;
};

/** Nombre de jours pris par employé, calculé par la fonction centrale days_taken (aucun double comptage). */
async function takenByEmployee(kind: "conge" | "recuperation", from: string, to: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("days_taken", { p_kind: kind, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const d of (data ?? []) as { employee_id: string }[]) counts.set(d.employee_id, (counts.get(d.employee_id) ?? 0) + 1);
  return counts;
}

export async function getWorkersPeriodReport(from: string, to: string, f: WorkersFilters): Promise<WorkerPeriodRow[]> {
  const team = f.categorie === "collecte" || f.categorie === "nettoiement" ? (f.categorie as TeamType) : undefined;
  const supabase = await createClient();
  const [summary, employees, leaveTaken, recoveryTaken, recoveryBalances, leaveBalances] = await Promise.all([
    getAttendanceSummary(from, to, team),
    getEmployees(),
    takenByEmployee("conge", from, to),
    takenByEmployee("recuperation", from, to),
    supabase.rpc("recovery_balances", { p_from: from, p_to: to }),
    supabase.rpc("leave_balances", { p_as_of: to }),
  ]);
  if (recoveryBalances.error) throw new Error(recoveryBalances.error.message);
  if (leaveBalances.error) throw new Error(leaveBalances.error.message);
  const leaveByEmployee = new Map(((leaveBalances.data ?? []) as { employee_id: string; accrued: number; balance: number }[]).map((b) => [b.employee_id, { accrued: Number(b.accrued), balance: Number(b.balance) }]));
  const balanceByEmployee = new Map(((recoveryBalances.data ?? []) as { employee_id: string; balance: number }[]).map((b) => [b.employee_id, Number(b.balance)]));
  const byEmployee = new Map(summary.map((s) => [s.employee_id, s]));
  const names = new Map(employees.map((e) => [e.id, employeeName(e)]));
  const q = (f.q ?? "").toLowerCase();

  return employees
    .filter((e) => e.is_active || byEmployee.has(e.id) || leaveTaken.has(e.id) || recoveryTaken.has(e.id))
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
        leave_days: leaveTaken.get(e.id) ?? 0,
        recovery_days: recoveryTaken.get(e.id) ?? 0,
        recovery_balance: balanceByEmployee.get(e.id) ?? 0,
        leave_accrued: leaveByEmployee.get(e.id)?.accrued ?? 0,
        leave_balance: leaveByEmployee.get(e.id)?.balance ?? 0,
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
  summary: { worked: number; restWorked: number; absent: number; sick: number; leave: number; recovery: number; recoveryBalance: number; leaveAccrued: number; leaveBalance: number; overtime: number };
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
  const s = (await getWorkersPeriodReport(from, to, { employe: employeeId }))[0];
  const summary = {
    worked: s?.worked_days ?? 0,
    restWorked: s?.rest_days_worked ?? 0,
    absent: s?.absences ?? 0,
    sick: s?.sick_days ?? 0,
    leave: s?.leave_days ?? 0,
    recovery: s?.recovery_days ?? 0,
    recoveryBalance: s?.recovery_balance ?? 0,
    leaveAccrued: s?.leave_accrued ?? 0,
    leaveBalance: s?.leave_balance ?? 0,
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
