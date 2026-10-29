// Méthode de départ du solde de congés et calcul détaillé — module pur.
import type { TFunction } from "@/lib/i18n/config";

export type LeaveStartMethod = "solde_initial" | "pris_avant";
export const LEAVE_START_METHODS: LeaveStartMethod[] = ["solde_initial", "pris_avant"];
export const LEAVE_START_METHOD_LABELS: Record<LeaveStartMethod, string> = {
  solde_initial: "Solde initial confirmé (situation B)",
  pris_avant: "Congés pris avant le système (situation A)",
};
export const LEAVE_START_METHOD_HELP: Record<LeaveStartMethod, string> = {
  solde_initial: "Solde restant au début du suivi d'après les registres papier ; seuls les congés acquis et pris ensuite sont ajoutés ou déduits. Les congés pris avant le système sont affichés pour information (déjà compris dans le solde).",
  pris_avant: "Congés acquis depuis la date réelle de début de travail (obligatoire), moins les congés pris avant le système et ceux pris dans l'application. Le solde initial n'est pas utilisé.",
};

type B = { method?: string | null; initial_balance: number; accrued: number; taken: number; taken_before: number | null; adjustments: number; balance: number };
const n = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace(".", ","));

/** Calcul du solde en clair, pour vérification (ex. « 14 + 9 − 2 = 21 »). */
export function balanceFormula(t: TFunction, b: B): string {
  const adj = b.adjustments ? ` ${b.adjustments > 0 ? "+" : "−"} ${n(Math.abs(b.adjustments))} (${t("corrections")})` : "";
  if (b.method === "pris_avant")
    return `${n(b.accrued)} (${t("acquis")}) − ${n(b.taken_before ?? 0)} (${t("pris avant le système")}) − ${n(b.taken)} (${t("pris depuis le système")})${adj} = ${n(b.balance)}`;
  return `${n(b.initial_balance)} (${t("solde initial")}) + ${n(b.accrued)} (${t("acquis")}) − ${n(b.taken)} (${t("pris depuis le système")})${adj} = ${n(b.balance)}`;
}
