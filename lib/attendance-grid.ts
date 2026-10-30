import { compareMonthly } from "@/lib/monthly-order";
// Grille mensuelle de pointage (modèle Excel EST-4D) : codes, couleurs, période du 8 au 7,
// calcul des cellules et des totaux. Module pur, utilisable côté serveur, navigateur et PDF.
import type { AttendanceStatus, Position, TeamType } from "@/lib/types";

/** Codes de la grille ; RT = repos travaillé (statut du Pointage hors liste de référence). */
export type GridCode = "P" | "R" | "JF" | "JFT" | "AB" | "AM" | "RC" | "CP" | "RT";

export type GridCodeDef = {
  code: GridCode;
  /** Libellé français (clé de traduction) */
  label: string;
  bg: string;
  fg: string;
  /** Statut supplémentaire, hors liste de référence de la grille */
  extra?: boolean;
};

/** Codes et couleurs, dans l'ordre des totaux. */
export const GRID_CODES: GridCodeDef[] = [
  { code: "P", label: "Présent", bg: "#16a34a", fg: "#ffffff" },
  { code: "R", label: "Repos", bg: "#facc15", fg: "#422006" },
  { code: "JF", label: "Jour férié", bg: "#7e22ce", fg: "#ffffff" },
  { code: "JFT", label: "Jour férié travaillé", bg: "#374151", fg: "#ffffff" },
  { code: "AM", label: "Absent maladie", bg: "#bbf7d0", fg: "#14532d" },
  { code: "AB", label: "Absent", bg: "#dc2626", fg: "#ffffff" },
  { code: "RC", label: "Récupération", bg: "#f97316", fg: "#1c0a00" },
  { code: "CP", label: "Congé payé", bg: "#38bdf8", fg: "#082f49" },
  { code: "RT", label: "Jour de repos travaillé", bg: "#e0e7ff", fg: "#3730a3", extra: true },
];
export const STANDARD_CODES = GRID_CODES.filter((c) => !c.extra).map((c) => c.code);
export const CODE_DEF = Object.fromEntries(GRID_CODES.map((c) => [c.code, c])) as Record<GridCode, GridCodeDef>;

/** Initiales des jours (dimanche → samedi), comme dans le fichier Excel. */
export const WEEKDAY_INITIALS = ["D", "L", "M", "M", "J", "V", "S"];

/**
 * Code de la grille pour un statut du Pointage. Un jour férié travaillé (Présent ou Repos
 * travaillé à une date fériée) donne JFT. Statut inconnu : null (signalé, jamais converti).
 */
export function codeForStatus(status: string, isHoliday: boolean): GridCode | null {
  switch (status as AttendanceStatus) {
    case "present":
      return isHoliday ? "JFT" : "P";
    case "repos_travaille":
      return isHoliday ? "JFT" : "RT";
    case "repos":
      return "R";
    case "ferie":
      return "JF";
    case "absent":
      return "AB";
    case "absent_maladie":
      return "AM";
    case "recuperation":
      return "RC";
    case "conge":
      return "CP";
    default:
      return null;
  }
}

// ---------- Période (du jour de début d'un mois à la veille du même jour le mois suivant) ----------
const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Jour de début valide (1 à 28, pour exister dans tous les mois) ; 8 par défaut. */
export function normalizeStartDay(v: unknown): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 28 ? n : 8;
}

/** Période d'un mois (aaaa-mm) : septembre 2026, début 8 → du 2026-09-08 au 2026-10-07. */
export function attendancePeriod(month: string, startDay = 8): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const day = normalizeStartDay(startDay);
  const from = new Date(Date.UTC(y, m - 1, day));
  const to = new Date(Date.UTC(y, m, day - 1));
  return { from: toISO(from), to: toISO(to) };
}

/** Mois (aaaa-mm du début de période) contenant une date. */
export function periodMonthOf(iso: string, startDay = 8): string {
  const d = utc(iso);
  const day = normalizeStartDay(startDay);
  const start = d.getUTCDate() >= day ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)) : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return toISO(start).slice(0, 7);
}

/** Mois décalé de n mois (aaaa-mm). */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return toISO(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
}

