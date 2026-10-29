import { History } from "lucide-react";
import type { ChangeEntry } from "@/lib/data/history";
import { formatDateTimeFr } from "@/lib/dates";
import type { TFunction } from "@/lib/i18n/config";

/** Champ suivi : clé en base, libellé (clé de traduction) et mise en forme facultative. */
export type ChangeField = { key: string; label: string; format?: (v: unknown) => string };

const plain = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/**
 * Journal des modifications d'un rapport : pour chaque enregistrement, champ modifié,
 * valeur précédente → nouvelle valeur, utilisateur, date et heure. Du plus récent au plus ancien.
 */
export function ChangeLog({
  t,
  entries,
  fields,
  title = "Journal des modifications",
  describe,
  actionText,
}: {
  t: TFunction;
  entries: ChangeEntry[];
  fields: ChangeField[];
  title?: string;
  /** Ligne concernée (ex. nom de l'agent) */
  describe?: (e: ChangeEntry) => string;
  /** Texte d'une création / suppression (sinon « Création de l'enregistrement » / « Enregistrement supprimé ») */
  actionText?: (e: ChangeEntry) => string | undefined;
}) {
  const items = entries
    .map((e) => {
      const changes =
        e.action === "UPDATE"
          ? fields
              .filter((f) => JSON.stringify(e.old_data?.[f.key] ?? null) !== JSON.stringify(e.new_data?.[f.key] ?? null))
              .map((f) => ({ label: t(f.label), before: (f.format ?? plain)(e.old_data?.[f.key]), after: (f.format ?? plain)(e.new_data?.[f.key]) }))
          : [];
      return { e, changes };
    })
    .filter((x) => x.e.action !== "UPDATE" || x.changes.length);
  if (!items.length) return null;
  return (
    <details className="mt-6 rounded-xl border bg-card p-4 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold">
        <History className="size-4" /> {t(title)} ({items.length})
      </summary>
      <ol className="mt-3 space-y-2">
        {items.map(({ e, changes }, i) => (
          <li key={i} className="border-s-2 border-primary/30 ps-2">
            {describe && <div className="font-medium">{describe(e)}</div>}
            {e.action !== "UPDATE" && actionText?.(e) ? (
              <div>{actionText(e)}</div>
            ) : e.action === "INSERT" ? (
              <div>{t("Création de l'enregistrement")}</div>
            ) : e.action === "DELETE" ? (
              <div>{t("Enregistrement supprimé")}</div>
            ) : (
              <ul className="space-y-0.5">
                {changes.map((c, k) => (
                  <li key={k}>
                    <span className="text-muted-foreground">{c.label} :</span> <s className="text-muted-foreground">{c.before}</s> → <strong>{c.after}</strong>
                  </li>
                ))}
              </ul>
            )}
            <div className="text-xs text-muted-foreground">
              {formatDateTimeFr(e.at)} · <span dir="ltr">{e.user_email ?? t("système")}</span>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
