"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlarmClockOff, BellPlus, Check, Clock, Pause, Pencil, Play, Trash2, Users } from "lucide-react";
import { completeReminder, deleteReminder, saveReminder, setReminderPaused, snoozeReminder } from "@/lib/actions/reminders";
import type { ReminderWithStatus } from "@/lib/data/reminders";
import { formatDateFr } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/config";
import { FREQUENCY_LABELS, PRIORITY_LABELS, WEEKDAY_PICKER, addDaysISO, type Reminder, type ReminderFrequency, type ReminderState } from "@/lib/reminder-types";
import { WEEKDAY_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

const STATE_STYLE: Record<ReminderState, string> = {
  overdue: "border-s-red-500 bg-red-50 dark:bg-red-950/30",
  today: "border-s-orange-500 bg-orange-50 dark:bg-orange-950/30",
  later_today: "border-s-amber-400 bg-amber-50/60 dark:bg-amber-950/20",
  soon: "border-s-amber-400 bg-amber-50 dark:bg-amber-950/30",
  upcoming: "border-s-slate-300",
  snoozed: "border-s-sky-300 opacity-80",
  paused: "border-s-slate-300 opacity-60",
  done: "border-s-emerald-500 opacity-70",
  ended: "border-s-slate-300 opacity-60",
};
const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-red-600 text-white",
  important: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
};

/** Règle lisible : « Tous les jours », « Lundi, Jeudi », « Le 15 de chaque mois », « Une seule fois ». */
export function ruleLabel(t: TFunction, r: Pick<Reminder, "frequency" | "weekdays" | "month_day" | "remind_date" | "remind_time">): string {
  const time = r.remind_time ? ` · ${t("à {time}", { time: r.remind_time })}` : "";
  switch (r.frequency) {
    case "once":
      return t("Le {date}", { date: formatDateFr(r.remind_date) }) + time;
    case "daily":
      return t("Tous les jours") + time;
    case "weekly":
    case "weekdays":
      return (
        (r.frequency === "weekly" ? t("Chaque semaine") + " : " : "") +
        WEEKDAY_PICKER.filter((d) => r.weekdays.includes(d))
          .map((d) => t(WEEKDAY_LABELS[d]))
          .join(", ") +
        time
      );
    case "monthly":
      return t("Le {day} de chaque mois", { day: r.month_day ?? 1 }) + time;
  }
}

/** Échéance lisible selon l'état du jour. */
export function statusLabel(t: TFunction, r: ReminderWithStatus): string {
  const s = r.status;
  switch (s.state) {
    case "overdue":
      return s.missed > 1 ? t("En retard depuis le {date} ({count} occurrences)", { date: formatDateFr(s.due), count: s.missed }) : t("En retard depuis le {date}", { date: formatDateFr(s.due) });
    case "today":
      return t("Aujourd'hui");
    case "later_today":
      return t("Aujourd'hui à {time}", { time: r.remind_time ?? "" });
    case "soon":
      return s.days === 1 ? t("Demain") : t("Dans {count} jours", { count: s.days });
    case "upcoming":
      return s.days === 1 ? t("Prochaine fois : demain") : t("Prochaine fois : {date}", { date: formatDateFr(s.due) });
    case "snoozed":
      return t("Reporté au {date}", { date: formatDateFr(s.due) });
    case "paused":
      return t("En pause");
    case "done":
      return t("Terminé");
    case "ended":
      return t("Terminé (date de fin atteinte)");
  }
}

