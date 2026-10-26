// Rappels (ponctuels et récurrents) : types et calcul des échéances — module pur (serveur et navigateur).
// Toutes les dates sont des dates « aaaa-mm-jj » du fuseau Africa/Casablanca (todayISO côté serveur).

export type ReminderFrequency = "once" | "daily" | "weekly" | "weekdays" | "monthly";
export type ReminderPriority = "normal" | "important" | "urgent";

export const FREQUENCY_LABELS: Record<ReminderFrequency, string> = {
  once: "Une seule fois",
  daily: "Tous les jours",
  weekly: "Chaque semaine",
  weekdays: "Certains jours de la semaine",
  monthly: "Chaque mois",
};
export const PRIORITY_LABELS: Record<ReminderPriority, string> = { normal: "Normale", important: "Importante", urgent: "Urgente" };
/** Jours affichés du lundi au dimanche (valeurs : 0 = dimanche … 6 = samedi). */
export const WEEKDAY_PICKER = [1, 2, 3, 4, 5, 6, 0];

export type Reminder = {
  id: string;
  title: string;
  details: string;
  /** Date unique (« une fois ») ou date de début (récurrent) */
  remind_date: string;
  notify_days_before: number;
  shared: boolean;
  frequency: ReminderFrequency;
  weekdays: number[];
  month_day: number | null;
  remind_time: string | null;
  end_date: string | null;
  paused: boolean;
  priority: ReminderPriority;
  snoozed_until: string | null;
  created_by: string;
  mine: boolean;
  /** Dernière occurrence terminée (date de l'occurrence), qui et quand */
  last_done: { occurrence: string; at: string; by: string } | null;
};

/**
 * État d'un rappel :
 *   overdue     : une ou plusieurs occurrences passées non terminées
 *   today       : occurrence du jour (heure atteinte ou sans heure)
 *   later_today : occurrence du jour, heure pas encore atteinte
 *   soon        : rappel ponctuel dans sa fenêtre d'alerte (n jours avant)
 *   upcoming    : prochaine occurrence plus tard
 *   snoozed     : reporté à une date future
 *   paused      : en pause
 *   done        : rappel ponctuel terminé
 *   ended       : rappel récurrent arrivé à sa date de fin, tout est terminé
 */
export type ReminderState = "overdue" | "today" | "later_today" | "soon" | "upcoming" | "snoozed" | "paused" | "done" | "ended";

export type ReminderStatus = {
  state: ReminderState;
  /** Occurrence à traiter (la plus ancienne non terminée), ou la prochaine */
  due: string | null;
  /** Nombre d'occurrences non terminées jusqu'à aujourd'hui */
  missed: number;
  /** Prochaine occurrence à partir de demain */
  next: string | null;
  /** Jours jusqu'à « due » (négatif = en retard) */
  days: number;
};

const DAY = 86400000;
const t0 = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDaysISO = (d: string, n: number) => iso(t0(d) + n * DAY);
export const daysBetween = (from: string, to: string) => Math.round((t0(to) - t0(from)) / DAY);
const dow = (d: string) => new Date(t0(d)).getUTCDay();
const lastDayOfMonth = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate();

/** La date est-elle une occurrence du rappel (règle seule, sans début / fin) ? */
export function matchesRule(r: Pick<Reminder, "frequency" | "weekdays" | "month_day" | "remind_date">, d: string): boolean {
  switch (r.frequency) {
    case "once":
      return d === r.remind_date;
    case "daily":
      return true;
    case "weekly":
    case "weekdays":
      return r.weekdays.includes(dow(d));
    case "monthly": {
      // 31 → dernier jour des mois plus courts
      const day = Math.min(r.month_day ?? 1, lastDayOfMonth(d));
      return Number(d.slice(8, 10)) === day;
    }
  }
}

/** Occurrences entre from et to (inclus), limitées au début / à la fin du rappel. */
export function occurrences(r: Pick<Reminder, "frequency" | "weekdays" | "month_day" | "remind_date" | "end_date">, from: string, to: string, max = 400): string[] {
  const a = from > r.remind_date ? from : r.remind_date;
  const b = r.end_date && r.end_date < to ? r.end_date : to;
  const out: string[] = [];
  if (a > b) return out;
  if (r.frequency === "once") return r.remind_date >= a && r.remind_date <= b ? [r.remind_date] : [];
  for (let d = a; d <= b && out.length < max; d = addDaysISO(d, 1)) if (matchesRule(r, d)) out.push(d);
  return out;
}

