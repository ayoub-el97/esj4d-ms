import { isISODate, isMonth, workMonthRange } from "@/lib/dates";

export type PurchasePeriodParams = { mois?: string; annee?: string; from?: string; to?: string };

/** Période choisie : mois (mois de projet), année (janvier → décembre) ou dates libres. */
export function resolvePurchasePeriod(sp: PurchasePeriodParams, projectStart: string | null): { mode: "mois" | "annee" | "periode" | "tout"; from?: string; to?: string } {
  if (isMonth(sp.mois)) return { mode: "mois", ...workMonthRange(sp.mois, projectStart) };
  if (sp.annee && /^\d{4}$/.test(sp.annee)) return { mode: "annee", from: workMonthRange(`${sp.annee}-01`, projectStart).from, to: workMonthRange(`${sp.annee}-12`, projectStart).to };
  const from = isISODate(sp.from) ? sp.from : undefined;
  const to = isISODate(sp.to) ? sp.to : undefined;
  if (from || to) return { mode: "periode", from, to };
  return { mode: "tout" };
}