export function RemindersPanel({ reminders, today, emptyText, hideCreate = false }: { reminders: ReminderWithStatus[]; today: string; emptyText?: string; hideCreate?: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [editing, setEditing] = useState<Reminder | "new" | null>(null);
  const [snoozing, setSnoozing] = useState<ReminderWithStatus | null>(null);
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
      {!hideCreate && (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => setEditing("new")}>
            <BellPlus /> {t("Nouveau rappel")}
          </Button>
        </div>
      )}
      {reminders.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{emptyText ?? t("Aucun rappel.")}</p>}
      <ul className="space-y-2">
        {reminders.map((r) => {
          const st = r.status.state;
          const canManage = r.mine || r.shared;
          const actionable = st !== "done" && st !== "ended";
          return (
            <li key={r.id} className={cn("flex items-start gap-3 rounded-lg border border-s-4 bg-card p-3", STATE_STYLE[st])}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cn("font-medium", st === "done" && "line-through")}>{r.title}</span>
                  {r.priority !== "normal" && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", PRIORITY_STYLE[r.priority])}>{t(PRIORITY_LABELS[r.priority])}</span>}
                  {r.shared && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      <Users className="size-3" /> {t("Partagé")}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {ruleLabel(t, r)} · <span className={cn((st === "overdue" || st === "today") && "font-semibold text-foreground", st === "overdue" && "text-red-700 dark:text-red-400")}>{statusLabel(t, r)}</span>
                  {r.last_done && r.frequency !== "once" && <> · {t("dernière fois terminé le {date}", { date: formatDateFr(r.last_done.occurrence) })}</>}
                  {r.end_date && <> · {t("jusqu'au {date}", { date: formatDateFr(r.end_date) })}</>}
                </div>
                {r.details && <p className="mt-1 whitespace-pre-line text-sm">{r.details}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {actionable && st !== "paused" && (
                  <Button type="button" variant="outline" size="sm" disabled={pending} title={t("Marquer comme terminé")} onClick={() => run(() => completeReminder(r.id))}>
                    <Check /> <span className="hidden sm:inline">{t("Terminé")}</span>
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={t("Actions")} disabled={pending}>
                    <span aria-hidden className="text-lg leading-none">⋯</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {actionable && st !== "paused" && (
                      <DropdownMenuItem onClick={() => run(() => completeReminder(r.id))}>
                        <Check /> {t("Marquer comme terminé")}
                      </DropdownMenuItem>
                    )}
                    {canManage && actionable && (
                      <DropdownMenuItem onClick={() => setSnoozing(r)}>
                        <Clock /> {t("Reporter")}
                      </DropdownMenuItem>
                    )}
                    {canManage && (
                      <DropdownMenuItem onClick={() => setEditing(r)}>
                        <Pencil /> {t("Modifier")}
                      </DropdownMenuItem>
                    )}
                    {canManage && st !== "done" && (
                      <DropdownMenuItem onClick={() => run(() => setReminderPaused(r.id, !r.paused))}>
                        {r.paused ? <Play /> : <Pause />} {r.paused ? t("Réactiver") : t("Mettre en pause")}
                      </DropdownMenuItem>
                    )}
                    {canManage && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => window.confirm(t("Supprimer ce rappel et son historique ?")) && run(() => deleteReminder(r.id))}>
                          <Trash2 /> {t("Supprimer")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
      </ul>
      {editing && <ReminderDialog reminder={editing === "new" ? null : editing} defaultDate={today} onClose={closeDialog} />}
      {snoozing && <SnoozeDialog reminder={snoozing} today={today} pending={pending} onClose={() => setSnoozing(null)} onConfirm={(d) => run(() => snoozeReminder(snoozing.id, d).then((x) => (x.ok && setSnoozing(null), x)))} />}
    </div>
  );
}

function SnoozeDialog({ reminder, today, pending, onClose, onConfirm }: { reminder: ReminderWithStatus; today: string; pending: boolean; onClose: () => void; onConfirm: (date: string) => void }) {
  const { t } = useT();
  const [date, setDate] = useState(addDaysISO(today, 1));
  const quick = [
    { label: t("Demain"), d: addDaysISO(today, 1) },
    { label: t("Dans 3 jours"), d: addDaysISO(today, 3) },
    { label: t("Dans une semaine"), d: addDaysISO(today, 7) },
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle className="flex items-center gap-2">
          <AlarmClockOff className="size-4" /> {t("Reporter « {title} »", { title: reminder.title })}
        </DialogTitle>
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <Button key={q.d} type="button" variant="outline" size="sm" disabled={pending} onClick={() => onConfirm(q.d)}>
              {q.label}
            </Button>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="snooze_date">{t("Ou choisir une date")}</Label>
          <div className="flex gap-2">
            <Input id="snooze_date" type="date" min={addDaysISO(today, 1)} value={date} onChange={(e) => setDate(e.target.value)} />
            <Button type="button" disabled={pending || !date} onClick={() => onConfirm(date)}>
              {t("Reporter")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("Le rappel est masqué jusqu'à cette date, puis réapparaît s'il n'est pas terminé.")}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReminderDialog({ reminder, defaultDate, onClose }: { reminder: Reminder | null; defaultDate: string; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(saveReminder, null);
  const [frequency, setFrequency] = useState<ReminderFrequency>(reminder?.frequency ?? "once");
  const [days, setDays] = useState<number[]>(reminder?.weekdays ?? [new Date(`${defaultDate}T00:00:00Z`).getUTCDay()]);

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  const toggleDay = (d: number) => setDays((prev) => (frequency === "weekly" ? [d] : prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{reminder ? t("Modifier le rappel") : t("Nouveau rappel")}</DialogTitle>
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={reminder?.id ?? ""} />
          {state && !state.ok && <ActionMessage state={state} />}
          <div className="space-y-1">
            <Label htmlFor="title">{t("Titre du rappel")}</Label>
            <Input id="title" name="title" defaultValue={reminder?.title ?? ""} placeholder={t("Ex. : vérifier les fiches de pointage de la semaine")} required maxLength={200} autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="details">{t("Description (facultatif)")}</Label>
            <Textarea id="details" name="details" defaultValue={reminder?.details ?? ""} rows={2} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="frequency">{t("Fréquence")}</Label>
              <NativeSelect
                id="frequency"
                name="frequency"
                value={frequency}
                onChange={(e) => {
                  const f = e.target.value as ReminderFrequency;
                  setFrequency(f);
                  if (f === "weekly" && days.length !== 1) setDays(days.slice(0, 1).length ? days.slice(0, 1) : [6]);
                }}
              >
                {(Object.keys(FREQUENCY_LABELS) as ReminderFrequency[]).map((f) => (
                  <option key={f} value={f}>
                    {t(FREQUENCY_LABELS[f])}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="priority">{t("Priorité")}</Label>
              <NativeSelect id="priority" name="priority" defaultValue={reminder?.priority ?? "normal"}>
                {Object.entries(PRIORITY_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {t(l)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {(frequency === "weekly" || frequency === "weekdays") && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">{frequency === "weekly" ? t("Jour de rappel") : t("Jours de rappel")}</legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_PICKER.map((d) => (
                  <label key={d} className={cn("cursor-pointer rounded-md border px-2.5 py-1.5 text-sm", days.includes(d) ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                    <input type="checkbox" name="weekdays" value={d} checked={days.includes(d)} onChange={() => toggleDay(d)} className="sr-only" />
                    {t(WEEKDAY_LABELS[d])}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {frequency === "monthly" && (
            <div className="space-y-1">
              <Label htmlFor="month_day">{t("Jour du mois")}</Label>
              <Input id="month_day" name="month_day" type="number" min={1} max={31} defaultValue={reminder?.month_day ?? Number(defaultDate.slice(8, 10))} className="w-24" required />
              <p className="text-xs text-muted-foreground">{t("29, 30 ou 31 : le dernier jour des mois plus courts.")}</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="remind_date">{frequency === "once" ? t("Date") : t("Date de début")}</Label>
              <Input id="remind_date" name="remind_date" type="date" defaultValue={reminder?.remind_date ?? defaultDate} required />
            </div>
            {frequency !== "once" ? (
              <div className="space-y-1">
                <Label htmlFor="end_date">{t("Date de fin (facultatif)")}</Label>
                <Input id="end_date" name="end_date" type="date" defaultValue={reminder?.end_date ?? ""} />
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="notify_days_before">{t("M'alerter (jours avant)")}</Label>
                <Input id="notify_days_before" name="notify_days_before" type="number" min={0} max={90} defaultValue={reminder?.notify_days_before ?? 3} />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="remind_time">{t("Heure du rappel (facultatif)")}</Label>
              <Input id="remind_time" name="remind_time" type="time" defaultValue={reminder?.remind_time ?? ""} />
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="paused" defaultChecked={reminder?.paused ?? false} className="size-4" /> {t("En pause")}
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="shared" defaultChecked={reminder?.shared ?? false} className="mt-0.5 size-4" />
              <span>
                {t("Partager avec tous les utilisateurs")}
                <span className="block text-xs text-muted-foreground">{t("Sinon, vous êtes le seul à voir ce rappel.")}</span>
              </span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("Le rappel apparaît sur l'accueil à l'ouverture de l'application le jour prévu (à partir de l'heure choisie). S'il n'est pas terminé, il reste affiché « en retard » les jours suivants.")}
          </p>
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
