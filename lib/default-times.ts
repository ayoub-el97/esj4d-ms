// Heures proposées par défaut dans le pointage — module pur (navigateur et serveur).
// Ce sont des valeurs de départ modifiables, jamais imposées : l'heure saisie est toujours conservée.
import { expectedEnd } from "@/lib/overtime";

export const DEFAULT_TIME_IN = "06:00";
export const DEFAULT_TIME_OUT = "14:00";

export type WorkPeriod = "matin" | "apres_midi" | "milieu" | "nuit";
export const WORK_PERIOD_LABELS: Record<WorkPeriod, string> = { matin: "Matin", apres_midi: "Après-midi", milieu: "Milieu de journée", nuit: "Nuit" };

/** Fonctions de bureau : repos le dimanche, jours fériés non travaillés, aucune heure supplémentaire. */
export const OFFICE_POSITIONS = ["directeur", "secretaire", "responsable"];
export const isOfficePosition = (p: string | null | undefined) => !!p && OFFICE_POSITIONS.includes(p);
/** Toujours le matin (06:00 – 14:00), quelle que soit la période choisie. */
const FIXED_MORNING = ["mecanicien", "chef_equipe"];

/** Périodes proposées dans la fiche employé selon le poste (aucune pour les postes au matin fixe). */
export function workPeriodsFor(position: string): WorkPeriod[] {
  if (FIXED_MORNING.includes(position)) return [];
  if (position === "gardien") return ["matin", "milieu", "nuit"];
  return ["matin", "apres_midi"];
}

const TIMES: Record<WorkPeriod, [string, string]> = {
  matin: ["06:00", "14:00"],
  apres_midi: ["16:00", "00:00"],
  milieu: ["14:00", "22:00"],
  nuit: ["22:00", "06:00"],
};

/**
 * Heures par défaut d'une journée selon la fonction du jour et la période de travail de la fiche.
 * missing = période non définie (06:00 – 14:00 proposé en attendant, avec avertissement).
 * La sortie peut être le lendemain (16:00 – 00:00, 22:00 – 06:00).
 */
export function defaultShiftTimes(position: string, period: string | null | undefined): { timeIn: string; timeOut: string; missing: boolean } {
  if (FIXED_MORNING.includes(position)) return { timeIn: "06:00", timeOut: "14:00", missing: false };
  const allowed = workPeriodsFor(position);
  const p = period && (allowed as string[]).includes(period) ? (period as WorkPeriod) : null;
  if (!p) return { timeIn: DEFAULT_TIME_IN, timeOut: DEFAULT_TIME_OUT, missing: true };
  const [timeIn, timeOut] = TIMES[p];
  return { timeIn, timeOut, missing: false };
}

/** La sortie tombe le lendemain de l'entrée (passage de minuit). */
export const endsNextDay = (timeIn: string, timeOut: string) => !!timeIn && !!timeOut && timeOut <= timeIn;

/**
 * Nouvelle heure de sortie à proposer quand l'heure d'entrée change : entrée + 8 h,
 * seulement si la sortie est vide ou correspond encore à la proposition précédente
 * (une sortie modifiée à la main n'est jamais écrasée). Passage de minuit possible (18:00 → 02:00).
 */
export function suggestedTimeOut(prevIn: string, prevOut: string, nextIn: string): string {
  const prevSuggestion = expectedEnd(prevIn)?.time ?? "";
  if (prevOut && prevOut !== prevSuggestion && !(prevIn === DEFAULT_TIME_IN && prevOut === DEFAULT_TIME_OUT)) return prevOut;
  return expectedEnd(nextIn)?.time ?? prevOut;
}
