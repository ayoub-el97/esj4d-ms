import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getTrucks, type Truck } from "@/lib/data/employees";
import { getPhotosFor } from "@/lib/data/photos";
import { getProjectStart, getSettings } from "@/lib/data/settings";
import { todayISO, workMonthOf } from "@/lib/dates";
import { alertRulesFrom, incidentDays, periodDowntime, truckDowntime, type AlertRules, type DowntimeIncident, type PeriodDowntime, type TruckDowntime } from "@/lib/downtime";
import type { PhotoItem, PhotoPhase } from "@/lib/photo-types";
import { isActualExpense, type RepairStatus } from "@/lib/repair-types";

export type Repair = {
  id: string;
  truck_id: string;
  reported_date: string;
  problem_description: string;
  problem_location: string;
  notes: string;
  repair_date: string | null;
  repair_description: string;
  status: RepairStatus;
  cost: number | null;
  cancelled_expense: boolean;
  repair_notes: string;
  /** Hors service depuis (null = camion resté en service) */
  out_of_service_since: string | null;
  /** Remise en service prévue */
  expected_return_date: string | null;
  correction_reason: string;
  /** Durée finale figée par la base (réparé) */
  downtime_days: number | null;
  created_at: string;
  updated_at: string;
  truck: Truck | null;
  /** Jours hors service (en cours : jusqu'à aujourd'hui ; réparé : durée finale) */
  days: number | null;
  /** Compté dans les dépenses (même règle que la base) */
  counted: boolean;
  photos: Record<PhotoPhase, PhotoItem[]>;
};

export type RepairFilters = { q?: string; truck?: string; status?: string; from?: string; to?: string };

type Row = Omit<Repair, "truck" | "counted" | "photos" | "days">;

function groupPhotos(list: PhotoItem[]): Record<PhotoPhase, PhotoItem[]> {
  const g: Record<PhotoPhase, PhotoItem[]> = { vehicule: [], avant: [], apres: [], justificatif: [], materiel: [], document: [] };
  for (const p of list) g[p.phase]?.push(p);
  return g;
}

async function hydrate(rows: Row[]): Promise<Repair[]> {
  const [trucks, photos] = await Promise.all([getTrucks(), getPhotosFor("truck_repair", rows.map((r) => r.id))]);
  const byId = new Map(trucks.map((t) => [t.id, t]));
  const today = todayISO();
  return rows.map((r) => {
    const cost = r.cost == null ? null : Number(r.cost);
    const base = { ...r, cost };
    const days = r.status === "repare" && r.downtime_days != null ? r.downtime_days : incidentDays(r, today);
    return { ...base, truck: byId.get(r.truck_id) ?? null, counted: isActualExpense(base), photos: groupPhotos(photos.get(r.id) ?? []), days };
  });
}

/**
 * Liste filtrée. La période (du / au) porte sur la date de signalement OU la date de
 * réparation, pour retrouver un dossier quelle que soit la date cherchée.
 */
export async function getRepairs(f: RepairFilters = {}, limit = 1000): Promise<Repair[]> {
  const supabase = await createClient();
  let q = supabase.from("truck_repairs").select("*").order("reported_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  if (f.truck) q = q.eq("truck_id", f.truck);
  if (f.status) q = q.eq("status", f.status);
  if (f.from && f.to) q = q.or(`and(reported_date.gte.${f.from},reported_date.lte.${f.to}),and(repair_date.gte.${f.from},repair_date.lte.${f.to})`);
  else if (f.from) q = q.or(`reported_date.gte.${f.from},repair_date.gte.${f.from}`);
  else if (f.to) q = q.or(`reported_date.lte.${f.to},repair_date.lte.${f.to}`);
  const { data } = await q.returns<Row[]>();
  let rows = await hydrate(data ?? []);
  const term = (f.q ?? "").trim().toLowerCase();
  if (term)
    rows = rows.filter((r) => [r.problem_description, r.problem_location, r.repair_description, r.notes, r.repair_notes, r.truck?.matricule, r.truck?.brand, r.truck?.model].some((x) => (x ?? "").toLowerCase().includes(term)));
  return rows;
}

export async function getRepair(id: string): Promise<Repair | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("truck_repairs").select("*").eq("id", id).maybeSingle<Row>();
  if (!data) return null;
  return (await hydrate([data]))[0];
}

