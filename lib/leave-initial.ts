// Solde initial de congés (registres papier) saisi depuis la fiche employé — module pur.
// La fiche n'écrase jamais le solde : chaque saisie ou correction devient une correction
// « solde initial » (date, utilisateur, motif, nombre de jours) égale à l'écart avec le solde actuel.

/** Écart à enregistrer (null = rien à enregistrer). Arrondi au demi-jour près, comme la saisie. */
export function initialBalanceDelta(current: number, wanted: number | null): number | null {
  if (wanted == null || !Number.isFinite(wanted)) return null;
  const delta = Math.round((wanted - current) * 2) / 2;
  return delta === 0 ? null : delta;
}
