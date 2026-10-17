import "server-only";
import { createClient } from "@/lib/supabase/server";
import { employeeName, getEmployees, getTrucks, type Truck } from "@/lib/data/employees";
import { getPhotosFor } from "@/lib/data/photos";
import type { PhotoItem } from "@/lib/photo-types";

export type FuelFilters = { from?: string; to?: string; truck?: string; driver?: string };
export type FuelPeriod = "day" | "week" | "month";

/** Un plein, avec les valeurs calculées par la vue fuel_entries_calc. */
export type FuelEntry = {
  id: string;
  activity_date: string;
  truck_id: string;
  driver_id: string | null;
  liters: number;
  cost: number;
  odometer_km: number;
  station: string;
  observations: string;
  previous_km: number | null;
  distance_km: number | null;
  l_per_100km: number | null;
  price_per_liter: number | null;
  truck: Truck | null;
  driver_name: string;
  photos: PhotoItem[];
};

export type FuelSummaryRow = {
  period_start: string;
  truck_id: string;
  truck: Truck | null;
  fills: number;
  liters: number;
  cost: number;
  distance_km: number;
  liters_measured: number;
  l_per_100km: number | null;
  cost_per_100km: number | null;
};

export type FuelTotals = { fills: number; liters: number; cost: number; distance_km: number; l_per_100km: number | null; cost_per_100km: number | null };

const num = (v: unknown) => (v == null ? null : Number(v));

type CalcRow = Omit<FuelEntry, "truck" | "driver_name" | "photos">;

export async function getFuelEntries(f: FuelFilters = {}, limit = 1000): Promise<FuelEntry[]> {
  const supabase = await createClient();
  let q = supabase.from("fuel_entries_calc").select("*").order("activity_date", { ascending: false }).order("odometer_km", { ascending: false }).limit(limit);
  if (f.from) q = q.gte("activity_date", f.from);
  if (f.to) q = q.lte("activity_date", f.to);
  if (f.truck) q = q.eq("truck_id", f.truck);
  if (f.driver) q = q.eq("driver_id", f.driver);
  const [{ data }, trucks, employees] = await Promise.all([q.returns<CalcRow[]>(), getTrucks(), getEmployees()]);
  const rows = data ?? [];
  const photos = await getPhotosFor("fuel_entry", rows.map((r) => r.id));
  const truckById = new Map(trucks.map((t) => [t.id, t]));
  const empById = new Map(employees.map((e) => [e.id, e]));
  return rows.map((r) => {
    const d = r.driver_id ? empById.get(r.driver_id) : null;
    return {
      ...r,
      liters: Number(r.liters),
      cost: Number(r.cost),
      odometer_km: Number(r.odometer_km),
      previous_km: num(r.previous_km),
      distance_km: num(r.distance_km),
      l_per_100km: num(r.l_per_100km),
      price_per_liter: num(r.price_per_liter),
      truck: truckById.get(r.truck_id) ?? null,
      driver_name: d ? employeeName(d) : "",
      photos: photos.get(r.id) ?? [],
    };
  });
}

export async function getFuelEntry(id: string): Promise<FuelEntry | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("fuel_entries_calc").select("activity_date, truck_id").eq("id", id).maybeSingle();
  if (!data) return null;
  const rows = await getFuelEntries({ from: data.activity_date, to: data.activity_date, truck: data.truck_id });
  return rows.find((r) => r.id === id) ?? null;
}

/** Synthèse par semaine (lundi) ou par mois, par camion (fonction SQL fuel_summary). */
export async function getFuelSummary(period: FuelPeriod, f: FuelFilters = {}): Promise<FuelSummaryRow[]> {
  const supabase = await createClient();
  const [{ data }, trucks] = await Promise.all([
    supabase.rpc("fuel_summary", { p_period: period, p_from: f.from || null, p_to: f.to || null, p_truck: f.truck || null, p_driver: f.driver || null }),
    getTrucks(),
  ]);
  const truckById = new Map(trucks.map((t) => [t.id, t]));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    period_start: String(r.period_start),
    truck_id: String(r.truck_id),
    truck: truckById.get(String(r.truck_id)) ?? null,
    fills: Number(r.fills),
    liters: Number(r.liters),
    cost: Number(r.cost),
    distance_km: Number(r.distance_km),
    liters_measured: Number(r.liters_measured),
    l_per_100km: num(r.l_per_100km),
    cost_per_100km: num(r.cost_per_100km),
  }));
}

