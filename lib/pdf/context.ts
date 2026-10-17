import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { makeT, type Locale, type TFunction } from "@/lib/i18n/config";

/**
 * Contexte partagé par tous les modèles PDF : traduction, langue, logo de la société.
 * React.createContext n'est pas disponible côté serveur (RSC) : on utilise un stockage
 * propre à chaque requête (AsyncLocalStorage), isolé entre requêtes simultanées.
 */
export type PdfContextValue = { t: TFunction; locale: Locale; logoUrl: string | null; projectStart: string | null };

const DEFAULT: PdfContextValue = { t: makeT(null), locale: "fr", logoUrl: null, projectStart: null };
const storage = new AsyncLocalStorage<PdfContextValue>();

export function runWithPdfContext<T>(value: PdfContextValue, fn: () => T): T {
  return storage.run(value, fn);
}

export function usePdf(): PdfContextValue {
  return storage.getStore() ?? DEFAULT;
}
