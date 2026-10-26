"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { undoCompletion } from "@/lib/actions/reminders";
import type { CompletionLog } from "@/lib/data/reminders";
import { formatDateFr, formatDateTimeFr } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

/** Occurrences terminées : rappel, date de l'occurrence, qui et quand ; annulation possible. */
export function CompletionsList({ items }: { items: CompletionLog[] }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!items.length) return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{t("Aucun rappel terminé.")}</p>;
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {items.map((c) => (
        <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{c.title}</div>
            <div className="text-xs text-muted-foreground">
              {t("Occurrence du {date} — terminée le {at} par {name}", { date: formatDateFr(c.occurrence_date), at: formatDateTimeFr(c.done_at), name: c.done_by_name || "—" })}
            </div>
          </div>
          {c.can_undo && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await undoCompletion(c.id);
                  if (r.ok) {
                    toast.success(r.message);
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              <RotateCcw /> {t("Annuler")}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