export type RepairHistoryEntry = { at: string; action: string; user_email: string | null; old_status: string | null; new_status: string | null; old_cost: number | null; new_cost: number | null; changed: string[] };

/** Journal des modifications d'une réparation (création, coût, statut…). */
export async function getRepairHistory(id: string): Promise<RepairHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("repair_history", { p_repair: id });
  if (error) return [];
  return ((data ?? []) as RepairHistoryEntry[]).map((h) => ({ ...h, old_cost: h.old_cost == null ? null : Number(h.old_cost), new_cost: h.new_cost == null ? null : Number(h.new_cost) }));
}

// ---------------------------------------------------------------------------
// Rapport des dépenses de réparation
// ---------------------------------------------------------------------------
export type RepairExpenseRow = {
  truck: Truck | null;
  truck_id: string;
  repairs: number;
  total: number;
  items: { id: string; date: string; cost: number; description: string; status: RepairStatus; receipts: number }[];
};

export type RepairExpenseReport = {
  from: string;
  to: string;
  rows: RepairExpenseRow[];
  total: number;
  repairs: number;
  /** Total par mois (mois de projet de la date de réparation, aaaa-mm du début) */
  byMonth: { month: string; total: number; repairs: number }[];
};

/** Dépenses réelles par camion sur [from, to] (date de réparation) ; calcul par la base, sans doublon. */
export async function getRepairExpenseReport(from: string, to: string, truckId?: string): Promise<RepairExpenseReport> {
  const supabase = await createClient();
  let q = supabase.from("truck_repair_expenses").select("repair_id, truck_id, expense_date, cost, status").gte("expense_date", from).lte("expense_date", to).order("expense_date");
  if (truckId) q = q.eq("truck_id", truckId);
  const [{ data, error }, trucks, projectStart] = await Promise.all([q, getTrucks(), getProjectStart()]);
  if (error) throw new Error(error.message);
  const expenses = (data ?? []) as { repair_id: string; truck_id: string; expense_date: string; cost: number; status: RepairStatus }[];
  const ids = expenses.map((e) => e.repair_id);
  const [{ data: details }, photos] = await Promise.all([
    ids.length ? supabase.from("truck_repairs").select("id, problem_description, repair_description").in("id", ids) : Promise.resolve({ data: [] as { id: string; problem_description: string; repair_description: string }[] }),
    getPhotosFor("truck_repair", ids),
  ]);
  const detailById = new Map((details ?? []).map((d) => [d.id, d]));
  const truckById = new Map(trucks.map((t) => [t.id, t]));

  const byTruck = new Map<string, RepairExpenseRow>();
  const byMonth = new Map<string, { month: string; total: number; repairs: number }>();
  for (const e of expenses) {
    const cost = Number(e.cost);
    const row = byTruck.get(e.truck_id) ?? { truck: truckById.get(e.truck_id) ?? null, truck_id: e.truck_id, repairs: 0, total: 0, items: [] };
    const d = detailById.get(e.repair_id);
    row.repairs += 1;
    row.total += cost;
    row.items.push({
      id: e.repair_id,
      date: e.expense_date,
      cost,
      description: d?.repair_description || d?.problem_description || "",
      status: e.status,
      receipts: (photos.get(e.repair_id) ?? []).filter((p) => p.phase === "justificatif").length,
    });
    byTruck.set(e.truck_id, row);
    const m = workMonthOf(e.expense_date, projectStart); // mois de projet
    const bm = byMonth.get(m) ?? { month: m, total: 0, repairs: 0 };
    bm.total += cost;
    bm.repairs += 1;
    byMonth.set(m, bm);
  }
  const rows = Array.from(byTruck.values()).sort((a, b) => b.total - a.total);
  return {
    from,
    to,
    rows,
    total: rows.reduce((s, r) => s + r.total, 0),
    repairs: rows.reduce((s, r) => s + r.repairs, 0),
    byMonth: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)),
  };
}

