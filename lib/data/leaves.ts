import "server-only";
import { todayISO } from "@/lib/dates";
import type { AvailableCredit, CreditKind, CreditState } from "@/lib/recovery-credit";
import { createClient } from "@/lib/supabase/server";
import { employeeName, getEmployees, type Employee } from "@/lib/data/employees";
import type { LeaveStatus } from "@/lib/module-types";
import type { Position, TeamType } from "@/lib/types";
export { LEAVE_STATUS_LABELS, type LeaveStatus } from "@/lib/module-types";

// Tous les soldes sont calculés par la base (fonctions leave_balances, recovery_balances,
// days_taken, recovery_credits) : écrans et PDF affichent exactement les mêmes chiffres.

type EmpInfo = { name: string; order_number: number; matricule: string; team_type: TeamType | null; position: Position | null; hire_date: string | null; is_active: boolean };

function info(e: Employee | undefined): EmpInfo {
  return {
    name: e ? employeeName(e) : "?",
    order_number: e?.order_number ?? 0,
    matricule: e?.matricule ?? "",
    team_type: e?.team_type ?? null,
    position: e?.position ?? null,
    hire_date: e?.hire_date ?? null,
    is_active: e?.is_active ?? false,
  };
}

async function decidersById(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean))) as string[];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", unique);
  for (const p of data ?? []) map.set(p.id, p.full_name || p.email);
  return map;
}

// ---------------------------------------------------------------------------
// Demandes de congé
// ---------------------------------------------------------------------------
export type LeaveRequest = EmpInfo & {
  id: string;
  employee_id: string;
  request_date: string;
  start_date: string;
  end_date: string;
  days: number;
  requested_days: number;
  reason: string;
  status: LeaveStatus;
  decided_at: string | null;
  decided_by_name: string;
  decision_note: string;
  created_at: string;
};

export type RequestFilters = { employee?: string; status?: string; from?: string; to?: string; q?: string };

function matchesQuery(r: { name: string; matricule: string }, q?: string) {
  if (!q) return true;
  const s = q.toLowerCase();
  return r.name.toLowerCase().includes(s) || r.matricule.toLowerCase().includes(s);
}