/** Totaux d'un ensemble de lignes de synthèse (même règle de calcul que la fonction SQL). */
export function fuelTotals(rows: Pick<FuelSummaryRow, "fills" | "liters" | "cost" | "distance_km" | "liters_measured">[], costMeasured?: number): FuelTotals {
  const t = rows.reduce((a, r) => ({ fills: a.fills + r.fills, liters: a.liters + r.liters, cost: a.cost + r.cost, distance_km: a.distance_km + r.distance_km, measured: a.measured + r.liters_measured }), {
    fills: 0,
    liters: 0,
    cost: 0,
    distance_km: 0,
    measured: 0,
  });
  return {
    fills: t.fills,
    liters: t.liters,
    cost: t.cost,
    distance_km: t.distance_km,
    l_per_100km: t.distance_km > 0 ? Math.round((t.measured * 10000) / t.distance_km) / 100 : null,
    cost_per_100km: t.distance_km > 0 && costMeasured != null ? Math.round((costMeasured * 10000) / t.distance_km) / 100 : null,
  };
}

/** Totaux sur les pleins filtrés (KPI de la page et du PDF). */
export function entriesTotals(entries: FuelEntry[]): FuelTotals {
  const measured = entries.filter((e) => (e.distance_km ?? 0) > 0);
  return fuelTotals(
    entries.map((e) => ({ fills: 1, liters: e.liters, cost: e.cost, distance_km: (e.distance_km ?? 0) > 0 ? e.distance_km! : 0, liters_measured: (e.distance_km ?? 0) > 0 ? e.liters : 0 })),
    measured.reduce((s, e) => s + e.cost, 0),
  );
}

/** Archive des photos de carburant (toutes les photos des pleins filtrés). */
export async function getFuelPhotoArchive(f: FuelFilters = {}) {
  const entries = await getFuelEntries(f, 2000);
  return entries.filter((e) => e.photos.length > 0);
}

/** Tableau croisé des coûts : une ligne par période, une colonne par camion, total par période et général. */
export type CostPivot = {
  trucks: { id: string; matricule: string }[];
  rows: { period: string; byTruck: Record<string, number>; total: number; liters: number; fills: number }[];
  totalByTruck: Record<string, number>;
  total: number;
  liters: number;
  fills: number;
};

export function costPivot(rows: FuelSummaryRow[]): CostPivot {
  const trucks = new Map<string, string>();
  const periods = new Map<string, CostPivot["rows"][number]>();
  const totalByTruck: Record<string, number> = {};
  for (const r of rows) {
    trucks.set(r.truck_id, r.truck?.matricule ?? "?");
    const p = periods.get(r.period_start) ?? { period: r.period_start, byTruck: {}, total: 0, liters: 0, fills: 0 };
    p.byTruck[r.truck_id] = (p.byTruck[r.truck_id] ?? 0) + r.cost;
    p.total += r.cost;
    p.liters += r.liters;
    p.fills += r.fills;
    periods.set(r.period_start, p);
    totalByTruck[r.truck_id] = (totalByTruck[r.truck_id] ?? 0) + r.cost;
  }
  const list = Array.from(periods.values()).sort((a, b) => b.period.localeCompare(a.period));
  return {
    trucks: Array.from(trucks, ([id, matricule]) => ({ id, matricule })).sort((a, b) => a.matricule.localeCompare(b.matricule)),
    rows: list,
    totalByTruck,
    total: list.reduce((s, r) => s + r.total, 0),
    liters: list.reduce((s, r) => s + r.liters, 0),
    fills: list.reduce((s, r) => s + r.fills, 0),
  };
}