// ---------------------------------------------------------------------------
// Immobilisation (jours hors service) et alertes
// ---------------------------------------------------------------------------
export async function getAlertRules(): Promise<AlertRules> {
  return alertRulesFrom((await getSettings()) as unknown as Record<string, unknown>);
}

async function getIncidents(): Promise<DowntimeIncident[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("truck_repairs").select("id, truck_id, status, out_of_service_since, repair_date, expected_return_date, reported_date").limit(10000);
  if (error) throw new Error(error.message);
  return (data ?? []) as DowntimeIncident[];
}

export type FleetTruck = TruckDowntime & { truck: Truck; lastRepairDate: string | null; repairedInPeriod: number; period?: PeriodDowntime; expenses: number };

export type FleetOverview = {
  today: string;
  rules: AlertRules;
  trucks: FleetTruck[];
  from: string;
  to: string;
};

/** Situation de chaque camion aujourd'hui + statistiques sur [from, to] (dépenses réelles : date de réparation). */
export async function getFleetOverview(from: string, to: string): Promise<FleetOverview> {
  const supabase = await createClient();
  const today = todayISO();
  const [trucks, incidents, rules, { data: expenses }] = await Promise.all([
    getTrucks(),
    getIncidents(),
    getAlertRules(),
    supabase.from("truck_repair_expenses").select("truck_id, cost").gte("expense_date", from).lte("expense_date", to),
  ]);
  const spent = new Map<string, number>();
  for (const e of expenses ?? []) spent.set(e.truck_id, (spent.get(e.truck_id) ?? 0) + Number(e.cost));
  const list: FleetTruck[] = trucks
    .filter((tr) => tr.is_active || incidents.some((r) => r.truck_id === tr.id))
    .map((tr) => {
      const mine = incidents.filter((r) => r.truck_id === tr.id);
      const repaired = mine.filter((r) => r.status === "repare" && r.repair_date).map((r) => r.repair_date!).sort();
      return {
        ...truckDowntime(tr.id, incidents, today, rules),
        truck: tr,
        lastRepairDate: repaired.at(-1) ?? null,
        repairedInPeriod: repaired.filter((d) => d >= from && d <= to).length,
        period: periodDowntime(tr.id, incidents, from, to, today),
        expenses: spent.get(tr.id) ?? 0,
      };
    });
  return { today, rules, trucks: list, from, to };
}

/** Immobilisation de chaque camion sur une période (rapport mensuel / annuel / libre). */
export async function getDowntimeReport(from: string, to: string, truckId?: string): Promise<{ rows: (PeriodDowntime & { truck: Truck | null })[]; today: string }> {
  const today = todayISO();
  const [trucks, incidents] = await Promise.all([getTrucks(), getIncidents()]);
  const ids = [...new Set(incidents.map((r) => r.truck_id))].filter((id) => !truckId || id === truckId);
  const byId = new Map(trucks.map((t) => [t.id, t]));
  const rows = ids
    .map((id) => ({ ...periodDowntime(id, incidents, from, to, today), truck: byId.get(id) ?? null }))
    .filter((r) => r.incidents || r.downtimeDays || r.closedInPeriod)
    .sort((a, b) => b.downtimeDays - a.downtimeDays || b.incidents - a.incidents);
  return { rows, today };
}

/** Situation actuelle d'un camion (historique). */
export async function getTruckDowntime(truckId: string): Promise<TruckDowntime> {
  const [incidents, rules] = await Promise.all([getIncidents(), getAlertRules()]);
  return truckDowntime(truckId, incidents, todayISO(), rules);
}
