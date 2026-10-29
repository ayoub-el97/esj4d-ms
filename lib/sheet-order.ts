// Ordre d'affichage des feuilles de pointage (écran et PDF) — module pur.
import type { SheetRow } from "@/lib/attendance-types";
import { COLLECTE_STAFF_GROUPS, isSubstitutePosition } from "@/lib/types";

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
export const COLLECTE_CATEGORY = ["chauffeur", "rippeur", "chauffeur_remplacant", "rippeur_remplacant", "chef_equipe", "superviseur", "agent_securite", "directeur", "responsable", "secretaire"];
export function categoryOf(position: string): "collecte" | "balayeurs" | "autres" {
  if (position === "balayeur") return "balayeurs";
  return COLLECTE_CATEGORY.includes(position) ? "collecte" : "autres";
}

export type CollecteGroup =
  | { key: string; kind: "staff"; position: string; title: string; idx: number[] }
  | { key: string; kind: "team"; chauffeurId: string; idx: number[] }
  | { key: string; kind: "subs"; idx: number[] }
  | { key: string; kind: "none"; idx: number[] };

type CRow = Pick<SheetRow, "employee_id" | "position" | "chauffeur_id" | "shift">;

/**
 * Feuille Collecte (écran et PDF), de haut en bas :
 *  1. direction, responsable, secrétariat, chef d'équipe, superviseur ;
 *  2. équipes de camion (chauffeur + équipiers), remplaçants libres, équipiers sans équipe ;
 *  3. gardiens ;
 *  4. autres fonctions (sécurité, mécanicien, autres).
 * Chaque ligne n'apparaît qu'une fois (un groupe déjà attribué n'est pas repris).
 */
export function collecteGroups(rows: CRow[]): CollecteGroup[] {
  const used = new Set<number>();
  const all = rows.map((_, i) => i);
  const take = (pred: (r: CRow) => boolean) => {
    const idx = all.filter((i) => !used.has(i) && pred(rows[i]));
    idx.forEach((i) => used.add(i));
    return idx;
  };
  const staff = (placement: "top" | "guard" | "after") =>
    COLLECTE_STAFF_GROUPS.filter((g) => g.placement === placement)
      .map((g) => ({ key: g.position, kind: "staff" as const, position: g.position, title: g.title, idx: take((r) => r.position === g.position) }))
      .filter((g) => g.idx.length);
  const out: CollecteGroup[] = [...staff("top")];
  // Les gardiens et autres fonctions sont réservés avant les équipes (affichés plus bas)
  const guard = staff("guard");
  const after = staff("after");
  for (const c of rows.filter((r) => r.position === "chauffeur" && r.shift === 1)) {
    // Chauffeur en premier, puis ses équipiers (ordre de la feuille)
    const idx = take((r) => r.employee_id === c.employee_id || r.chauffeur_id === c.employee_id).sort((x, y) => Number(rows[y].employee_id === c.employee_id) - Number(rows[x].employee_id === c.employee_id) || x - y);
    if (idx.length) out.push({ key: c.employee_id, kind: "team", chauffeurId: c.employee_id, idx });
  }
  const subs = take((r) => isSubstitutePosition(r.position));
  if (subs.length) out.push({ key: "subs", kind: "subs", idx: subs });
  const none = take(() => true);
  if (none.length) out.push({ key: "none", kind: "none", idx: none });
  return [...out, ...guard, ...after];
}
