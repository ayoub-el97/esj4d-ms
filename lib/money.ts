// Montants en dirham marocain (devise de l'entreprise).
// L'unité est une clé de traduction : « DH » (fr), « MAD » (en), « درهم » (ar).
export const CURRENCY_UNIT = "DH";

const NUMBER = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 12345.5 -> "12 345,50" (espaces normaux : lisibles aussi dans les PDF). Pour les colonnes « (DH) ». */
export function formatAmount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return NUMBER.format(value).replace(/[  ]/g, " ");
}

/** 12345.5 -> "12 345,50 DH" */
export function formatMoney(value: number | null | undefined, unit = CURRENCY_UNIT): string {
  const s = formatAmount(value);
  return s === "—" ? s : `${s} ${unit}`;
}
