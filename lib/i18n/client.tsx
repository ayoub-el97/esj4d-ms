"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type Locale, type Messages, type TFunction } from "./config";

const I18nContext = createContext<{ locale: Locale; t: TFunction }>({ locale: "fr", t: makeT(null) });

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages | null; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(messages) }), [locale, messages]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

/** Traduction dans les composants client : const { t, locale } = useT(); */
export function useT() {
  return useContext(I18nContext);
}
