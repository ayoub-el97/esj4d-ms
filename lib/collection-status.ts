// Statut d'un rapport de collecte, calculé à partir de son contenu (aucune saisie de statut à faire) :
//   Brouillon        : créé, rien encore de saisi (ni lieux, ni photos)
//   En cours         : commencé (lieux ou photos), mais il manque des éléments
//   Terminé          : lieux + photos AVANT + photos APRÈS
//   Journée clôturée : la journée est clôturée (lecture seule)
// Le rapport reste modifiable dans tous les cas tant que la journée est ouverte.

export type CollectionStatus = "brouillon" | "en_cours" | "termine" | "cloture";

export const COLLECTION_STATUS_LABELS: Record<CollectionStatus, string> = {
  brouillon: "Brouillon",
  en_cours: "En cours",
  termine: "Terminé",
  cloture: "Journée clôturée",
};

export const COLLECTION_STATUS_STYLES: Record<CollectionStatus, string> = {
  brouillon: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  en_cours: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  termine: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  cloture: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
};

/** Éléments manquants (clés de traduction). */
export function collectionMissing(r: { sectors: string; before: number; after: number }): string[] {
  const missing: string[] = [];
  if (!r.sectors.trim()) missing.push("lieux / secteurs");
  if (r.before === 0) missing.push("photos AVANT");
  if (r.after === 0) missing.push("photos APRÈS");
  return missing;
}

export function collectionStatus(r: { sectors: string; before: number; after: number; dayClosed: boolean }): CollectionStatus {
  if (r.dayClosed) return "cloture";
  const missing = collectionMissing(r);
  if (missing.length === 0) return "termine";
  if (missing.length === 3) return "brouillon";
  return "en_cours";
}
