import { format, parseISO, isValid, type Locale as DateFnsLocale } from "date-fns";
import { arMA, enGB, fr } from "date-fns/locale";
import type { Locale } from "@/lib/i18n/config";

const DATE_LOCALES: Record<Locale, DateFnsLocale> = { fr, en: enGB, ar: arMA };

/** "2026-10-15" -> "15/10/2026" (format numérique, identique dans toutes les langues) */
export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "dd/MM/yyyy") : iso;
}

/** "2026-10-15" -> "jeudi 15 octobre 2026" / "Thursday 15 October 2026" / arabe */
export function formatDateLongFr(iso: string | null | undefined, locale: Locale = "fr"): string {
  if (!iso) return "";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "EEEE d MMMM yyyy", { locale: DATE_LOCALES[locale] }) : iso;
}

/** "2026-10" -> "octobre 2026" / "October 2026" / arabe */
export function formatMonthFr(ym: string, locale: Locale = "fr"): string {
  const d = parseISO(`${ym}-01`);
  return isValid(d) ? format(d, "MMMM yyyy", { locale: DATE_LOCALES[locale] }) : ym;
}

/** Horodatage de saisie : "15/10/2026 14:32" */
export function formatDateTimeFr(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isValid(d) ? format(d, "dd/MM/yyyy HH:mm") : iso;
}

/** Fuseau de l'entreprise : le serveur (Vercel) tourne en UTC, la date du jour suit l'heure du Maroc. */
export const APP_TIME_ZONE = "Africa/Casablanca";

/** Date du jour au format ISO (yyyy-MM-dd), à l'heure du Maroc. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Mois courant au format yyyy-MM (heure du Maroc). */
export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

/** Nombre de jours entre aujourd'hui et une date ISO (négatif si passée). */
export function daysUntil(iso: string, today = todayISO()): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

/** Vérifie qu'une chaîne est une date ISO yyyy-MM-dd valide. */
export function isISODate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value));
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

/** "2026-10" -> { from: "2026-10-01", to: "2026-10-31" } */
export function monthRange(mois: string): { from: string; to: string } {
  const [y, m] = mois.split("-").map(Number);
  return { from: `${mois}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

// ---------------------------------------------------------------------------
// Mois de projet : le « mois » commence le jour de début du projet (réglage
// project_start_date), ex. 08/10 → 07/11. Même calcul que les fonctions SQL
// work_month_start / work_month_range. Sans date de début : mois calendaire.
// ---------------------------------------------------------------------------
function isoUTC(y: number, m0: number, d: number): string {
  return new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);
}

/** Ajoute n mois à une date ISO ; le jour est ramené au dernier jour du mois si besoin (comme PostgreSQL). */
export function addMonthsISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return isoUTC(y, m - 1 + n, Math.min(d, lastDay));
}

/** Date ISO décalée de n jours (jour précédent : -1, suivant : +1). */
export function addDaysISO(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));

/** Période du « mois » aaaa-mm : celle qui commence dans ce mois calendaire. */
export function workMonthRange(mois: string, projectStart: string | null | undefined): { from: string; to: string } {
  if (!projectStart || !isISODate(projectStart)) return monthRange(mois);
  const n = monthsBetween(projectStart, `${mois}-01`);
  return { from: addMonthsISO(projectStart, n), to: addDaysISO(addMonthsISO(projectStart, n + 1), -1) };
}

/** Mois (aaaa-mm du début de période) contenant une date. */
export function workMonthOf(iso: string, projectStart: string | null | undefined): string {
  if (!projectStart || !isISODate(projectStart)) return iso.slice(0, 7);
  let n = monthsBetween(projectStart, iso);
  if (addMonthsISO(projectStart, n) > iso) n -= 1;
  return addMonthsISO(projectStart, n).slice(0, 7);
}

/** « octobre 2026 » ou, avec un début de projet, « octobre 2026 (08/10/2026 → 07/11/2026) ». */
export function formatWorkMonth(mois: string, projectStart: string | null | undefined, locale: Locale = "fr"): string {
  const name = formatMonthFr(mois, locale);
  if (!projectStart || !isISODate(projectStart) || projectStart.endsWith("-01")) return name;
  const { from, to } = workMonthRange(mois, projectStart);
  return `${name} (${formatDateFr(from)} → ${formatDateFr(to)})`;
}

/** Heure actuelle « HH:MM » à l'heure du Maroc. */
export function nowHHMM(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}
