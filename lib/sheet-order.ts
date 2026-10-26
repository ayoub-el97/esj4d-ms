// Ordre d'affichage des feuilles de pointage (écran et PDF) — module pur.
import type { SheetRow } from "@/lib/attendance-types";

/** Ordre des groupes de balayeurs : repos dimanche → samedi, puis repos non défini. */
export const REST_DAY_ORDER: (number | null)[] = [0, 1, 2, 3, 4, 5, 6, null];

export type CleaningGroup = { key: string; restDay: number | null | "autres"; idx: number[]; employees: number };

type Row = Pick<SheetRow, "employee_id" | "position" | "rest_day" | "name" | "shift">;

const byName = (rows: Row[]) => (a: number, b: number) => rows[a].name.localeCompare(rows[b].name, "fr", { sensitivity: "base" }) || rows[a].shift - rows[b].shift;
const distinct = (rows: Row[], idx: number[]) => new Set(idx.map((i) => rows[i].employee_id)).size;

/**
 * Feuille Nettoiement : balayeurs (fonction du jour) groupés par jour de repos habituel
 * (fiche employé), triés par nom ; les autres fonctions ensuite, dans l'ordre existant.
 */
export function cleaningGroups(rows: Row[]): CleaningGroup[] {
  const all = rows.map((_, i) => i);
  const groups: CleaningGroup[] = [];
  for (const day of REST_DAY_ORDER) {
    const idx = all.filter((i) => rows[i].position === "balayeur" && (rows[i].rest_day ?? null) === day).sort(byName(rows));
    if (idx.length) groups.push({ key: `repos-${day ?? "aucun"}`, restDay: day, idx, employees: distinct(rows, idx) });
  }
  const others = all.filter((i) => rows[i].position !== "balayeur");
  if (others.length) groups.push({ key: "autres", restDay: "autres", idx: others, employees: distinct(rows, others) });
  return groups;
}

/** Numéros d'affichage 1, 2, 3… dans l'ordre de la liste (un numéro par employé, sur sa première ligne). */
export function displayNumbers(rows: Pick<SheetRow, "employee_id">[], orderedIdx: number[]): Map<number, number> {
  const byEmployee = new Map<string, number>();
  const out = new Map<number, number>();
  for (const i of orderedIdx) {
    const id = rows[i].employee_id;
    if (byEmployee.has(id)) continue;
    byEmployee.set(id, byEmployee.size + 1);
    out.set(i, byEmployee.size);
  }
  return out;
}

/** Catégories pour les effectifs : collecte, balayeurs, autres fonctions. */
export const COLLECTE_CATEGORY = ["chauffeur", "rippeur", "chauffeur_remplacant", "rippeur_remplacant", "chef_equipe", "superviseur", "agent_securite"];
export function categoryOf(position: string): "collecte" | "balayeurs" | "autres" {
  if (position === "balayeur") return "balayeurs";
  return COLLECTE_CATEGORY.includes(position) ? "collecte" : "autres";
}
