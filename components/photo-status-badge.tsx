"use client";

import { Camera, CheckCircle2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * État des photos AVANT / APRÈS d'un enregistrement, pour repérer d'un coup d'œil
 * ce qu'il reste à compléter (ex. : photos avant à 07:00, photos après en fin de travail).
 */
export function PhotoStatusBadge({ before, after, className }: { before: number; after: number; className?: string }) {
  const { t } = useT();
  const missingAfter = before > 0 && after === 0;
  const complete = before > 0 && after > 0;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        complete ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : missingAfter ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {complete ? <CheckCircle2 className="size-3" /> : <Camera className="size-3" />}
      {missingAfter ? t("{before} avant · après à ajouter", { before }) : t("{before} avant · {after} après", { before, after })}
    </span>
  );
}

/** Vrai si des photos AVANT existent sans photos APRÈS. */
export const needsAfterPhotos = (before: number, after: number) => before > 0 && after === 0;
