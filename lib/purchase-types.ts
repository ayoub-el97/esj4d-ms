// Achats de matériel : listes et calculs (côté serveur et navigateur).
// La base applique les mêmes règles (total = quantité × prix, payé, reste dû, statut).

export type PurchaseCategory = "produits_nettoyage" | "outillage" | "equipement" | "pieces_rechange" | "vetements_protection" | "autre";
export const PURCHASE_CATEGORIES: PurchaseCategory[] = ["produits_nettoyage", "outillage", "equipement", "pieces_rechange", "vetements_protection", "autre"];
export const PURCHASE_CATEGORY_LABELS: Record<PurchaseCategory, string> = {
  produits_nettoyage: "Produits de nettoyage",
  outillage: "Outillage",
  equipement: "Équipement",
  pieces_rechange: "Pièces de rechange",
  vetements_protection: "Vêtements de protection",
  autre: "Autre matériel",
};

export type PurchaseUnit = "piece" | "boite" | "carton" | "kg" | "litre" | "metre" | "lot" | "autre";
export const PURCHASE_UNITS: PurchaseUnit[] = ["piece", "boite", "carton", "kg", "litre", "metre", "lot", "autre"];
export const PURCHASE_UNIT_LABELS: Record<PurchaseUnit, string> = {
  piece: "Pièce",
  boite: "Boîte",
  carton: "Carton",
  kg: "Kilogramme",
  litre: "Litre",
  metre: "Mètre",
  lot: "Lot",
  autre: "Autre unité",
};

export type PaymentStatus = "paye" | "partiel" | "impaye" | "annule";
export const PAYMENT_STATUSES: PaymentStatus[] = ["paye", "partiel", "impaye", "annule"];
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paye: "Payé",
  partiel: "Partiellement payé",
  impaye: "Non payé",
  annule: "Annulé",
};
export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  paye: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  partiel: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  impaye: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  annule: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export const PAYMENT_METHODS = ["Espèces", "Chèque", "Virement", "Carte", "Traite", "Autre"];

/** Total = quantité × prix unitaire, arrondi au centime (comme la base). */
export const computeTotal = (quantity: number, unitPrice: number) => Math.round(quantity * unitPrice * 100) / 100;

/** Catégories de pièces jointes d'un achat (phase de la table photos ; titre = clé de traduction). */
export const PURCHASE_PHOTO_GROUPS = [
  { phase: "materiel", title: "Photos du matériel" },
  { phase: "justificatif", title: "Reçus / factures" },
  { phase: "document", title: "Documents complémentaires" },
] as const;

export const unitLabel = (unit: PurchaseUnit, custom: string) => (unit === "autre" && custom.trim() ? custom.trim() : PURCHASE_UNIT_LABELS[unit]);