/** Prochaine occurrence à partir de « from » (incluse), dans la limite d'un an et de la date de fin. */
export function nextOccurrence(r: Pick<Reminder, "frequency" | "weekdays" | "month_day" | "remind_date" | "end_date">, from: string): string | null {
  return occurrences(r, from, addDaysISO(from, 400), 1)[0] ?? null;
}

/** État du rappel à la date du jour (et à l'heure actuelle « HH:MM » pour les rappels à heure fixe). */
export function reminderStatus(r: Reminder, today: string, now = "23:59"): ReminderStatus {
  const lastDone = r.last_done?.occurrence ?? null;
  const next = r.frequency === "once" ? null : nextOccurrence(r, addDaysISO(today, 1));
  const timeReached = !r.remind_time || r.remind_time.slice(0, 5) <= now;

  if (r.frequency === "once") {
    if (lastDone) return { state: "done", due: r.remind_date, missed: 0, next: null, days: daysBetween(today, r.remind_date) };
    if (r.paused) return { state: "paused", due: r.remind_date, missed: 0, next: null, days: daysBetween(today, r.remind_date) };
    const eff = r.snoozed_until && r.snoozed_until > r.remind_date ? r.snoozed_until : r.remind_date;
    const days = daysBetween(today, eff);
    if (r.snoozed_until && r.snoozed_until > today) return { state: "snoozed", due: r.snoozed_until, missed: 0, next: null, days };
    if (days < 0) return { state: "overdue", due: eff, missed: 1, next: null, days };
    if (days === 0) return { state: timeReached ? "today" : "later_today", due: eff, missed: timeReached ? 1 : 0, next: null, days };
    return { state: days <= r.notify_days_before ? "soon" : "upcoming", due: eff, missed: 0, next: null, days };
  }

  // Récurrent : occurrences non terminées depuis la dernière terminée (au plus 400 jours en arrière)
  const since = lastDone ? addDaysISO(lastDone, 1) : addDaysISO(today, -400);
  const pending = occurrences(r, since, today).filter((d) => d < today || timeReached);
  const todayPlanned = occurrences(r, today, today).length > 0 && !(lastDone && lastDone >= today);
  if (r.paused) return { state: "paused", due: pending[0] ?? next, missed: pending.length, next, days: pending[0] ? daysBetween(today, pending[0]) : 0 };
  if (r.snoozed_until && r.snoozed_until > today) return { state: "snoozed", due: r.snoozed_until, missed: pending.length, next, days: daysBetween(today, r.snoozed_until) };
  if (pending.length) {
    const first = pending[0];
    return { state: first < today ? "overdue" : "today", due: first, missed: pending.length, next, days: daysBetween(today, first) };
  }
  if (todayPlanned && !timeReached) return { state: "later_today", due: today, missed: 0, next, days: 0 };
  if (!next) return { state: "ended", due: null, missed: 0, next: null, days: 0 };
  return { state: "upcoming", due: next, missed: 0, next, days: daysBetween(today, next) };
}

/**
 * Occurrence à marquer comme terminée : la plus récente occurrence due (les précédentes non
 * terminées sont couvertes), sinon l'occurrence du jour ou la prochaine (terminée en avance).
 */
export function occurrenceToComplete(r: Reminder, today: string, now = "23:59"): string | null {
  if (r.frequency === "once") return r.remind_date;
  const st = reminderStatus(r, today, now);
  const since = r.last_done ? addDaysISO(r.last_done.occurrence, 1) : addDaysISO(today, -400);
  const due = occurrences(r, since, today);
  return due.at(-1) ?? st.next;
}

/** Un rappel est « à traiter » (alerte) s'il est en retard, du jour, ou proche (ponctuel). */
export const isAlert = (s: ReminderState) => s === "overdue" || s === "today" || s === "soon";
export const isDueNow = (s: ReminderState) => s === "overdue" || s === "today";

/** Résumé lisible de la règle (clés de traduction et variables). */
export function ruleParts(r: Pick<Reminder, "frequency" | "weekdays" | "month_day">): { key: string; vars?: Record<string, string | number> } {
  switch (r.frequency) {
    case "once":
      return { key: "Une seule fois" };
    case "daily":
      return { key: "Tous les jours" };
    case "weekly":
    case "weekdays":
      return { key: "weekdays" };
    case "monthly":
      return { key: "Le {day} de chaque mois", vars: { day: r.month_day ?? 1 } };
  }
}
