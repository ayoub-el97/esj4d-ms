// Numéros WhatsApp : format international, chiffres uniquement (module pur).

/**
 * Normalise un numéro au format attendu par l'API (indicatif pays compris, sans « + » ni espaces).
 * « +212 6 12 34 56 78 » ou « 00212612345678 » → « 212612345678 ».
 * Renvoie une erreur (clé de traduction) si le numéro n'est pas au format international.
 */
export function normalizeWhatsAppNumber(input: string): { ok: true; number: string } | { ok: false; error: string } {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "Numéro manquant." };
  let digits = raw.replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) return { ok: false, error: "Indiquez le numéro au format international avec l'indicatif du pays (ex. +212 6 12 34 56 78), sans le 0 initial." };
  if (!/^\d+$/.test(digits)) return { ok: false, error: "Le numéro ne doit contenir que des chiffres (et éventuellement + au début)." };
  if (digits.length < 8 || digits.length > 15) return { ok: false, error: "Numéro invalide : 8 à 15 chiffres, indicatif du pays compris." };
  // Maroc : 212 + 9 chiffres (6…, 7… ou 5…), sans le 0
  if (digits.startsWith("2120")) return { ok: false, error: "Numéro marocain : retirez le 0 après l'indicatif 212 (ex. 212612345678)." };
  if (digits.startsWith("212") && digits.length !== 12) return { ok: false, error: "Numéro marocain invalide : 212 suivi de 9 chiffres." };
  return { ok: true, number: digits };
}

/** Affichage masqué d'un numéro : « +212 6•• ••• •78 ». */
export function maskNumber(n: string): string {
  if (!n) return "";
  if (!/^\d+$/.test(n)) return n.length > 10 ? `${n.slice(0, 6)}…${n.slice(-4)}` : n;
  return `+${n.slice(0, 4)}${"•".repeat(Math.max(0, n.length - 6))}${n.slice(-2)}`;
}

/** Texte d'une variable de modèle WhatsApp : pas de retour à la ligne, de tabulation ni de 4 espaces consécutifs. */
export function templateParam(text: string, max = 1000): string {
  return text
    .replace(/[\r\n\t]+/g, " · ")
    .replace(/ {4,}/g, "   ")
    .trim()
    .slice(0, max);
}