/** Toutes les dates de la période, incluses, dans l'ordre. */
export function periodDates(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = utc(from); toISO(d) <= to; d = new Date(d.getTime() + 86400000)) out.push(toISO(d));
  return out;
}

export const weekdayOf = (iso: string) => utc(iso).getUTCDay();

// ---------- Grille ----------
export type GridEmployee = {
  id: string;
  order_number: number;
  matricule: string;
  last_name: string;
  first_name: string;
  position: Position;
  /** Libellé libre de la fonction (« autre fonction ») */
  job_title: string;
  team_type: TeamType;
  /** Fonction permanente (fiche) : ordre du rapport, sans effet sur la fonction affichée */
  usual_position?: Position;
};

export type GridCell = {
  /** Code affiché ; null si vide, conflit ou statut inconnu */
  code: GridCode | null;
  /** Statuts enregistrés (un par service) */
  statuses: string[];
  /** Plusieurs services avec le même statut (jour doublé) */
  double?: boolean;
  /** Statuts différents le même jour : à vérifier */
  conflict?: boolean;
  /** Statut sans code dans la grille */
  unknown?: boolean;
};

export type GridRow = GridEmployee & { cells: Record<string, GridCell>; totals: Record<string, number> };

export type GridIssue = { employee_id: string; name: string; date: string; statuses: string[]; kind: "conflit" | "inconnu" };

export type GridData = {
  month: string;
  from: string;
  to: string;
  dates: string[];
  holidays: Record<string, string>;
  rows: GridRow[];
  /** Totaux par date et par code */
  dayTotals: Record<string, Record<string, number>>;
  /** Totaux de la période par code */
  totals: Record<string, number>;
  issues: GridIssue[];
  /** Codes hors liste rencontrés (ex. RT) */
  extraCodes: GridCode[];
  generatedAt: string;
};

export type GridRecord = { employee_id: string; activity_date: string; status: string };

const emptyTotals = () => Object.fromEntries(GRID_CODES.map((c) => [c.code, 0])) as Record<string, number>;

/** Construit une cellule à partir des lignes de pointage d'un employé pour une date. */
export function buildCell(statuses: string[], isHoliday: boolean): GridCell {
  if (!statuses.length) return { code: null, statuses: [] };
  const codes = statuses.map((s) => codeForStatus(s, isHoliday));
  if (codes.some((c) => c === null)) return { code: null, statuses, unknown: true };
  const distinct = new Set(codes);
  if (distinct.size > 1) return { code: null, statuses, conflict: true };
  return { code: codes[0], statuses, ...(statuses.length > 1 ? { double: true } : {}) };
}

/** Recalcule les totaux (lignes, dates, période) : une cellule = au plus un code compté. */
export function computeTotals(grid: Omit<GridData, "dayTotals" | "totals" | "issues" | "extraCodes">): GridData {
  const dayTotals: Record<string, Record<string, number>> = Object.fromEntries(grid.dates.map((d) => [d, emptyTotals()]));
  const totals = emptyTotals();
  const issues: GridIssue[] = [];
  const extra = new Set<GridCode>();
  for (const r of grid.rows) {
    r.totals = emptyTotals();
    for (const d of grid.dates) {
      const c = r.cells[d];
      if (!c) continue;
      if (c.conflict || c.unknown) {
        issues.push({ employee_id: r.id, name: `${r.last_name} ${r.first_name}`.trim(), date: d, statuses: c.statuses, kind: c.conflict ? "conflit" : "inconnu" });
        continue;
      }
      if (!c.code) continue;
      r.totals[c.code]++;
      dayTotals[d][c.code]++;
      totals[c.code]++;
      if (CODE_DEF[c.code].extra) extra.add(c.code);
    }
  }
  return { ...grid, dayTotals, totals, issues, extraCodes: GRID_CODES.filter((c) => extra.has(c.code)).map((c) => c.code) };
}

