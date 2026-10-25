import "server-only";
import { getProjectStart } from "@/lib/data/settings";
import { workMonthRange } from "@/lib/dates";
import { parseISO, getDay } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { employeeName, getEmployees, getTrucks, type Employee } from "@/lib/data/employees";
import type { EmployeeOption, SheetRow, ElsewhereRow } from "@/lib/attendance-types";
import type { AttendanceStatus, DayStatus, Position, TeamType } from "@/lib/types";

export type WorkDay = {
  activity_date: string;
  status: DayStatus;
  closed_at: string | null;
  closed_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
};

export async function getWorkDay(date: string): Promise<WorkDay | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("work_days").select("*").eq("activity_date", date).maybeSingle<WorkDay>();
  return data;
}

export async function isDayClosed(date: string): Promise<boolean> {
  const wd = await getWorkDay(date);
  return wd?.status === "closed";
}

export async function getRecentWorkDays(limit = 30): Promise<WorkDay[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("work_days")
    .select("*")
    .order("activity_date", { ascending: false })
    .limit(limit)
    .returns<WorkDay[]>();
  return data ?? [];
}

export type AttendanceRecord = {
  id: string;
  activity_date: string;
  employee_id: string;
  shift: number;
  status: AttendanceStatus;
  time_in: string | null;
  time_out: string | null;
  overtime_hours: number;
  observation: string;
  replacing_employee_id: string | null;
  chauffeur_id: string | null;
  truck_id: string | null;
  position: Position;
  team_type: TeamType;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export function toOption(e: Employee): EmployeeOption {
  return {
    id: e.id,
    order_number: e.order_number,
    name: employeeName(e),
    matricule: e.matricule,
    position: e.position,
    team_type: e.team_type,
    rest_day: e.rest_day,
    chauffeur_id: e.chauffeur_id,
    substitute_id: e.substitute_id,
  };
}

/**
 * Construit les lignes de la feuille d'une équipe pour une date :
 * lignes déjà pointées + employés actifs de l'équipe non encore pointés (valeurs par défaut).
 */
export async function buildSheet(date: string, team: TeamType) {
  const supabase = await createClient();
  const [employees, trucks, { data: existing }, { data: meta }, { data: holiday }, { data: leaves }, { data: recoveries }] = await Promise.all([
    getEmployees(),
    getTrucks(true),
    supabase.from("attendance").select("*").eq("activity_date", date).eq("team_type", team).returns<AttendanceRecord[]>(),
    supabase.from("attendance_sheet_meta").select("team_lead").eq("activity_date", date).eq("team_type", team).maybeSingle<{ team_lead: string }>(),
    supabase.from("holidays").select("label").eq("date", date).maybeSingle<{ label: string }>(),
    // Congés et récupérations acceptés pour cette date : proposés par défaut
    supabase.from("leave_requests").select("id, employee_id").eq("status", "acceptee").lte("start_date", date).gte("end_date", date),
    supabase.from("recovery_requests").select("employee_id").eq("status", "acceptee").eq("recovery_date", date),
  ]);
  const onLeave = new Set((leaves ?? []).map((l) => l.employee_id as string));
  const leaveByEmployee = new Map((leaves ?? []).map((l) => [l.employee_id as string, l.id as string]));
  const { data: overrides } = await supabase.from("attendance_leave_overrides").select("id, employee_id, reason, created_at").eq("activity_date", date).eq("revoked", false);
  const overrideByEmployee = new Map((overrides ?? []).map((o) => [o.employee_id as string, { id: o.id as string, reason: o.reason as string, at: o.created_at as string }]));
  const onRecovery = new Set((recoveries ?? []).map((r) => r.employee_id as string));

  const byId = new Map(employees.map((e) => [e.id, e]));
  const dow = getDay(parseISO(date));
  const rows: SheetRow[] = [];

  for (const a of existing ?? []) {
    const e = byId.get(a.employee_id);
    rows.push({
      id: a.id,
      employee_id: a.employee_id,
      shift: a.shift,
      status: a.status,
      time_in: (a.time_in ?? "").slice(0, 5),
      time_out: (a.time_out ?? "").slice(0, 5),
      overtime_hours: Number(a.overtime_hours),
      observation: a.observation,
      replacing_employee_id: a.replacing_employee_id,
      chauffeur_id: a.chauffeur_id,
      // Feuilles enregistrées avant la migration 009 : camion habituel du chauffeur
      truck_id: a.truck_id ?? (a.position === "chauffeur" ? (e?.truck_id ?? null) : null),
      position: a.position,
      team_type: a.team_type,
      usual_position: e?.position ?? a.position,
      order_number: e?.order_number ?? 0,
      name: e ? employeeName(e) : "—",
      matricule: e?.matricule ?? "",
      rest_day: e?.rest_day ?? null,
      is_extra: !!e && (e.team_type !== team || !e.is_active || !!a.replacing_employee_id),
      entered_at: a.updated_at,
      substitute_id: e?.substitute_id ?? null,
      planned: onLeave.has(a.employee_id) ? "conge" : onRecovery.has(a.employee_id) ? "recuperation" : null,
    });
  }

  // Employés déjà pointés ce jour dans l'autre équipe (affectation du jour) : pas de ligne par défaut ici
  const { data: other } = await supabase.from("attendance").select("employee_id, team_type, position, shift").eq("activity_date", date).neq("team_type", team);
  const elsewhere: ElsewhereRow[] = (other ?? []).map((o) => {
    const e = byId.get(o.employee_id as string);
    return { employee_id: o.employee_id as string, name: e ? employeeName(e) : "—", team_type: o.team_type as TeamType, position: o.position as Position, shift: o.shift as number };
  });
  const alreadyIn = new Set([...rows.map((r) => r.employee_id), ...elsewhere.map((x) => x.employee_id)]);
  for (const e of employees) {
    if (e.team_type !== team || !e.is_active || alreadyIn.has(e.id)) continue;
    const defaultStatus: AttendanceStatus = holiday
      ? "ferie"
      : onLeave.has(e.id)
        ? "conge"
        : onRecovery.has(e.id)
          ? "recuperation"
          : e.rest_day === dow
            ? "repos"
            : "present";
    rows.push({
      id: null,
      employee_id: e.id,
      shift: 1,
      status: defaultStatus,
      time_in: "",
      time_out: "",
      overtime_hours: 0,
      observation: "",
      replacing_employee_id: null,
      chauffeur_id: e.position === "rippeur" ? e.chauffeur_id : null,
      truck_id: e.position === "chauffeur" ? e.truck_id : null,
      position: e.position,
      team_type: e.team_type,
      usual_position: e.position,
      order_number: e.order_number,
      name: employeeName(e),
      matricule: e.matricule,
      rest_day: e.rest_day,
      is_extra: false,
      entered_at: null,
      substitute_id: e.substitute_id,
      planned: onLeave.has(e.id) ? "conge" : onRecovery.has(e.id) ? "recuperation" : null,
    });
  }

  // Remplaçants attitrés : le jour de repos (ou d'absence prévue) d'un titulaire, son remplaçant
  // est placé dans son équipe. Seules les lignes non encore enregistrées sont préremplies.
  const NOT_WORKING: AttendanceStatus[] = ["repos", "conge", "recuperation"];
  for (const titular of rows) {
    if (titular.id !== null || titular.shift !== 1 || !titular.substitute_id || !NOT_WORKING.includes(titular.status)) continue;
    const sub = rows.find((r) => r.employee_id === titular.substitute_id && r.shift === 1);
    if (!sub || sub.id !== null || sub.replacing_employee_id) continue; // remplaçant absent, déjà pointé ou déjà affecté
    const subEmployee = byId.get(sub.employee_id);
    sub.replacing_employee_id = titular.employee_id;
    sub.chauffeur_id = titular.position === "chauffeur" ? titular.employee_id : titular.chauffeur_id;
    sub.status = subEmployee?.rest_day === dow ? "repos_travaille" : "present";
    // Le chauffeur remplaçant prend le camion du titulaire
    if (titular.position === "chauffeur") sub.truck_id = titular.truck_id;
  }

  // Congé approuvé : statut verrouillé sur « Congé », sauf modification autorisée
  for (const r of rows) {
    const req = leaveByEmployee.get(r.employee_id);
    r.leave_lock = req ? { request_id: req } : null;
    r.leave_override = req ? (overrideByEmployee.get(r.employee_id) ?? null) : null;
    if (req && !r.leave_override) {
      r.status = "conge";
    }
  }

  rows.sort((a, b) => a.order_number - b.order_number || a.shift - b.shift);

  return {
    rows,
    teamLead: meta?.team_lead ?? "",
    holidayLabel: holiday?.label ?? null,
    hasSaved: (existing ?? []).length > 0,
    elsewhere,
    options: employees.filter((e) => e.is_active).map(toOption),
    trucks: trucks.map((tr) => ({ id: tr.id, matricule: tr.matricule, brand: tr.brand })),
  };
}

/** Nombre de lignes pointées par équipe pour une date (tableau de bord du pointage). */
export async function getSheetCounts(date: string): Promise<Record<TeamType, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("attendance").select("team_type").eq("activity_date", date);
  const counts: Record<TeamType, number> = { collecte: 0, nettoiement: 0 };
  for (const r of data ?? []) counts[r.team_type as TeamType]++;
  return counts;
}

