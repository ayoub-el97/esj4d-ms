"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellPlus, Check, Pencil, RotateCcw, Trash2, Users } from "lucide-react";
import { deleteReminder, saveReminder, setReminderDone } from "@/lib/actions/reminders";
import { formatDateFr } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import { reminderState, type Reminder, type ReminderState } from "@/lib/reminder-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

const STATE_STYLE: Record<ReminderState, string> = {
  overdue: "border-s-red-500 bg-red-50 dark:bg-red-950/30",
  today: "border-s-orange-500 bg-orange-50 dark:bg-orange-950/30",
  soon: "border-s-amber-400 bg-amber-50 dark:bg-amber-950/30",
  upcoming: "border-s-slate-300",
  done: "border-s-emerald-500 opacity-70",
};

/** Libellé d'échéance : « En retard de 2 jours », « Aujourd'hui », « Dans 3 jours »… */
export function useDueLabel() {
  const { t } = useT();
  return (state: ReminderState, days: number) => {
    if (state === "done") return t("Fait");
    if (state === "overdue") return days === -1 ? t("En retard d'un jour") : t("En retard de {count} jours", { count: -days });
    if (state === "today") return t("Aujourd'hui");
    if (days === 1) return t("Demain");
    return t("Dans {count} jours", { count: days });
  };
}

export function RemindersPanel({ reminders, today, emptyText }: { reminders: Reminder[]; today: string; emptyText?: string }) {
  const { t } = useT();
  const router = useRouter();
  const dueLabel = useDueLabel();
  const [editing, setEditing] = useState<Reminder | "new" | null>(null);
  const closeDialog = useCallback(() => setEditing(null), []);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (r.message) toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => setEditing("new")}>
          <BellPlus /> {t("Nouveau rappel")}
        </Button>
      </div>
      {reminders.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{emptyText ?? t("Aucun rappel.")}</p>}
      <ul className="space-y-2">
        {reminders.map((r) => {
          const { state, days } = reminderState(r, today);
          return (
            <li key={r.id} className={cn("flex items-start gap-3 rounded-lg border border-s-4 bg-card p-3", STATE_STYLE[state])}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cn("font-medium", state === "done" && "line-through")}>{r.title}</span>
                  {r.shared && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      <Users className="size-3" /> {t("Partagé")}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateFr(r.remind_date)} · <span className={cn((state === "overdue" || state === "today") && "font-semibold text-foreground")}>{dueLabel(state, days)}</span>
                  {state === "upcoming" && ` · ${t("alerte {count} j avant", { count: r.notify_days_before })}`}
                </div>
                {r.details && <p className="mt-1 whitespace-pre-line text-sm">{r.details}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                {state === "done" ? (
                  <Button type="button" variant="ghost" size="icon-sm" disabled={pending} aria-label={t("Réactiver")} title={t("Réactiver")} onClick={() => run(() => setReminderDone(r.id, false))}>
                    <RotateCcw />
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="icon-sm" disabled={pending} aria-label={t("Marquer comme fait")} title={t("Marquer comme fait")} onClick={() => run(() => setReminderDone(r.id, true))}>
                    <Check />
                  </Button>
                )}
                {(r.mine || r.shared) && (
                  <>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Modifier")} title={t("Modifier")} onClick={() => setEditing(r)}>
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      aria-label={t("Supprimer")}
                      title={t("Supprimer")}
                      onClick={() => window.confirm(t("Supprimer ce rappel ?")) && run(() => deleteReminder(r.id))}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {editing && <ReminderDialog reminder={editing === "new" ? null : editing} defaultDate={today} onClose={closeDialog} />}
    </div>
  );
}

function ReminderDialog({ reminder, defaultDate, onClose }: { reminder: Reminder | null; defaultDate: string; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(saveReminder, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{reminder ? t("Modifier le rappel") : t("Nouveau rappel")}</DialogTitle>
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={reminder?.id ?? ""} />
          {state && !state.ok && <ActionMessage state={state} />}
          <div className="space-y-1">
            <Label htmlFor="title">{t("Objet")}</Label>
            <Input id="title" name="title" defaultValue={reminder?.title ?? ""} placeholder={t("Ex. : visite technique du camion 77027-A-1")} required maxLength={200} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="remind_date">{t("Date")}</Label>
              <Input id="remind_date" name="remind_date" type="date" defaultValue={reminder?.remind_date ?? defaultDate} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="notify_days_before">{t("M'alerter (jours avant)")}</Label>
              <Input id="notify_days_before" name="notify_days_before" type="number" min={0} max={90} defaultValue={reminder?.notify_days_before ?? 3} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="details">{t("Détails (facultatif)")}</Label>
            <Textarea id="details" name="details" defaultValue={reminder?.details ?? ""} rows={3} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="shared" defaultChecked={reminder?.shared ?? false} className="mt-0.5 size-4" />
            <span>
              {t("Partager avec tous les utilisateurs")}
              <span className="block text-xs text-muted-foreground">{t("Sinon, vous êtes le seul à voir ce rappel.")}</span>
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("Annuler")}
            </Button>
            <SubmitButton>{t("Enregistrer")}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
