import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getOptionalUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { isAlert, reminderState, type Reminder } from "@/lib/reminder-types";

/** Rappels visibles par l'utilisateur (les siens + les rappels partagés), RLS appliquée. */
export async function getReminders(opts: { includeDone?: boolean } = {}): Promise<Reminder[]> {
  const [supabase, user] = await Promise.all([createClient(), getOptionalUser()]);
  if (!user) return [];
  let q = supabase.from("reminders").select("id, title, details, remind_date, notify_days_before, shared, done_at, created_by").order("remind_date").order("created_at").limit(500);
  if (!opts.includeDone) q = q.is("done_at", null);
  const { data } = await q;
  return (data ?? []).map((r) => ({ ...r, mine: r.created_by === user.id }));
}

/** Rappels qui doivent alerter aujourd'hui (en retard, du jour, ou date proche). */
export async function getReminderAlerts(): Promise<Reminder[]> {
  const today = todayISO();
  const list = await getReminders();
  return list.filter((r) => isAlert(reminderState(r, today).state));
}