/** Grille complète d'une période à partir des employés et des lignes de pointage. */
export function buildGrid(input: {
  month: string;
  from: string;
  to: string;
  employees: GridEmployee[];
  records: GridRecord[];
  holidays: { date: string; label: string }[];
  generatedAt?: string;
}): GridData {
  const dates = periodDates(input.from, input.to);
  const holidays = Object.fromEntries(input.holidays.filter((h) => h.date >= input.from && h.date <= input.to).map((h) => [h.date, h.label]));
  const byEmpDate = new Map<string, string[]>();
  for (const a of input.records) {
    if (a.activity_date < input.from || a.activity_date > input.to) continue;
    const k = `${a.employee_id}|${a.activity_date}`;
    byEmpDate.set(k, [...(byEmpDate.get(k) ?? []), a.status]);
  }
  const rows: GridRow[] = [...input.employees]
    .sort(compareMonthly)
    .map((e) => {
      const cells: Record<string, GridCell> = {};
      for (const d of dates) {
        const st = byEmpDate.get(`${e.id}|${d}`);
        if (st) cells[d] = buildCell(st, d in holidays);
      }
      return { ...e, cells, totals: {} };
    });
  return computeTotals({ month: input.month, from: input.from, to: input.to, dates, holidays, rows, generatedAt: input.generatedAt ?? new Date().toISOString() });
}

/**
 * JFT (jours fériés travaillés) et JP (jours ordinaires travaillés) d'un employé, d'après ses lignes
 * de pointage ; une date compte une seule fois. JFT : au moins un service Présent ou Repos travaillé
 * un jour férié (calendrier officiel, jamais déduit du code de la cellule). JP : au moins un service
 * Présent un jour non férié ; un repos travaillé seul n'y compte pas.
 * Repos, congé, récupération, absence, maladie et jour férié non travaillé ne comptent pas.
 */
export function workedDayCounts(grid: Pick<GridData, "dates" | "holidays">, row: Pick<GridRow, "cells">): { jft: number; jp: number } {
  let jft = 0;
  let jp = 0;
  for (const d of grid.dates) {
    const statuses = row.cells[d]?.statuses ?? [];
    if (d in grid.holidays) {
      if (statuses.some((st) => st === "present" || st === "repos_travaille")) jft++;
    } else if (statuses.includes("present")) {
      jp++;
    }
  }
  return { jft, jp };
}

export type GridFilters = { team?: TeamType; position?: Position; q?: string };

/** Filtre les employés (équipe, fonction, nom) et recalcule les totaux. */
export function filterGrid(grid: GridData, f: GridFilters): GridData {
  const q = (f.q ?? "").trim().toLowerCase();
  // Ordre appliqué aussi aux versions finalisées (leur contenu enregistré n'est pas modifié)
  if (!f.team && !f.position && !q) return { ...grid, rows: [...grid.rows].sort(compareMonthly) };
  const rows = [...grid.rows]
    .sort(compareMonthly)
    .filter((r) => (!f.team || r.team_type === f.team) && (!f.position || r.position === f.position))
    .filter((r) => !q || `${r.last_name} ${r.first_name} ${r.matricule} ${r.job_title}`.toLowerCase().includes(q))
    .map((r) => ({ ...r, cells: r.cells, totals: {} }));
  return computeTotals({ ...grid, rows });
}

export type GridChange = { employee_id: string; name: string; date: string | null; before: string; after: string };

const cellLabel = (c: GridCell | undefined) => (!c || !c.statuses.length ? "—" : c.code ?? (c.conflict ? "!" : "?"));

/** Différences entre une version finalisée et les données actuelles du Pointage. */
export function diffGrids(saved: GridData, live: GridData): GridChange[] {
  const out: GridChange[] = [];
  const liveById = new Map(live.rows.map((r) => [r.id, r]));
  const savedIds = new Set(saved.rows.map((r) => r.id));
  for (const s of saved.rows) {
    const l = liveById.get(s.id);
    const name = `${s.last_name} ${s.first_name}`.trim();
    for (const d of saved.dates) {
      const before = cellLabel(s.cells[d]);
      const after = cellLabel(l?.cells[d]);
      if (before !== after) out.push({ employee_id: s.id, name, date: d, before, after });
    }
  }
  for (const l of live.rows) {
    if (savedIds.has(l.id)) continue;
    const filled = saved.dates.filter((d) => l.cells[d]?.statuses.length);
    if (filled.length) out.push({ employee_id: l.id, name: `${l.last_name} ${l.first_name}`.trim(), date: null, before: "—", after: `${filled.length}` });
  }
  return out;
}
