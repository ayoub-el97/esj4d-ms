import "server-only";
import type { Position } from "@/lib/types";
import { getProjectStart } from "@/lib/data/settings";
import { workMonthRange } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { employeeName, getEmployees, getTrucks, type Employee, type Truck } from "@/lib/data/employees";
import { getPhotosFor } from "@/lib/data/photos";
import type { PhotoItem } from "@/lib/photo-types";
import { collectionMissing, collectionStatus, type CollectionStatus } from "@/lib/collection-status";

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
  /** Camion, chauffeur ou équipe corrigés dans le rapport : la mise à jour depuis le pointage ne les écrase plus */
  manual_team: boolean;
  created_at: string;
  updated_at: string;
};

export type TruckShift = "matin" | "soir";
export const SHIFT_LABELS: Record<TruckShift, string> = { matin: "Matin", soir: "Soir" };

export type TruckDailyReport = {
  id: string;
  activity_date: string;
  truck_id: string;
  /** Poste : Matin ou Soir ; plusieurs lignes possibles par poste (line_no) */
  shift: TruckShift;
  line_no: number;
  /** Vidages : un élément par vidage (n° de ticket + tonnage) */
  loads: { ticket: string; tonnage: number | null }[];
  /** Somme des tonnages > 0 (calculée par la base) */
  tonnage_total: number;
  /** Nombre de vidages corrigé à la main (administrateur) */
  dumps_override: boolean;
  chauffeur_id: string | null;
  ticket1: string;
  tonnage1: number | null;
  ticket2: string;
  tonnage2: number | null;
  dumps_count: number;
  rippers_count: number;
  km: number | null;
  /** Kilométrage au départ et à la fin de la journée ; km = fin − départ (calculé par la base) */
  km_start: number | null;
  km_end: number | null;
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

export async function getCleaningReportDates(limit = 60): Promise<{ activity_date: string; agents: number; photos_avant: number; photos_apres: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("cleaning_reports").select("id, activity_date").order("activity_date", { ascending: false }).limit(limit);
  const reports = data ?? [];
  if (!reports.length) return [];
  const [{ data: agents }, { data: photos }] = await Promise.all([
    supabase.from("cleaning_report_agents").select("report_id").in("report_id", reports.map((r) => r.id)),
    supabase.from("photos").select("activity_date, phase").eq("entity_type", "cleaning_report_agent").in("activity_date", reports.map((r) => r.activity_date)),
  ]);
  const counts = new Map<string, number>();
  for (const a of agents ?? []) counts.set(a.report_id, (counts.get(a.report_id) ?? 0) + 1);
  const ph = new Map<string, { avant: number; apres: number }>();
  for (const p of photos ?? []) {
    const c = ph.get(p.activity_date) ?? { avant: 0, apres: 0 };
    if (p.phase === "avant") c.avant++;
    else if (p.phase === "apres") c.apres++;
    ph.set(p.activity_date, c);
  }
  return reports.map((r) => ({ activity_date: r.activity_date, agents: counts.get(r.id) ?? 0, photos_avant: ph.get(r.activity_date)?.avant ?? 0, photos_apres: ph.get(r.activity_date)?.apres ?? 0 }));
}

// ---------------------------------------------------------------------------
// Collecte
// ---------------------------------------------------------------------------
export type CollectionReportFull = CollectionReport & {
  truck: Truck | null;
  chauffeur: Employee | null;
  /** Équipiers ; day_position = fonction du jour au pointage (si différente de la fiche) */
  rippers: (Employee & { day_position?: Position | null })[];
  truckReport: TruckDailyReport | null;
  photosAvant: PhotoItem[];
  photosApres: PhotoItem[];
  /** Journée clôturée : rapport en lecture seule */
  day_closed: boolean;
  status: CollectionStatus;
  /** Éléments manquants (clés de traduction) */
  missing: string[];
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
  const dates = Array.from(new Set(reports.map((r) => r.activity_date)));
  const [{ data: rippers }, { data: truckReports }, photos, { data: days }, { data: dayAtt }] = await Promise.all([
    supabase.from("collection_report_rippers").select("report_id, employee_id").in("report_id", ids),
    supabase.from("truck_daily_reports").select("*").in("activity_date", Array.from(new Set(reports.map((r) => r.activity_date)))).returns<TruckDailyReport[]>(),
    getPhotosFor("collection_report", ids),
    supabase.from("work_days").select("activity_date, status").in("activity_date", dates),
    // Fonction du jour (pointage collecte, 1er service) : affichée quand elle diffère de la fonction habituelle
    supabase.from("attendance").select("activity_date, employee_id, position").in("activity_date", dates).eq("team_type", "collecte").eq("shift", 1),
  ]);
  const closed = new Set((days ?? []).filter((d) => d.status === "closed").map((d) => d.activity_date));
  const dayPos = new Map((dayAtt ?? []).map((a) => [`${a.activity_date}|${a.employee_id}`, a.position as Position]));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const truckById = new Map(trucks.map((t) => [t.id, t]));
  return reports.map((r) => {
    const ph = photos.get(r.id) ?? [];
    const before = ph.filter((p) => p.phase === "avant").length;
    const after = ph.filter((p) => p.phase === "apres").length;
    const day_closed = closed.has(r.activity_date);
    return {
      day_closed,
      status: collectionStatus({ sectors: r.sectors, before, after, dayClosed: day_closed }),
      missing: collectionMissing({ sectors: r.sectors, before, after }),
      ...r,
      truck: truckById.get(r.truck_id) ?? null,
      chauffeur: r.chauffeur_id ? (empById.get(r.chauffeur_id) ?? null) : null,
      rippers: (rippers ?? [])
        .filter((x) => x.report_id === r.id)
        .map((x) => {
          const e = empById.get(x.employee_id);
          return e ? { ...e, day_position: dayPos.get(`${r.activity_date}|${e.id}`) ?? null } : null;
        })
        .filter((e): e is Employee & { day_position: Position | null } => !!e),
      truckReport: (truckReports ?? []).find((t) => t.activity_date === r.activity_date && t.truck_id === r.truck_id && t.shift === "matin" && t.line_no === 1) ?? null,
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
export type TruckReportRow = TruckDailyReport & { truck: Truck | null; chauffeur_name: string; report_id: string | null; crew: string[]; photos: PhotoItem[] };

export async function getTruckReports(filters: { date?: string; from?: string; to?: string; truck?: string }, limit = 500): Promise<TruckReportRow[]> {
  const supabase = await createClient();
  let q = supabase.from("truck_daily_reports").select("*").order("activity_date", { ascending: false }).limit(limit);
  if (filters.date) q = q.eq("activity_date", filters.date);
  if (filters.from) q = q.gte("activity_date", filters.from);
  if (filters.to) q = q.lte("activity_date", filters.to);
  if (filters.truck) q = q.eq("truck_id", filters.truck);
  const [{ data }, employees, trucks] = await Promise.all([q.returns<TruckDailyReport[]>(), getEmployees(), getTrucks()]);
  const rows = (data ?? []).map((r) => ({ ...r, tonnage_total: Number(r.tonnage_total ?? 0), loads: (r.loads ?? []).map((l) => ({ ticket: l.ticket ?? "", tonnage: l.tonnage == null ? null : Number(l.tonnage) })) }));
  const photosByLine = await getPhotosFor("truck_report", rows.map((r) => r.id));
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
      return { ...r, truck: truckById.get(r.truck_id) ?? null, chauffeur_name: c ? employeeName(c) : "", report_id: reportId, crew: reportId ? (crewByReport.get(reportId) ?? []) : [], photos: photosByLine.get(r.id) ?? [] };
    })
    // Jour (récent d'abord), camion, Matin avant Soir, n° de ligne
    .sort(
      (a, b) =>
        b.activity_date.localeCompare(a.activity_date) ||
        (a.truck?.matricule ?? "").localeCompare(b.truck?.matricule ?? "") ||
        (a.shift === b.shift ? 0 : a.shift === "matin" ? -1 : 1) ||
        a.line_no - b.line_no,
    );
}

export async function getTruckMonthly(month: string) {
  const { from, to } = workMonthRange(month, await getProjectStart());
  const rows = await getTruckReports({ from, to }, 2000);
  type Agg = { truck: Truck | null; days: number; tonnage: number; tonnage_matin: number; tonnage_soir: number; dumps: number; rippers: number; km: number; fuel: number; tickets: number; dates: Set<string> };
  const empty = (truck: Truck | null): Agg => ({ truck, days: 0, tonnage: 0, tonnage_matin: 0, tonnage_soir: 0, dumps: 0, rippers: 0, km: 0, fuel: 0, tickets: 0, dates: new Set() });
  const byTruck = new Map<string, Agg>();
  // Chaque ligne (Matin ou Soir) est comptée une fois ; un jour avec deux postes = 1 jour
  for (const r of rows) {
    const agg = byTruck.get(r.truck_id) ?? empty(r.truck);
    agg.dates.add(r.activity_date);
    agg.tonnage += r.tonnage_total;
    if (r.shift === "soir") agg.tonnage_soir += r.tonnage_total;
    else agg.tonnage_matin += r.tonnage_total;
    agg.dumps += r.dumps_count;
    agg.rippers += r.rippers_count;
    agg.km += Number(r.km ?? 0);
    agg.tickets += r.loads.filter((l) => l.ticket).length;
    byTruck.set(r.truck_id, agg);
  }
  for (const agg of byTruck.values()) agg.days = agg.dates.size;
  // Carburant : somme des pleins du mois (partie 2 du rapport camions)
  const supabase = await createClient();
  const [{ data: fills }, trucks] = await Promise.all([supabase.from("fuel_entries").select("truck_id, liters").gte("activity_date", from).lte("activity_date", to), getTrucks()]);
  for (const f of fills ?? []) {
    const agg = byTruck.get(f.truck_id) ?? empty(trucks.find((t) => t.id === f.truck_id) ?? null);
    agg.fuel += Number(f.liters);
    byTruck.set(f.truck_id, agg);
  }
  return Array.from(byTruck.values())
    .map(({ dates: _dates, ...a }) => (void _dates, a))
    .sort((a, b) => (a.truck?.matricule ?? "").localeCompare(b.truck?.matricule ?? ""));
}

// ---------------------------------------------------------------------------
// Récapitulatif nettoiement (rapport global)
// ---------------------------------------------------------------------------
export async function getCleaningSummary(date: string): Promise<CleaningSummaryRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("cleaning_daily_summary").select("*").eq("activity_date", date).order("sort_order").order("created_at").returns<CleaningSummaryRow[]>();
  return data ?? [];
}
