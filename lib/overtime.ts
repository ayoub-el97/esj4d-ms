// Heures supplémentaires : composante automatique (miroir de la fonction SQL auto_overtime) — module pur.
// Journée standard de 8 h à partir de l'heure d'entrée réelle ; total = automatique + manuel.

const WORKED = ["present", "repos_travaille"];
export const STANDARD_HOURS = 8;

const minutes = (hhmm: string | null | undefined) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const pad = (n: number) => String(n).padStart(2, "0");

/** Fin prévue = entrée + 8 h (« 14:00 », ou « 00:00 » avec nextDay si elle tombe le lendemain). */
export function expectedEnd(timeIn: string | null | undefined): { time: string; nextDay: boolean } | null {
  const start = minutes(timeIn);
  if (start == null) return null;
  const end = start + STANDARD_HOURS * 60;
  return { time: `${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}`, nextDay: end >= 24 * 60 };
}

/**
 * Heures sup. automatiques : dépassement de la fin prévue (entrée + 8 h), arrondi à l'heure supérieure
 * (30 min → 1 h ; 1 h 15 → 2 h ; 2 h → 2 h). Sortie avant la fin prévue : 0 (journée complète).
 * Sortie plus « petite » que l'entrée : le lendemain (passage de minuit).
 */
export function autoOvertime(timeIn: string | null | undefined, timeOut: string | null | undefined, status: string): number {
  const a = minutes(timeIn);
  const b = minutes(timeOut);
  if (a == null || b == null || !WORKED.includes(status)) return 0;
  const worked = b - a + (b < a ? 24 * 60 : 0);
  const over = worked - STANDARD_HOURS * 60;
  return over > 0 ? Math.min(24, Math.ceil(over / 60)) : 0;
}

/** « 1,5 » / « 2 » (heures) */
export const fmtHours = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "").replace(".", ","));
