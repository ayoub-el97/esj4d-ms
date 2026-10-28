// Heures proposées par défaut dans le pointage — module pur (navigateur et serveur).
// Ce sont des valeurs de départ modifiables, jamais imposées : l'heure saisie est toujours conservée.
import { expectedEnd } from "@/lib/overtime";

export const DEFAULT_TIME_IN = "06:00";
export const DEFAULT_TIME_OUT = "14:00";

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
