import "server-only";
import { employeeName } from "@/lib/data/employees";
import { getCleaningReport, getCollectionReports, getTruckReports } from "@/lib/data/reports";

export type CombinedShift = { shift: "matin" | "soir" | null; chauffeur: string; crew: string[] };
export type CombinedTruck = { key: string; type: string; number: string; matricule: string; shifts: CombinedShift[]; locations: string };
export type CombinedReport = {
  date: string;
  /** null : aucun rapport de nettoiement enregistré pour cette date */
  cleaning: { name: string; location: string }[] | null;
  /** null : aucun rapport de collecte ni ligne camion enregistrés pour cette date */
  trucks: CombinedTruck[] | null;
};

/**
 * Rapport Collecte / Nettoiement : lecture seule des rapports enregistrés pour cette date
 * (rapport journalier Nettoiement, rapport de Collecte, équipes des lignes camion). Aucune donnée
 * propre, aucune reprise de la fiche actuelle des employés : un rapport absent reste absent.
 */
export async function getCombinedReport(date: string): Promise<CombinedReport> {
  const [{ report, agents }, reports, lines] = await Promise.all([getCleaningReport(date), getCollectionReports({ date }, 500), getTruckReports({ date }, 500)]);

  const byTruck = new Map<string, CombinedTruck>();
  const entry = (id: string, tr: { truck_type?: string; internal_number?: string; matricule?: string } | null) => {
    const cur = byTruck.get(id);
    if (cur) return cur;
    const created: CombinedTruck = { key: id, type: tr?.truck_type?.trim() || "BOM", number: tr?.internal_number?.trim() || tr?.matricule || "—", matricule: tr?.matricule ?? "", shifts: [], locations: "" };
    byTruck.set(id, created);
    return created;
  };

  for (const r of reports) {
    const c = entry(r.truck_id, r.truck);
    c.locations = r.sectors.trim();
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
    cleaning: report ? agents.map((a) => ({ name: a.name, location: a.location.trim() })) : null,
    trucks: trucks.length ? trucks : null,
  };
}
