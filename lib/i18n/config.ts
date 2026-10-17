// Configuration des langues (utilisable côté client et serveur).
// Les textes source sont en français : la clé de traduction EST le texte français.
// Une clé absente d'un dictionnaire s'affiche en français (repli sûr).

export const LOCALES = ["fr", "en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
};

export const LOCALE_DIR: Record<Locale, "ltr" | "rtl"> = { fr: "ltr", en: "ltr", ar: "rtl" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export type Messages = Record<string, string>;
export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

/** Traduit une clé (texte français) et remplace les variables {nom}. */
export function translate(messages: Messages | null, key: string, vars?: Record<string, string | number>): string {
  const template = (messages && messages[key]) || key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export function makeT(messages: Messages | null): TFunction {
  return (key, vars) => translate(messages, key, vars);
}
