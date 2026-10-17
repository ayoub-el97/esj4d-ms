import "server-only";
import { createClient } from "@/lib/supabase/server";
import { employeeName, getEmployees, getTrucks, type Employee, type Truck } from "@/lib/data/employees";
import { getPhotosFor } from "@/lib/data/photos";
import type { PhotoItem } from "@/lib/photo-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type CleaningReport = { id: string; activity_date: string; observations: string; created_at: string; updated_at: string };
export type CleaningAgent = {
  id: string;
  report_id: string;
  activity_date: string;
  employee_id: string;
  location: string;
  comment: string;
  sort_order: number;
  name: string;
  order_number: number;
  photosAvant: PhotoItem[];
  photosApres: PhotoItem[];
};

export type CollectionReport = {
  id: string;
  activity_date: string;
  truck_id: string;
  chauffeur_id: string | null;
  sectors: string;
  observations: string;
  updated_at: string;
};

export type TruckDailyReport = {
  id: string;
  activity_date: string;
  truck_id: string;
  chauffeur_id: string | null;
  ticket1: string;
  tonnage1: number | null;
  ticket2: string;
  tonnage2: number | null;
  dumps_count: number;
  rippers_count: number;
  km: number | null;
  fuel: number | null;
  observations: string;
  updated_at: string;
};

export type CleaningSummaryRow = {
  id: string;
  activity_date: string;
  zone: string;
  planned_headcount: number;
  work_duration: string;
  active_count: number;
  sick_count: number;
  paid_leave_count: number;
  absent_count: number;
  holiday_count: number;
  rest_count: number;
  total_count: number;
  sort_order: number;
};