export async function getLeaveRequests(f: RequestFilters = {}, limit = 1000): Promise<LeaveRequest[]> {
  const supabase = await createClient();
  let q = supabase.from("leave_requests").select("*").order("start_date", { ascending: false }).limit(limit);
  if (f.employee) q = q.eq("employee_id", f.employee);
  if (f.status) q = q.eq("status", f.status);
  if (f.from) q = q.gte("end_date", f.from);
  if (f.to) q = q.lte("start_date", f.to);
  const [{ data }, employees] = await Promise.all([q, getEmployees()]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const deciders = await decidersById((data ?? []).map((r) => r.decided_by));
  return (data ?? [])
    .map((r) => ({
      ...r,
      ...info(byId.get(r.employee_id)),
      days: Number(r.days),
      requested_days: Number(r.requested_days),
      decided_by_name: r.decided_by ? (deciders.get(r.decided_by) ?? "") : "",
    }))
    .filter((r) => matchesQuery(r, f.q)) as LeaveRequest[];
}

// ---------------------------------------------------------------------------
// Soldes de congés
// ---------------------------------------------------------------------------
export type LeaveBalance = EmpInfo & {
  employee_id: string;
  months: number;
  accrued: number;
  taken: number;
  planned: number;
  adjustments: number;
  balance: number;
};

export type BalanceFilters = { team?: string; q?: string; includeInactive?: boolean };

export async function getLeaveBalances(asOf: string, f: BalanceFilters = {}): Promise<LeaveBalance[]> {
  const supabase = await createClient();
  const [{ data, error }, employees] = await Promise.all([supabase.rpc("leave_balances", { p_as_of: asOf }), getEmployees()]);
  if (error) throw new Error(error.message);
  const byId = new Map(employees.map((e) => [e.id, e]));
  type Raw = { employee_id: string; months: number; accrued: number; taken: number; planned: number; adjustments: number; balance: number };
  return ((data ?? []) as Raw[])
    .map((r) => ({
      ...info(byId.get(r.employee_id)),
      employee_id: r.employee_id,
      months: Number(r.months),
      accrued: Number(r.accrued),
      taken: Number(r.taken),
      planned: Number(r.planned),
      adjustments: Number(r.adjustments),
      balance: Number(r.balance),
    }))
    .filter((r) => (f.includeInactive ? true : r.is_active))
    .filter((r) => !f.team || r.team_type === f.team)
    .filter((r) => matchesQuery(r, f.q))
    .sort((a, b) => a.order_number - b.order_number);
}

export type AccrualLine = { month_index: number; credit_date: string; days: number; cumulative: number };
export type TakenDay = { day: string; source: "pointage" | "demande" };
export type Adjustment = { id: string; employee_id: string; days: number; reason: string; kind: "conge" | "recuperation"; created_at: string };

/** Détail d'un employé : acquisitions mois par mois, jours pris, ajustements. */
export async function getLeaveDetail(employeeId: string, asOf: string) {
  const supabase = await createClient();
  const [{ data: schedule }, { data: taken }, { data: adjustments }] = await Promise.all([
    supabase.rpc("leave_accrual_schedule", { p_employee: employeeId, p_as_of: asOf }),
    supabase.rpc("days_taken", { p_kind: "conge", p_from: null, p_to: asOf }),
    supabase.from("leave_adjustments").select("*").eq("employee_id", employeeId).eq("kind", "conge").order("created_at", { ascending: false }),
  ]);
  return {
    schedule: ((schedule ?? []) as AccrualLine[]).map((s) => ({ ...s, days: Number(s.days), cumulative: Number(s.cumulative) })),
    taken: ((taken ?? []) as (TakenDay & { employee_id: string })[]).filter((d) => d.employee_id === employeeId).sort((a, b) => b.day.localeCompare(a.day)),
    adjustments: ((adjustments ?? []) as Adjustment[]).map((a) => ({ ...a, days: Number(a.days) })),
  };
}

// ---------------------------------------------------------------------------
// Récupération
// ---------------------------------------------------------------------------
export type RecoveryRequest = EmpInfo & {
  id: string;
  employee_id: string;
  request_date: string;
  worked_rest_date: string;
  recovery_date: string;
  requested_days: number;
  comment: string;
  status: LeaveStatus;
  decided_at: string | null;
  decided_by_name: string;
  decision_note: string;
  created_at: string;
};

export async function getRecoveryRequests(f: RequestFilters = {}, limit = 1000): Promise<RecoveryRequest[]> {
  const supabase = await createClient();
  let q = supabase.from("recovery_requests").select("*").order("recovery_date", { ascending: false }).limit(limit);
  if (f.employee) q = q.eq("employee_id", f.employee);
  if (f.status) q = q.eq("status", f.status);
  if (f.from) q = q.gte("recovery_date", f.from);
  if (f.to) q = q.lte("recovery_date", f.to);
  const [{ data }, employees] = await Promise.all([q, getEmployees()]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const deciders = await decidersById((data ?? []).map((r) => r.decided_by));
  return (data ?? [])
    .map((r) => ({ ...r, ...info(byId.get(r.employee_id)), requested_days: Number(r.requested_days), decided_by_name: r.decided_by ? (deciders.get(r.decided_by) ?? "") : "" }))
    .filter((r) => matchesQuery(r, f.q)) as RecoveryRequest[];
}

export type RecoveryBalance = EmpInfo & {
  employee_id: string;
  credits_period: number;
  taken_period: number;
  credits_total: number;
  taken_total: number;
  adjustments: number;
  pending: number;
  balance: number;
};

/** Soldes de récupération : crédits / utilisations sur [from, to], solde au `to`. */
export async function getRecoveryBalances(from: string | null, to: string, f: BalanceFilters = {}): Promise<RecoveryBalance[]> {
  const supabase = await createClient();
  const [{ data, error }, employees] = await Promise.all([supabase.rpc("recovery_balances", { p_from: from, p_to: to }), getEmployees()]);
  if (error) throw new Error(error.message);
  const byId = new Map(employees.map((e) => [e.id, e]));
  type Raw = Omit<RecoveryBalance, keyof EmpInfo>;
  return ((data ?? []) as Raw[])
    .map((r) => ({
      ...info(byId.get(r.employee_id)),
      employee_id: r.employee_id,
      credits_period: Number(r.credits_period),
      taken_period: Number(r.taken_period),
      credits_total: Number(r.credits_total),
      taken_total: Number(r.taken_total),
      adjustments: Number(r.adjustments),
      pending: Number(r.pending),
      balance: Number(r.balance),
    }))
    .filter((r) => (f.includeInactive ? true : r.is_active))
    .filter((r) => !f.team || r.team_type === f.team)
    .filter((r) => matchesQuery(r, f.q))
    .sort((a, b) => a.order_number - b.order_number);
}

export type RecoveryCredit = {
  employee_id: string;
  worked_rest_date: string;
  used_by_request: string | null;
  request_status: LeaveStatus | null;
  /** repos : jour de repos travaillé ; ferie : jour férié travaillé (à demander avant la fin du mois) */
  kind: CreditKind;
  holiday_label: string | null;
  expires_on: string | null;
  state: CreditState;
};

/** Crédits de récupération (un par jour de repos travaillé), avec la demande qui les utilise éventuellement. */
export async function getRecoveryCredits(employeeId?: string, to?: string): Promise<RecoveryCredit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recovery_credits", { p_from: null, p_to: to ?? "2999-12-31" });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RecoveryCredit[]).filter((c) => !employeeId || c.employee_id === employeeId).sort((a, b) => b.worked_rest_date.localeCompare(a.worked_rest_date));
}

/** Crédits encore utilisables par employé : ni demandés, ni fériés passés « à payer ». */
export async function getAvailableCredits(): Promise<Record<string, AvailableCredit[]>> {
  const credits = await getRecoveryCredits(undefined, todayISO());
  const result: Record<string, AvailableCredit[]> = {};
  for (const c of credits) {
    if (c.state !== "disponible") continue;
    (result[c.employee_id] ??= []).push({ date: c.worked_rest_date, kind: c.kind, label: c.holiday_label, expires_on: c.expires_on });
  }
  return result;
}

/** Fériés travaillés « à payer » (non demandés avant la fin du mois) par employé, sur une période. */
export async function getHolidayPayDue(from: string, to: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recovery_credits", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const result = new Map<string, number>();
  for (const c of (data ?? []) as RecoveryCredit[]) if (c.state === "a_payer") result.set(c.employee_id, (result.get(c.employee_id) ?? 0) + 1);
  return result;
}

export async function getRecoveryDetail(employeeId: string, asOf: string) {
  const supabase = await createClient();
  const [credits, { data: taken }, { data: adjustments }] = await Promise.all([
    getRecoveryCredits(employeeId, asOf),
    supabase.rpc("days_taken", { p_kind: "recuperation", p_from: null, p_to: asOf }),
    supabase.from("leave_adjustments").select("*").eq("employee_id", employeeId).eq("kind", "recuperation").order("created_at", { ascending: false }),
  ]);
  return {
    credits,
    taken: ((taken ?? []) as (TakenDay & { employee_id: string })[]).filter((d) => d.employee_id === employeeId).sort((a, b) => b.day.localeCompare(a.day)),
    adjustments: ((adjustments ?? []) as Adjustment[]).map((a) => ({ ...a, days: Number(a.days) })),
  };
}
