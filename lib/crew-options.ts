// Équipiers proposés dans un rapport de collecte — module pur (testable).
// Source : la feuille de présence Collecte du jour, telle qu'elle s'affiche dans le pointage
// (lignes enregistrées, lignes par défaut et affectations temporaires du jour).

const DRIVING = ["chauffeur", "chauffeur_remplacant"];
const WORKED = ["present", "repos_travaille"];

export type CrewSourceRow = { employee_id: string; shift: number; position: string; usual_position?: string | null; status: string; id: string | null };
export type CrewOption = { employee_id: string; day_position: string; status: string; worked: boolean; saved: boolean };

/**
 * Tous les employés de la feuille Collecte (sans limite de nombre), quelle que soit leur fonction
 * habituelle (ex. balayeur affecté à la Collecte) ; chauffeurs (champ séparé) et Gardiens exclus.
 * Une ligne par employé (1er service), employés au travail d'abord, ordre de la feuille conservé.
 */
export function crewOptionsFromSheet(rows: CrewSourceRow[]): CrewOption[] {
  const seen = new Map<string, CrewOption>();
  for (const r of [...rows].sort((a, b) => a.shift - b.shift)) {
    if (seen.has(r.employee_id)) continue;
    if (DRIVING.includes(r.position) || r.position === "gardien" || r.usual_position === "gardien") {
      seen.set(r.employee_id, null as unknown as CrewOption); // employé exclu (une seule décision par employé)
      continue;
    }
    seen.set(r.employee_id, { employee_id: r.employee_id, day_position: r.position, status: r.status, worked: WORKED.includes(r.status), saved: r.id !== null });
  }
  const list = [...seen.values()].filter(Boolean);
  return [...list.filter((o) => o.worked), ...list.filter((o) => !o.worked)];
}
