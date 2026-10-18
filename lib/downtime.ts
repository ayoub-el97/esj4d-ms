// Immobilisation des camions : jours hors service, périodes, alertes (module pur).
// Convention : jours calendaires, jour d'immobilisation et jour de remise en service inclus.
import type { RepairStatus } from "@/lib/repair-types";

export type AlertLevel = "vert" | "orange" | "rouge";

export type AlertRules = {
  orangeDays: number;
  redDays: number;
  orangeCount: number;
  redCount: number;
  windowDays: number;
};

export const DEFAULT_ALERT_RULES: AlertRules = { orangeDays: 3, redDays: 7, orangeCount: 3, redCount: 5, windowDays: 30 };

export const ALERT_LABELS: Record<AlertLevel, string> = { vert: "Normal", orange: "Alerte orange", rouge: "Alerte rouge" };
export const ALERT_STYLES: Record<AlertLevel, string> = {
  vert: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  orange: "bg-orange-100 text-orange-800 ring-1 ring-orange-400 dark:bg-orange-950 dark:text-orange-300",
  rouge: "bg-red-100 text-red-800 ring-1 ring-red-500 dark:bg-red-950 dark:text-red-300",
};
export const ALERT_COLORS: Record<AlertLevel, { bg: string; fg: string }> = {
  vert: { bg: "#dcfce7", fg: "#166534" },
  orange: { bg: "#ffedd5", fg: "#9a3412" },
  rouge: { bg: "#fee2e2", fg: "#991b1b" },
};

const DAY = 86400000;
const t0 = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(t0(d) + n * DAY);

/** Nombre de jours calendaires de start à end, bornes incluses (0 si end < start). */
export function daysInclusive(start: string, end: string): number {
  return Math.max(0, Math.round((t0(end) - t0(start)) / DAY) + 1);
}

export const OPEN_STATUSES: RepairStatus[] = ["en_attente", "en_cours"];

export type DowntimeIncident = {
  id: string;
  truck_id: string;
  status: RepairStatus;
  out_of_service_since: string | null;
  repair_date: string | null;
  expected_return_date: string | null;
  reported_date: string;
};

/** Intervalle d'immobilisation [début, fin] ; panne ouverte : jusqu'à aujourd'hui. null si pas d'immobilisation. */
export function incidentInterval(r: DowntimeIncident, today: string): { from: string; to: string; open: boolean } | null {
  if (!r.out_of_service_since || r.status === "annule") return null;
  if (r.status === "repare") return r.repair_date ? { from: r.out_of_service_since, to: r.repair_date, open: false } : null;
  if (r.out_of_service_since > today) return { from: r.out_of_service_since, to: r.out_of_service_since, open: true };
  return { from: r.out_of_service_since, to: today, open: true };
}

/** Jours hors service d'un dossier (en cours : jusqu'à aujourd'hui ; réparé : durée finale). */
export function incidentDays(r: DowntimeIncident, today: string): number | null {
  const iv = incidentInterval(r, today);
  if (!iv) return null;
  if (iv.open && r.out_of_service_since! > today) return 0;
  return daysInclusive(iv.from, iv.to);
}

/** Fusion d'intervalles (jours inclus) : un même jour n'est jamais compté deux fois. */
export function mergeIntervals(list: { from: string; to: string }[]): { from: string; to: string }[] {
  const sorted = [...list].sort((a, b) => a.from.localeCompare(b.from));
  const out: { from: string; to: string }[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.from <= addDays(last.to, 1)) {
      if (iv.to > last.to) last.to = iv.to;
    } else out.push({ ...iv });
  }
  return out;
}

/** Jours d'immobilisation (union) compris dans [from, to]. */
export function daysInPeriod(list: { from: string; to: string }[], from: string, to: string): number {
  let n = 0;
  for (const iv of mergeIntervals(list)) {
    const a = iv.from > from ? iv.from : from;
    const b = iv.to < to ? iv.to : to;
    if (a <= b) n += daysInclusive(a, b);
  }
  return n;
}

export type TruckIssue = { kind: "chevauchement" | "plusieurs_ouvertes"; ids: string[] };

export type TruckDowntime = {
  truck_id: string;
  /** Dossiers ouverts avec immobilisation (En panne / En réparation) */
  open: DowntimeIncident[];
  /** Statut actuel : en_reparation si un dossier ouvert est en cours, sinon en_panne, sinon en_service */
  state: "en_service" | "en_panne" | "en_reparation";
  /** Hors service depuis (plus ancienne immobilisation ouverte) */
  since: string | null;
  /** Jours hors service actuels (jours distincts de la panne ouverte en cours) */
  currentDays: number;
  /** Pannes (immobilisations) commencées dans la fenêtre glissante */
  recentCount: number;
  overdue: boolean;
  alert: AlertLevel;
  alertReasons: string[];
  issues: TruckIssue[];
};

