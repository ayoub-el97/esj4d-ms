import "server-only";
import { createClient } from "@/lib/supabase/server";
import { employeeName, getEmployees } from "@/lib/data/employees";
import type { LeaveStatus } from "@/lib/module-types";
export { LEAVE_STATUS_LABELS, type LeaveStatus } from "@/lib/module-types";

export type LeaveRequest = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  decided_at: string | null;
  decision_note: string;
  created_at: string;
  name: string;
  order_number: number;
};

export type LeaveFilters = { employee?: string; status?: string; from?: string; to?: string };

export async function getLeaveRequests(f: LeaveFilters = {}, limit = 500): Promise<LeaveRequest[]> {
  const supabase = await createClient();
  let q = supabase.from("leave_requests").select("*").order("start_date", { ascending: false }).limit(limit);
  if (f.employee) q = q.eq("employee_id", f.employee);
  if (f.status) q = q.eq("status", f.status);
  if (f.from) q = q.gte("end_date", f.from);
  if (f.to) q = q.lte("start_date", f.to);
  const [{ data }, employees] = await Promise.all([q, getEmployees()]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  return (data ?? []).map((r) => {
    const e = byId.get(r.employee_id);
    return { ...r, days: Number(r.days), name: e ? employeeName(e) : "?", order_number: e?.order_number ?? 0 } as LeaveRequest;
  });
}

export type LeaveBalance = {
  employee_id: string;
  accrued: number;
  taken: number;
  adjustments: number;
  balance: number;
  months: number;
  name: string;
  order_number: number;
  is_active: boolean;
  hire_date: string | null;
};

export async function getLeaveBalances(asOf: string): Promise<LeaveBalance[]> {
  const supabase = await createClient();
  const [{ data, error }, employees] = await Promise.all([supabase.rpc("leave_balances", { p_as_of: asOf }), getEmployees()]);
  if (error) throw new Error(error.message);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const rows = (data ?? []) as { employee_id: string; accrued: number; taken: number; adjustments: number; balance: number; months: number }[];
  return rows
    .map((r) => {
      const e = byId.get(r.employee_id);
      return {
        ...r,
        accrued: Number(r.accrued),
        taken: Number(r.taken),
        adjustments: Number(r.adjustments),
        balance: Number(r.balance),
        name: e ? employeeName(e) : "?",
        order_number: e?.order_number ?? 0,
        is_active: e?.is_active ?? false,
        hire_date: e?.hire_date ?? null,
      };
    })
    .sort((a, b) => a.order_number - b.order_number);
}

export type LeaveAdjustment = { id: string; employee_id: string; days: number; reason: string; created_at: string };

export async function getLeaveAdjustments(employeeId: string): Promise<LeaveAdjustment[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("leave_adjustments").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false });
  return (data ?? []).map((a) => ({ ...a, days: Number(a.days) }));
}
