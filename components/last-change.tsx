import { PencilLine } from "lucide-react";
import { formatDateTimeFr } from "@/lib/dates";
import type { TFunction } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/** Badge « Modifié » : l'enregistrement a été corrigé après sa première saisie. */
export function ModifiedBadge({ t, className, iconOnly = false }: { t: TFunction; className?: string; /** Tableau compact : icône seule (libellé en infobulle) */ iconOnly?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-900 dark:bg-orange-950 dark:text-orange-200", className)} title={t("Modifié après la première saisie (voir le journal des modifications)")}>
      <PencilLine className="size-3" /> {iconOnly ? <span className="sr-only">{t("Modifié")}</span> : t("Modifié")}
    </span>
  );
}

/** « Dernière modification : 29/10/2026 10:12 par … » + badge « Modifié ». */
export function LastChange({ t, at, user, modified, className }: { t: TFunction; at: string | null; user: string | null; modified: boolean; className?: string }) {
  if (!at) return null;
  return (
    <p className={cn("flex flex-wrap items-center gap-2 text-xs text-muted-foreground", className)}>
      <span>
        {t("Dernière modification")} : {formatDateTimeFr(at)} · <span dir="ltr">{user ?? t("système")}</span>
      </span>
      {modified && <ModifiedBadge t={t} />}
    </p>
  );
}
