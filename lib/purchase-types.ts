// Achats : listes et libellés (côté serveur et navigateur).
// Saisie simplifiée : date, description, catégorie, montant total saisi directement, photos.

/** Catégories proposées par défaut ; d'autres peuvent être ajoutées (texte libre). */
export const PURCHASE_CATEGORIES = ["produits_nettoyage", "outillage", "equipement", "pieces_rechange", "vetements_protection", "autre"] as const;
export type PurchaseCategory = string;
export const PURCHASE_CATEGORY_LABELS: Record<string, string> = {
  produits_nettoyage: "Produits de nettoyage",
  outillage: "Outillage",
  equipement: "Équipement",
  pieces_rechange: "Pièces de rechange",
  vetements_protection: "Vêtements de protection",
  autre: "Autre matériel",
};
/** Libellé d'une catégorie : clé de traduction pour les catégories par défaut, sinon le nom saisi. */
export const categoryLabel = (t: (k: string) => string, c: string) => (c in PURCHASE_CATEGORY_LABELS ? t(PURCHASE_CATEGORY_LABELS[c]) : c);

/** Unités des achats saisis avant la simplification (affichage de l'historique uniquement). */
export type PurchaseUnit = "piece" | "boite" | "carton" | "kg" | "litre" | "metre" | "lot" | "autre";
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
export const unitLabel = (unit: PurchaseUnit, custom: string) => (unit === "autre" && custom.trim() ? custom.trim() : PURCHASE_UNIT_LABELS[unit] ?? unit);

/** Pièces jointes d'un achat (phase de la table photos ; titre = clé de traduction). */
export const PURCHASE_PHOTO_GROUPS = [
  { phase: "materiel", title: "Photos des achats" },
  { phase: "justificatif", title: "Photos de la facture / du bon" },
] as const;

/** Intitulé d'un achat : description (et matériel pour les achats saisis avant la simplification). */
export function purchaseLabel(p: { material_name?: string | null; description?: string | null }): string {
  const m = (p.material_name ?? "").trim();
  const d = (p.description ?? "").trim();
  if (m && d && m.toLowerCase() !== d.toLowerCase()) return `${m} — ${d}`;
  return m || d;
}
