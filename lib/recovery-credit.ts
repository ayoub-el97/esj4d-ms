// Crédits de récupération (utilisable côté serveur, navigateur et PDF).
import { formatDateFr } from "@/lib/dates";
import type { TFunction } from "@/lib/i18n/config";

export type CreditKind = "repos" | "ferie";
/** disponible | demande (en attente) | pris (acceptée) | a_payer (férié non demandé avant la fin du mois) */
export type CreditState = "disponible" | "demande" | "pris" | "a_payer";

export type AvailableCredit = { date: string; kind: CreditKind; label: string | null; expires_on: string | null };

export const CREDIT_STATE_LABELS: Record<CreditState, string> = {
  disponible: "Disponible",
  demande: "Demandé (en attente)",
  pris: "Récupéré",
  a_payer: "À payer (ajouté au salaire)",
};

/** « 18/11/2026 — Férié : Fête de l'Indépendance (à demander avant le 30/11/2026) » */
export function creditLabel(c: { date: string; kind: CreditKind; label: string | null; expires_on: string | null }, t: TFunction, withDeadline = true): string {
  if (c.kind === "repos") return t("{date} — repos travaillé", { date: formatDateFr(c.date) });
  const base = t("{date} — férié travaillé{label}", { date: formatDateFr(c.date), label: c.label ? ` (${c.label})` : "" });
  return withDeadline && c.expires_on ? `${base} · ${t("à demander avant le {date}", { date: formatDateFr(c.expires_on) })}` : base;
}