/** Situation actuelle d'un camion à partir de tous ses dossiers. */
export function truckDowntime(truckId: string, incidents: DowntimeIncident[], today: string, rules: AlertRules = DEFAULT_ALERT_RULES): TruckDowntime {
  const mine = incidents.filter((r) => r.truck_id === truckId);
  const open = mine.filter((r) => OPEN_STATUSES.includes(r.status) && r.out_of_service_since);
  const intervals = mine.map((r) => ({ r, iv: incidentInterval(r, today) })).filter((x) => x.iv) as { r: DowntimeIncident; iv: { from: string; to: string; open: boolean } }[];
  const issues: TruckIssue[] = [];
  if (open.length > 1) issues.push({ kind: "plusieurs_ouvertes", ids: open.map((r) => r.id) });
  for (let i = 0; i < intervals.length; i++)
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i].iv, b = intervals[j].iv;
      if (a.from <= b.to && b.from <= a.to) issues.push({ kind: "chevauchement", ids: [intervals[i].r.id, intervals[j].r.id] });
    }
  const since = open.length ? open.map((r) => r.out_of_service_since!).sort()[0] : null;
  // Jours actuels : bloc continu (union) se terminant aujourd'hui, à partir des dossiers ouverts
  const currentDays = since && since <= today ? daysInPeriod(open.map((r) => incidentInterval(r, today)!), since, today) : 0;
  const windowFrom = addDays(today, -(rules.windowDays - 1));
  const recentCount = mine.filter((r) => r.status !== "annule" && r.out_of_service_since && r.out_of_service_since >= windowFrom && r.out_of_service_since <= today).length;
  const overdue = open.some((r) => r.expected_return_date && r.expected_return_date < today);
  const reasons: string[] = [];
  let alert: AlertLevel = "vert";
  const raise = (lvl: AlertLevel) => {
    if (lvl === "rouge" || (lvl === "orange" && alert === "vert")) alert = lvl;
  };
  if (open.length && currentDays >= rules.redDays) {
    raise("rouge");
    reasons.push("duree_rouge");
  } else if (open.length && currentDays >= rules.orangeDays) {
    raise("orange");
    reasons.push("duree_orange");
  }
  if (recentCount >= rules.redCount) {
    raise("rouge");
    reasons.push("frequence_rouge");
  } else if (recentCount >= rules.orangeCount) {
    raise("orange");
    reasons.push("frequence_orange");
  }
  const state = !open.length ? "en_service" : open.some((r) => r.status === "en_cours") ? "en_reparation" : "en_panne";
  return { truck_id: truckId, open, state, since, currentDays, recentCount, overdue, alert, alertReasons: reasons, issues };
}

export type PeriodDowntime = {
  truck_id: string;
  /** Pannes (immobilisations) commencées dans la période */
  incidents: number;
  /** Jours hors service dans la période (sans double compte) */
  downtimeDays: number;
  /** Pannes encore ouvertes à la fin de la période */
  openAtEnd: number;
  /** Jours, dans la période, des pannes encore ouvertes à la fin de la période */
  openAtEndDays: number;
  /** Durée moyenne des pannes terminées dans la période (null si aucune) */
  avgClosedDays: number | null;
  closedInPeriod: number;
};

/** Statistiques d'immobilisation d'un camion sur [from, to] (jours limités à la période). */
export function periodDowntime(truckId: string, incidents: DowntimeIncident[], from: string, to: string, today: string): PeriodDowntime {
  const end = to < today ? to : today; // aucun jour futur
  const mine = incidents.filter((r) => r.truck_id === truckId && r.status !== "annule" && r.out_of_service_since);
  const ivs = mine.map((r) => ({ r, iv: incidentInterval(r, today) })).filter((x) => x.iv) as { r: DowntimeIncident; iv: { from: string; to: string } }[];
  const stillOpenAt = (r: DowntimeIncident) => r.out_of_service_since! <= to && (OPEN_STATUSES.includes(r.status) || (r.status === "repare" && !!r.repair_date && r.repair_date > to));
  const openEnd = ivs.filter((x) => stillOpenAt(x.r));
  const closed = mine.filter((r) => r.status === "repare" && r.repair_date && r.repair_date >= from && r.repair_date <= to);
  return {
    truck_id: truckId,
    incidents: mine.filter((r) => r.out_of_service_since! >= from && r.out_of_service_since! <= to).length,
    downtimeDays: from <= end ? daysInPeriod(ivs.map((x) => x.iv), from, end) : 0,
    openAtEnd: openEnd.length,
    openAtEndDays: from <= end ? daysInPeriod(openEnd.map((x) => x.iv), from, end) : 0,
    avgClosedDays: closed.length ? Math.round((closed.reduce((s, r) => s + daysInclusive(r.out_of_service_since!, r.repair_date!), 0) / closed.length) * 10) / 10 : null,
    closedInPeriod: closed.length,
  };
}

/** Lecture des seuils depuis les réglages (valeurs par défaut si absentes ou invalides). */
export function alertRulesFrom(s: Record<string, unknown>): AlertRules {
  const n = (v: unknown, d: number) => {
    const x = Math.trunc(Number(v));
    return Number.isFinite(x) && x >= 1 ? x : d;
  };
  return {
    orangeDays: n(s.truck_alert_orange_days, DEFAULT_ALERT_RULES.orangeDays),
    redDays: n(s.truck_alert_red_days, DEFAULT_ALERT_RULES.redDays),
    orangeCount: n(s.truck_alert_orange_count, DEFAULT_ALERT_RULES.orangeCount),
    redCount: n(s.truck_alert_red_count, DEFAULT_ALERT_RULES.redCount),
    windowDays: n(s.truck_alert_window_days, DEFAULT_ALERT_RULES.windowDays),
  };
}
