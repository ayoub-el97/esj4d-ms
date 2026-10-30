import "server-only";
import { employeeName } from "@/lib/data/employees";
import { getDailyReportsSummary } from "@/lib/data/history";
import { getCleaningReport, getCollectionReports, getTruckReports } from "@/lib/data/reports";
import { createClient } from "@/lib/supabase/server";

export type CombinedShift = { shift: "matin" | "soir" | null; chauffeur: string; crew: string[] };
export type CombinedTruck = {
  key: string;
  /** Rapport de collecte de ce camion (null : camion présent seulement dans le rapport camions) */
  reportId: string | null;
  type: string;
  number: string;
  matricule: string;
  shifts: CombinedShift[];
  /** Texte saisi dans le rapport de collecte */
  locations: string;
  /** Le même texte, un lieu par entrée (affichage vertical) */
  locationList: string[];
};
export type CombinedReport = {
  date: string;
  /** null : aucun rapport de nettoiement enregistré pour cette date */
  cleaning: { id: string; name: string; location: string }[] | null;
  /** null : aucun rapport de collecte ni ligne camion enregistrés pour cette date */
  trucks: CombinedTruck[] | null;
};

const splitLocations = (text: string) =>
  text
    .split(/[\n;,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Lieux de travail des agents : lecture des rapports enregistrés pour cette date (rapport journalier
 * Nettoiement, rapport de Collecte, équipes des lignes camion). Aucune donnée propre, aucune reprise
 * de la fiche actuelle des employés : un rapport absent reste absent, une correction de la source
 * apparaît aussitôt ici.
 */
export async function getCombinedReport(date: string): Promise<CombinedReport> {
  const [{ report, agents }, reports, lines] = await Promise.all([getCleaningReport(date), getCollectionReports({ date }, 500), getTruckReports({ date }, 500)]);

  const byTruck = new Map<string, CombinedTruck>();
  const entry = (id: string, tr: { truck_type?: string; internal_number?: string; matricule?: string } | null) => {
    const cur = byTruck.get(id);
    if (cur) return cur;
    const created: CombinedTruck = { key: id, reportId: null, type: tr?.truck_type?.trim() || "BOM", number: tr?.internal_number?.trim() || tr?.matricule || "—", matricule: tr?.matricule ?? "", shifts: [], locations: "", locationList: [] };
    byTruck.set(id, created);
    return created;
  };

  for (const r of reports) {
    const c = entry(r.truck_id, r.truck);
    c.reportId = r.id;
    c.locations = r.sectors.trim();
    c.locationList = splitLocations(r.sectors);
    c.shifts.push({ shift: "matin", chauffeur: r.chauffeur ? employeeName(r.chauffeur) : "", crew: r.rippers.map((e) => employeeName(e)) });
  }
  for (const l of lines) {
    const named = !!l.chauffeur_name || l.crew.length > 0;
    if (l.shift === "matin") {
      // Équipe du Matin corrigée dans le rapport camions : c'est elle qui a travaillé
      const manual = (l as unknown as { crew_manual?: boolean }).crew_manual;
      const c = byTruck.get(l.truck_id);
      if (c && manual && l.line_no === 1) c.shifts[0] = { shift: "matin", chauffeur: l.chauffeur_name, crew: l.crew };
      else if (!c && named) entry(l.truck_id, l.truck).shifts.push({ shift: "matin", chauffeur: l.chauffeur_name, crew: l.crew });
    } else if (named) {
      entry(l.truck_id, l.truck).shifts.push({ shift: "soir", chauffeur: l.chauffeur_name, crew: l.crew });
    }
  }
  const trucks = [...byTruck.values()]
    .map((c) => ({ ...c, shifts: c.shifts.length === 1 && c.shifts[0].shift === "matin" ? [{ ...c.shifts[0], shift: null }] : c.shifts }))
    .sort((a, b) => a.number.localeCompare(b.number, "fr", { numeric: true }));

  return {
    date,
    cleaning: report ? agents.map((a) => ({ id: a.id, name: a.name, location: a.location.trim() })) : null,
    trucks: trucks.length ? trucks : null,
  };
}

export type WorkLocationDate = { activity_date: string; agents: number; trucks: number };

/** Dates ayant de quoi remplir le rapport (employés au nettoiement, camions avec chauffeur ou équipe), du plus récent au plus ancien. */
export async function getWorkLocationDates(from: string, to: string): Promise<WorkLocationDate[]> {
  const summary = await getDailyReportsSummary(from, to);
  // Date sans rapport de collecte : seules les lignes camion nommées comptent
  const linesOnly = summary.filter((r) => !r.collection_count && r.truck_lines).map((r) => r.activity_date);
  const named = new Map<string, Set<string>>();
  if (linesOnly.length) {
    const supabase = await createClient();
    const { data } = await supabase.from("truck_daily_reports").select("activity_date, truck_id, chauffeur_id, crew:truck_report_crew(employee_id)").in("activity_date", linesOnly);
    for (const l of (data ?? []) as unknown as { activity_date: string; truck_id: string; chauffeur_id: string | null; crew: unknown[] }[]) {
      if (!l.chauffeur_id && !l.crew?.length) continue;
      named.set(l.activity_date, (named.get(l.activity_date) ?? new Set()).add(l.truck_id));
    }
  }
  return summary
    .map((r) => ({ activity_date: r.activity_date, agents: r.cleaning_agents, trucks: r.collection_count || (named.get(r.activity_date)?.size ?? 0) }))
    .filter((r) => r.agents > 0 || r.trucks > 0);
}