export type HistoryFilters = {
  from?: string;
  to?: string;
  employee?: string;
  team?: string;
  position?: string;
  status?: string;
};

export type HistoryRow = AttendanceRecord & { name: string; order_number: number; updated_by_email: string };

export async function getAttendanceHistory(f: HistoryFilters, limit = 500): Promise<HistoryRow[]> {
  const supabase = await createClient();
  let q = supabase.from("attendance").select("*").order("activity_date", { ascending: false }).order("team_type").limit(limit);
  if (f.from) q = q.gte("activity_date", f.from);
  if (f.to) q = q.lte("activity_date", f.to);
  if (f.employee) q = q.eq("employee_id", f.employee);
  if (f.team) q = q.eq("team_type", f.team);
  if (f.position) q = q.eq("position", f.position);
  if (f.status) q = q.eq("status", f.status);
  const [{ data }, employees] = await Promise.all([q.returns<AttendanceRecord[]>(), getEmployees()]);
  const byId = new Map(employees.map((e) => [e.id, e]));

  const userIds = Array.from(new Set((data ?? []).map((r) => r.updated_by).filter(Boolean))) as string[];
  const emails = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, email").in("id", userIds);
    for (const p of profiles ?? []) emails.set(p.id, p.email);
  }

  return (data ?? [])
    .map((r) => {
      const e = byId.get(r.employee_id);
      return {
        ...r,
        name: e ? employeeName(e) : "?",
        order_number: e?.order_number ?? 0,
        updated_by_email: r.updated_by ? (emails.get(r.updated_by) ?? "") : "",
      };
    })
    .sort((a, b) => (a.activity_date === b.activity_date ? a.order_number - b.order_number : 0));
}