// ---------------------------------------------------------------------------
// Nettoiement
// ---------------------------------------------------------------------------
export async function getCleaningReport(date: string): Promise<{ report: CleaningReport | null; agents: CleaningAgent[] }> {
  const supabase = await createClient();
  const { data: report } = await supabase.from("cleaning_reports").select("*").eq("activity_date", date).maybeSingle<CleaningReport>();
  if (!report) return { report: null, agents: [] };

  const [{ data: agents }, employees] = await Promise.all([
    supabase.from("cleaning_report_agents").select("*").eq("report_id", report.id).eq("excluded", false).order("sort_order").order("created_at"),
    getEmployees(),
  ]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const list = agents ?? [];
  const photos = await getPhotosFor("cleaning_report_agent", list.map((a) => a.id));

  return {
    report,
    agents: list.map((a) => {
      const e = byId.get(a.employee_id);
      const ph = photos.get(a.id) ?? [];
      return {
        ...a,
        name: e ? employeeName(e) : "?",
        order_number: e?.order_number ?? 0,
        photosAvant: ph.filter((p) => p.phase === "avant"),
        photosApres: ph.filter((p) => p.phase === "apres"),
      };
    }),
  };
}

export async function getCleaningReportDates(limit = 60): Promise<{ activity_date: string; agents: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("cleaning_reports").select("id, activity_date").order("activity_date", { ascending: false }).limit(limit);
  const reports = data ?? [];
  if (!reports.length) return [];
  const { data: agents } = await supabase.from("cleaning_report_agents").select("report_id").in("report_id", reports.map((r) => r.id));
  const counts = new Map<string, number>();
  for (const a of agents ?? []) counts.set(a.report_id, (counts.get(a.report_id) ?? 0) + 1);
  return reports.map((r) => ({ activity_date: r.activity_date, agents: counts.get(r.id) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Collecte
// ---------------------------------------------------------------------------
export type CollectionReportFull = CollectionReport & {
  truck: Truck | null;
  chauffeur: Employee | null;
  rippers: Employee[];
  truckReport: TruckDailyReport | null;
  photosAvant: PhotoItem[];
  photosApres: PhotoItem[];
};

export async function getCollectionReports(filters: { date?: string; from?: string; to?: string; truck?: string }, limit = 200): Promise<CollectionReportFull[]> {
  const supabase = await createClient();
  let q = supabase.from("collection_reports").select("*").order("activity_date", { ascending: false }).limit(limit);
  if (filters.date) q = q.eq("activity_date", filters.date);
  if (filters.from) q = q.gte("activity_date", filters.from);
  if (filters.to) q = q.lte("activity_date", filters.to);
  if (filters.truck) q = q.eq("truck_id", filters.truck);
  const [{ data }, employees, trucks] = await Promise.all([q.returns<CollectionReport[]>(), getEmployees(), getTrucks()]);
  const reports = data ?? [];
  if (!reports.length) return [];
  const ids = reports.map((r) => r.id);
  const [{ data: rippers }, { data: truckReports }, photos] = await Promise.all([
    supabase.from("collection_report_rippers").select("report_id, employee_id").in("report_id", ids),
    supabase.from("truck_daily_reports").select("*").in("activity_date", Array.from(new Set(reports.map((r) => r.activity_date)))).returns<TruckDailyReport[]>(),
    getPhotosFor("collection_report", ids),
  ]);
  const empById = new Map(employees.map((e) => [e.id, e]));
  const truckById = new Map(trucks.map((t) => [t.id, t]));
  return reports.map((r) => {
    const ph = photos.get(r.id) ?? [];
    return {
      ...r,
      truck: truckById.get(r.truck_id) ?? null,
      chauffeur: r.chauffeur_id ? (empById.get(r.chauffeur_id) ?? null) : null,
      rippers: (rippers ?? []).filter((x) => x.report_id === r.id).map((x) => empById.get(x.employee_id)).filter((e): e is Employee => !!e),
      truckReport: (truckReports ?? []).find((t) => t.activity_date === r.activity_date && t.truck_id === r.truck_id) ?? null,
      photosAvant: ph.filter((p) => p.phase === "avant"),
      photosApres: ph.filter((p) => p.phase === "apres"),
    };
  });
}

export async function getCollectionReport(id: string): Promise<CollectionReportFull | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("collection_reports").select("activity_date, truck_id").eq("id", id).maybeSingle();
  if (!data) return null;
  const list = await getCollectionReports({ date: data.activity_date, truck: data.truck_id }, 1);
  return list[0] ?? null;
}

// ---------------------------------------------------------------------------
// Rapport camions
// ---------------------------------------------------------------------------
export type TruckReportRow = TruckDailyReport & { truck: Truck | null; chauffeur_name: string; report_id: string | null; crew: string[] };

export async function getTruckReports(filters: { date?: string; from?: string; to?: string; truck?: string }, limit = 500): Promise<TruckReportRow[]> {
  const supabase = await createClient();
  let q = supabase.from("truck_daily_reports").select("*").order("activity_date", { ascending: false }).limit(limit);
  if (filters.date) q = q.eq("activity_date", filters.date);
  if (filters.from) q = q.gte("activity_date", filters.from);
  if (filters.to) q = q.lte("activity_date", filters.to);
  if (filters.truck) q = q.eq("truck_id", filters.truck);
  const [{ data }, employees, trucks] = await Promise.all([q.returns<TruckDailyReport[]>(), getEmployees(), getTrucks()]);
  const rows = data ?? [];
  const empById = new Map(employees.map((e) => [e.id, e]));
  const truckById = new Map(trucks.map((t) => [t.id, t]));

  // Rapport collecte du même jour et du même camion : lien + noms de l'équipe (rippeurs)
  let links = new Map<string, string>();
  const crewByReport = new Map<string, string[]>();
  if (rows.length) {
    const { data: reports } = await supabase
      .from("collection_reports")
      .select("id, activity_date, truck_id")
      .in("activity_date", Array.from(new Set(rows.map((r) => r.activity_date))));
    links = new Map((reports ?? []).map((r) => [`${r.activity_date}:${r.truck_id}`, r.id]));
    const ids = (reports ?? []).map((r) => r.id);
    if (ids.length) {
      const { data: rippers } = await supabase.from("collection_report_rippers").select("report_id, employee_id").in("report_id", ids);
      for (const x of rippers ?? []) {
        const e = empById.get(x.employee_id);
        if (e) crewByReport.set(x.report_id, [...(crewByReport.get(x.report_id) ?? []), employeeName(e)]);
      }
    }
  }

  return rows
    .map((r) => {
      const c = r.chauffeur_id ? empById.get(r.chauffeur_id) : null;
      const reportId = links.get(`${r.activity_date}:${r.truck_id}`) ?? null;
      return { ...r, truck: truckById.get(r.truck_id) ?? null, chauffeur_name: c ? employeeName(c) : "", report_id: reportId, crew: reportId ? (crewByReport.get(reportId) ?? []) : [] };
    })
    .sort((a, b) => (a.activity_date === b.activity_date ? (a.truck?.matricule ?? "").localeCompare(b.truck?.matricule ?? "") : 0));
}

export async function getTruckMonthly(month: string) {
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const rows = await getTruckReports({ from, to }, 2000);
  const byTruck = new Map<string, { truck: Truck | null; days: number; tonnage: number; dumps: number; rippers: number; km: number; fuel: number; tickets: number }>();
  for (const r of rows) {
    const agg = byTruck.get(r.truck_id) ?? { truck: r.truck, days: 0, tonnage: 0, dumps: 0, rippers: 0, km: 0, fuel: 0, tickets: 0 };
    agg.days += 1;
    agg.tonnage += Number(r.tonnage1 ?? 0) + Number(r.tonnage2 ?? 0);
    agg.dumps += r.dumps_count;
    agg.rippers += r.rippers_count;
    agg.km += Number(r.km ?? 0);
    agg.tickets += (r.ticket1 ? 1 : 0) + (r.ticket2 ? 1 : 0);
    byTruck.set(r.truck_id, agg);
  }
  // Carburant : somme des pleins du mois (partie 2 du rapport camions)
  const supabase = await createClient();
  const [{ data: fills }, trucks] = await Promise.all([supabase.from("fuel_entries").select("truck_id, liters").gte("activity_date", from).lte("activity_date", to), getTrucks()]);
  for (const f of fills ?? []) {
    const agg = byTruck.get(f.truck_id) ?? { truck: trucks.find((t) => t.id === f.truck_id) ?? null, days: 0, tonnage: 0, dumps: 0, rippers: 0, km: 0, fuel: 0, tickets: 0 };
    agg.fuel += Number(f.liters);
    byTruck.set(f.truck_id, agg);
  }
  return Array.from(byTruck.values()).sort((a, b) => (a.truck?.matricule ?? "").localeCompare(b.truck?.matricule ?? ""));
}

// ---------------------------------------------------------------------------
// Récapitulatif nettoiement (rapport global)
// ---------------------------------------------------------------------------
export async function getCleaningSummary(date: string): Promise<CleaningSummaryRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("cleaning_daily_summary").select("*").eq("activity_date", date).order("sort_order").order("created_at").returns<CleaningSummaryRow[]>();
  return data ?? [];
}
