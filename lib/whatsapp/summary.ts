import "server-only";
import { getCleaningReport, getCollectionReports, getTruckReports } from "@/lib/data/reports";
import { getRepairExpenseReport, getFleetOverview } from "@/lib/data/repairs";
import { getOvertimeGrid, getLiveGrid } from "@/lib/data/attendance-grid";
import { formatDateFr, isISODate, isMonth, todayISO } from "@/lib/dates";
import { formatAmount } from "@/lib/money";

const fmtNum = (n: number, d = 2) => n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: d });

/**
 * Lignes de résumé propres à chaque rapport, calculées depuis la base (mêmes fonctions que le PDF).
 * Aucune valeur n'est inventée : en cas d'erreur ou de donnée absente, la ligne est omise.
 */
export async function reportSummaryLines(kind: string, params: Record<string, string>): Promise<string[]> {
  try {
    switch (kind) {
      case "camions":
      case "rapport-global": {
        if (!isISODate(params.date)) return [];
        const rows = await getTruckReports({ date: params.date });
        if (!rows.length) return ["Aucune ligne camion enregistrée pour cette date."];
        const dumps = rows.reduce((s, r) => s + r.dumps_count, 0);
        const ton = rows.reduce((s, r) => s + r.tonnage_total, 0);
        const trucks = new Set(rows.map((r) => r.truck_id)).size;
        return [`Camions : ${trucks}`, `Nombre de vidages : ${dumps}`, `Tonnage total : ${fmtNum(ton)} tonnes`];
      }
      case "rapport-collecte": {
        if (!isISODate(params.date)) return [];
        let reports = await getCollectionReports({ date: params.date });
        if (params.id) reports = reports.filter((r) => r.id === params.id);
        const before = reports.reduce((s, r) => s + r.photosAvant.length, 0);
        const after = reports.reduce((s, r) => s + r.photosApres.length, 0);
        return [`Équipes de collecte : ${reports.length}`, `Photos : ${before} avant, ${after} après`];
      }
      case "rapport-nettoiement": {
        if (!isISODate(params.date)) return [];
        const { agents } = await getCleaningReport(params.date);
        return [`Agents de nettoiement : ${agents.length}`];
      }
      case "pointage-grille": {
        if (!isMonth(params.mois)) return [];
        const g = await getLiveGrid(params.mois);
        return [`Période : du ${formatDateFr(g.from)} au ${formatDateFr(g.to)}`, `Employés : ${g.rows.length}`];
      }
      case "pointage-hs": {
        if (!isMonth(params.mois)) return [];
        const g = await getOvertimeGrid(params.mois);
        return [`Période : du ${formatDateFr(g.from)} au ${formatDateFr(g.to)}`, `Total des heures supplémentaires : ${fmtNum(g.total)} h`];
      }
      case "reparations-depenses": {
        if (!isISODate(params.from) || !isISODate(params.to)) return [];
        const r = await getRepairExpenseReport(params.from, params.to, params.truck || undefined);
        return [`Période : du ${formatDateFr(params.from)} au ${formatDateFr(params.to)}`, `Réparations comptées : ${r.repairs}`, `Dépenses de réparation : ${formatAmount(r.total)} DH`];
      }
      case "flotte": {
        if (!isMonth(params.mois)) return [];
        const today = todayISO();
        const f = await getFleetOverview(today, today);
        const out = f.trucks.filter((t) => t.state !== "en_service");
        return [`Camions hors service : ${out.length}`, `Alertes rouges : ${f.trucks.filter((t) => t.alert === "rouge").length} · orange : ${f.trucks.filter((t) => t.alert === "orange").length}`];
      }
      default:
        return [];
    }
  } catch {
    return [];
  }
}

/** Message proposé (modifiable avant l'envoi). */
export function buildMessage(opts: { title: string; company: string; lines: string[]; defaultMessage: string; withPdf: boolean }): string {
  const end = opts.defaultMessage.trim() || (opts.withPdf ? "Veuillez trouver le rapport en pièce jointe." : "Le rapport est disponible dans l'application.");
  return [opts.title, opts.company ? `Entreprise : ${opts.company}` : "", ...opts.lines, end].filter(Boolean).join("\n");
}
