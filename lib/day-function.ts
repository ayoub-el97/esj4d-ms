// Fonction du jour (pointage) et fonction habituelle (fiche employé) — module pur.
import type { TFunction } from "@/lib/i18n/config";
import { POSITION_LABELS, type Position } from "@/lib/types";

/** Libellé « Ripeur (habituellement Balayeur) » quand la fonction du jour diffère de la fonction habituelle. */
export function dayFunctionLabel(t: TFunction, day: Position, usual?: Position | null): string {
  const d = t(POSITION_LABELS[day] ?? day);
  if (!usual || usual === day) return d;
  return t("{day} (habituellement {usual})", { day: d, usual: t(POSITION_LABELS[usual] ?? usual) });
}

/** Fonction la plus fréquente d'une liste (fonction habituelle sur une période) ; égalité : préférence donnée. */
export function mostFrequent<T extends string>(values: T[], prefer?: T): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let max = 0;
  for (const [v, n] of counts) if (n > max || (n === max && v === prefer)) [best, max] = [v, n];
  return best;
}
