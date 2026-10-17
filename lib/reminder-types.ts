// Types et règles des rappels, utilisables côté serveur et navigateur.
import { daysUntil } from "@/lib/dates";

export type Reminder = {
  id: string;
  title: string;
  details: string;
  remind_date: string;
  notify_days_before: number;
  shared: boolean;
  done_at: string | null;
  created_by: string;
  mine: boolean;
};

/**
 * État d'un rappel :
 *   overdue  : date passée, non fait
 *   today    : c'est aujourd'hui
 *   soon     : dans la fenêtre d'alerte (≤ notify_days_before jours)
 *   upcoming : plus tard
 *   done     : marqué comme fait
 */
export type ReminderState = "overdue" | "today" | "soon" | "upcoming" | "done";

export function reminderState(r: Pick<Reminder, "remind_date" | "notify_days_before" | "done_at">, today: string): { state: ReminderState; days: number } {
  const days = daysUntil(r.remind_date, today);
  if (r.done_at) return { state: "done", days };
  if (days < 0) return { state: "overdue", days };
  if (days === 0) return { state: "today", days };
  if (days <= r.notify_days_before) return { state: "soon", days };
  return { state: "upcoming", days };
}

/** Un rappel déclenche une alerte s'il est en retard, du jour ou dans sa fenêtre d'alerte. */
export const isAlert = (s: ReminderState) => s === "overdue" || s === "today" || s === "soon";
