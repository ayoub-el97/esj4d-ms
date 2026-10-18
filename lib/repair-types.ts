// Problèmes et réparations des camions : statuts et règle de dépense (côté serveur et navigateur).
// La règle de dépense est appliquée par la base (vue truck_repair_expenses) ; isActualExpense
// en est le miroir pour l'affichage.

export type RepairStatus = "en_attente" | "en_cours" | "repare" | "annule";

export const REPAIR_STATUSES: RepairStatus[] = ["en_attente", "en_cours", "repare", "annule"];

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  en_attente: "En panne",
  en_cours: "En réparation",
  repare: "Réparé",
  annule: "Annulé",
};

export const REPAIR_STATUS_STYLES: Record<RepairStatus, string> = {
  en_attente: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  en_cours: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  repare: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  annule: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

/** Dépense réelle : coût > 0, date de réparation, et En cours / Réparé (ou Annulé avec frais engagés). */
export function isActualExpense(r: { status: RepairStatus; cost: number | null; repair_date: string | null; cancelled_expense: boolean }): boolean {
  if (r.cost == null || r.cost <= 0 || !r.repair_date) return false;
  return r.status === "en_cours" || r.status === "repare" || (r.status === "annule" && r.cancelled_expense);
}

/** Catégories de photos d'une réparation (phase de la table photos). */
export const REPAIR_PHOTO_GROUPS = [
  { phase: "vehicule", title: "Photo du camion" },
  { phase: "avant", title: "Photos du problème avant réparation" },
  { phase: "justificatif", title: "Reçus / factures de réparation" },
  { phase: "apres", title: "Photos après réparation" },
] as const;
