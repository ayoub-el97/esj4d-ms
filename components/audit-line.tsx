import { History } from "lucide-react";
import type { RecordAuditInfo } from "@/lib/data/audit-info";
import { formatDateTimeFr } from "@/lib/dates";
import type { TFunction } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/** « Créé le … par … · Modifié le … par … · 3 photo(s) ajoutée(s), 1 retirée(s) » */
export function AuditLine({ info, t, className }: { info: RecordAuditInfo; t: TFunction; className?: string }) {
  const parts: string[] = [];
  if (info.created_at) parts.push(t("Créé le {date} par {user}", { date: formatDateTimeFr(info.created_at), user: info.created_by_email ?? t("système") }));
  if (info.updated_at) parts.push(t("Modifié le {date} par {user}", { date: formatDateTimeFr(info.updated_at), user: info.updated_by_email ?? t("système") }));
  if (info.photos_added || info.photos_removed) parts.push(t("{added} photo(s) ajoutée(s), {removed} retirée(s)", { added: info.photos_added, removed: info.photos_removed }));
  if (!parts.length) return null;
  return (
    <p className={cn("mt-3 flex items-start gap-1.5 text-xs text-muted-foreground", className)}>
      <History className="mt-0.5 size-3.5 shrink-0" /> <span>{parts.join(" · ")}</span>
    </p>
  );
}