/** Une ligne de synthèse calculée par la base (fonction attendance_summary) : un jour n'est compté qu'une fois. */
export type SummaryRow = {
  employee_id: string;
  worked_days: number;
  rest_days_worked: number;
  absences: number;
  sick_days: number;
  leave_days: number;
  recovery_days: number;
  rest_days: number;
  holidays_worked: number;
  double_days: number;
  overtime_total: number;
};

export type SummaryWithEmployee = SummaryRow & {
  name: string;
  order_number: number;
  matricule: string;
  position: Position | null;
  team_type: TeamType | null;
  chauffeur_id: string | null;
};

/** Synthèse du pointage sur une période [from, to]. */
export async function getAttendanceSummary(from: string, to: string, team?: TeamType): Promise<SummaryWithEmployee[]> {
  const supabase = await createClient();
  const [{ data, error }, employees] = await Promise.all([
    supabase.rpc("attendance_summary", { p_from: from, p_to: to, p_team: team ?? null }),
    getEmployees(),
  ]);
  if (error) throw new Error(error.message);
  const byId = new Map(employees.map((e) => [e.id, e]));
  return ((data ?? []) as SummaryRow[])
    .map((r) => {
      const e = byId.get(r.employee_id);
      return {
        ...r,
        overtime_total: Number(r.overtime_total),
        name: e ? employeeName(e) : "?",
        order_number: e?.order_number ?? 0,
        matricule: e?.matricule ?? "",
        position: e?.position ?? null,
        team_type: e?.team_type ?? null,
        chauffeur_id: e?.position === "chauffeur" ? e.id : (e?.chauffeur_id ?? null),
      };
    })
    .sort((a, b) => a.order_number - b.order_number);
}

