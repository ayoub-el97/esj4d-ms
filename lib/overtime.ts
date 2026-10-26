// Heures supplémentaires : composante automatique (miroir de la fonction SQL auto_overtime) — module pur.
// Total = automatique + manuel, toujours additionnés (jamais remplacés ni compensés).

const WORKED = ["present", "repos_travaille"];

const minutes = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Chaque demi-heure entamée après l'heure de fin normale compte 0,5 h
 * (fin 14:00, sortie 15:30 → 1,5 h ; sortie 15:31 → 2 h ; sortie 14:01 → 0,5 h).
 * 0 si : pas d'heure de sortie, heure de fin normale non configurée, statut non travaillé,
 * 2e service du jour, ou sortie avant / à l'heure de fin normale.
 */
export function autoOvertime(timeOut: string | null | undefined, normalEnd: string | null | undefined, status: string, shift: number): number {
  const out = minutes(timeOut ?? "");
  const end = minutes(normalEnd ?? "");
  if (out == null || end == null || shift !== 1 || !WORKED.includes(status) || out <= end) return 0;
  return Math.min(24, Math.ceil((out - end) / 30) * 0.5);
}

/** « 1,5 » / « 2 » (heures) */
export const fmtHours = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "").replace(".", ","));
