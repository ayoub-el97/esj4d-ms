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

export type LeaveDashboard = {
  /** Solde congé : acquis depuis l'entrée en service (+ solde initial en méthode B, + corrections) */
  conge: number;
  /** Solde pris : congés pris avant le système + congés approuvés déjà pris dans l'application */
  pris: number;
  /** Solde restant = Solde congé − Solde pris */
  restant: number;
  /** Date d'entrée en service manquante : aucun calcul affiché (à compléter) */
  missingStart: boolean;
};

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Tableau des congés : Solde congé, Solde pris, Solde restant (Solde restant = Solde congé − Solde pris,
 * identique au solde calculé par la base). Méthode A (par défaut) : les congés pris avant le système
 * comptent uniquement dans le Solde pris ; méthode B (solde initial confirmé) : déjà compris dans le solde.
 */
export function leaveDashboard(b: { method?: string | null; hire_date?: string | null; accrual_from?: string | null; initial_balance: number; accrued: number; taken: number; taken_before: number | null; adjustments: number; balance: number }): LeaveDashboard {
  if (b.method === "pris_avant") {
    return { conge: round1(b.accrued + b.adjustments), pris: round1((b.taken_before ?? 0) + b.taken), restant: round1(b.balance), missingStart: !b.hire_date };
  }
  return { conge: round1(b.initial_balance + b.accrued + b.adjustments), pris: round1(b.taken), restant: round1(b.balance), missingStart: !b.accrual_from && !b.initial_balance };
}

/** Jours avec demi-journées (« 12,5 »). */
export const fmtDays = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace(".", ","));
