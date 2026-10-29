"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Modifications non enregistrées d'un formulaire : avertissement avant de quitter la page
 * (et avant de changer de date avec le sélecteur de date). `markDirty` sur onChange du formulaire,
 * `clear` après un enregistrement réussi.
 */
export function useUnsavedChanges() {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const w = window as unknown as { __pointageDirty?: boolean };
    w.__pointageDirty = dirty;
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      w.__pointageDirty = false;
    };
  }, [dirty]);
  const markDirty = useCallback(() => setDirty(true), []);
  const clear = useCallback(() => setDirty(false), []);
  return { dirty, markDirty, clear };
}