/** Synthèse mensuelle (mois au format yyyy-MM). */
export async function getMonthlyAttendance(month: string, team?: TeamType) {
  const { from, to } = workMonthRange(month, await getProjectStart());
  return getAttendanceSummary(from, to, team);
}

/** Résumé d'une journée pour l'écran de clôture. */
/** Contrôle d'un rapport du jour avant clôture (libellés = clés de traduction + variables). */
type Msg = { key: string; vars?: Record<string, string | number> };
export type DayReportCheck = { key: string; label: Msg; href: string; missing: Msg[] };
const m = (key: string, vars?: Msg["vars"]): Msg => ({ key, vars });

export async function getDaySummary(date: string) {
  const supabase = await createClient();
  const [{ data }, { data: collections }, { data: cleaning }, { data: green }, { data: tasks }, { data: photos }, { data: trucks }] = await Promise.all([
    supabase.from("attendance").select("team_type, status").eq("activity_date", date),
    supabase.from("collection_reports").select("id, truck_id, sectors").eq("activity_date", date),
    supabase.from("cleaning_report_agents").select("id, employee_id, location, excluded").eq("activity_date", date),
    supabase.from("green_waste_entries").select("id, location").eq("activity_date", date),
    supabase.from("work_tasks").select("id, location, status").eq("planned_date", date),
    supabase.from("photos").select("entity_type, entity_id, phase").eq("activity_date", date),
    supabase.from("trucks").select("id, matricule"),
  ]);
  const summary: Record<TeamType, Record<string, number>> = { collecte: {}, nettoiement: {} };
  for (const r of data ?? []) {
    const t = r.team_type as TeamType;
    summary[t][r.status] = (summary[t][r.status] ?? 0) + 1;
  }
  // Photos avant / après par enregistrement
  const count = (type: string, id: string, phase: string) => (photos ?? []).filter((p) => p.entity_type === type && p.entity_id === id && p.phase === phase).length;
  const plate = new Map((trucks ?? []).map((tr) => [tr.id, tr.matricule as string]));
  const checks: DayReportCheck[] = [];
  for (const r of collections ?? []) {
    const missing = [!r.sectors?.trim() && m("lieux / secteurs"), !count("collection_report", r.id, "avant") && m("photos AVANT"), !count("collection_report", r.id, "apres") && m("photos APRÈS")].filter(Boolean) as Msg[];
    checks.push({ key: r.id, label: m("Rapport de collecte — camion {plate}", { plate: plate.get(r.truck_id) ?? "?" }), href: `/rapport-journalier/collecte/${r.id}`, missing });
  }
  const agents = (cleaning ?? []).filter((a) => !a.excluded);
  const agentsNoBefore = agents.filter((a) => !count("cleaning_report_agent", a.id, "avant")).length;
  const agentsNoAfter = agents.filter((a) => !count("cleaning_report_agent", a.id, "apres")).length;
  if (agents.length)
    checks.push({
      key: "nettoiement",
      label: m("Rapport de nettoiement — {count} agent(s)", { count: agents.length }),
      href: `/rapport-journalier/nettoiement?date=${date}`,
      missing: [agentsNoBefore && m("photos AVANT manquantes pour {count} agent(s)", { count: agentsNoBefore }), agentsNoAfter && m("photos APRÈS manquantes pour {count} agent(s)", { count: agentsNoAfter })].filter(Boolean) as Msg[],
    });
  for (const g of green ?? []) {
    const missing = [!count("green_waste", g.id, "avant") && m("photos AVANT"), !count("green_waste", g.id, "apres") && m("photos APRÈS")].filter(Boolean) as Msg[];
    checks.push({ key: g.id, label: m("Déchet vert — {place}", { place: g.location || "—" }), href: `/dechet-vert/${g.id}`, missing });
  }
  for (const tk of tasks ?? []) {
    const missing = [tk.status !== "realisee" && m("tâche non marquée réalisée"), !count("work_task", tk.id, "apres") && m("photos APRÈS")].filter(Boolean) as Msg[];
    checks.push({ key: tk.id, label: m("Programme de travail — {place}", { place: tk.location || "—" }), href: `/programme/${tk.id}`, missing });
  }
  return { attendance: summary, total: (data ?? []).length, checks };
}
