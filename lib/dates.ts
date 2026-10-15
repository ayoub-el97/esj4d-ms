import { format, parseISO, isValid } from "date-fns";
import { fr } from "date-fns/locale";

/** "2026-10-15" -> "15/10/2026" */
export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "dd/MM/yyyy", { locale: fr }) : iso;
}

/** "2026-10-15" -> "jeudi 15 octobre 2026" */
export function formatDateLongFr(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "EEEE d MMMM yyyy", { locale: fr }) : iso;
}

/** "2026-10" -> "octobre 2026" */
export function formatMonthFr(ym: string): string {
  const d = parseISO(`${ym}-01`);
  return isValid(d) ? format(d, "MMMM yyyy", { locale: fr }) : ym;
}

/** Horodatage de saisie : "15/10/2026 14:32" */
export function formatDateTimeFr(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isValid(d) ? format(d, "dd/MM/yyyy HH:mm", { locale: fr }) : iso;
}

/** Date du jour au format ISO (yyyy-MM-dd), selon l'horloge locale du serveur/navigateur. */
export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Mois courant au format yyyy-MM. */
export function currentMonth(): string {
  return format(new Date(), "yyyy-MM");
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
