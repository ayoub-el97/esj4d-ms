import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, makeT, type Locale, type Messages, type TFunction } from "./config";
import { en } from "./messages/en";
import { ar } from "./messages/ar";

const DICTIONARIES: Record<Locale, Messages | null> = { fr: null, en, ar };

export function getMessages(locale: Locale): Messages | null {
  return DICTIONARIES[locale];
}

/** Langue de l'utilisateur (cookie), français par défaut. */
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

/** Fonction de traduction pour la langue de la requête en cours. */
export async function getT(): Promise<TFunction> {
  return makeT(getMessages(await getLocale()));
}

export async function getI18n(): Promise<{ t: TFunction; locale: Locale }> {
  const locale = await getLocale();
  return { t: makeT(getMessages(locale)), locale };
}

/** Titre d'onglet traduit : export const generateMetadata = pageTitle("Pointage"); */
export function pageTitle(key: string) {
  return async () => ({ title: (await getT())(key) });
}

/** Les PDF arabes nécessiteraient une police et une mise en page RTL : ils sont produits en français. */
export function pdfLocale(locale: Locale): Locale {
  return locale === "ar" ? "fr" : locale;
}
