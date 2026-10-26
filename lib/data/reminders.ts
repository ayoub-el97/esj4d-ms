import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getOptionalUser } from "@/lib/auth";
import { APP_TIME_ZONE, nowHHMM, todayISO } from "@/lib/dates";
import { isAlert, reminderStatus, type Reminder, type ReminderFrequency, type ReminderPriority, type ReminderStatus } from "@/lib/reminder-types";

const COLUMNS = "id, title, details, remind_date, notify_days_before, shared, created_by, frequency, weekdays, month_day, remind_time, end_date, paused, priority, snoozed_until";

export type ReminderWithStatus = Reminder & { status: ReminderStatus };

type Row = Omit<Reminder, "mine" | "last_done" | "remind_time"> & { remind_time: string | null };

/** Rappels visibles par l'utilisateur (les siens + les partagés), avec leur dernière occurrence terminée. */
export async function getReminders(): Promise<Reminder[]> {
  const [supabase, user] = await Promise.all([createClient(), getOptionalUser()]);
  if (!user) return [];
  const { data } = await supabase.from("reminders").select(COLUMNS).order("remind_date").order("created_at").limit(500);
  const rows = (data ?? []) as Row[];
  if (!rows.length) return [];
  const { data: done } = await supabase
    .from("reminder_completions")
    .select("reminder_id, occurrence_date, done_at, done_by")
    .in("reminder_id", rows.map((r) => r.id))
    .order("occurrence_date", { ascending: false })
    .limit(2000);
  const last = new Map<string, { occurrence: string; at: string; by: string }>();
  for (const c of done ?? []) if (!last.has(c.reminder_id)) last.set(c.reminder_id, { occurrence: c.occurrence_date, at: c.done_at, by: c.done_by });
  return rows.map((r) => ({
    ...r,
    frequency: (r.frequency ?? "once") as ReminderFrequency,
    priority: (r.priority ?? "normal") as ReminderPriority,
    weekdays: (r.weekdays ?? []).map(Number),
    remind_time: r.remind_time ? r.remind_time.slice(0, 5) : null,
    mine: r.created_by === user.id,
    last_done: last.get(r.id) ?? null,
  }));
}

const ORDER: Record<string, number> = { overdue: 0, today: 1, later_today: 2, soon: 3, upcoming: 4, snoozed: 5, paused: 6, ended: 7, done: 8 };
const PRIO: Record<string, number> = { urgent: 0, important: 1, normal: 2 };

/** Rappels avec leur état du jour (fuseau Africa/Casablanca), triés : en retard, du jour, puis à venir. */
export async function getRemindersWithStatus(): Promise<{ list: ReminderWithStatus[]; today: string; now: string }> {
  const today = todayISO();
  const now = nowHHMM();
  const list = (await getReminders()).map((r) => ({ ...r, status: reminderStatus(r, today, now) }));
  list.sort((a, b) => ORDER[a.status.state] - ORDER[b.status.state] || PRIO[a.priority] - PRIO[b.priority] || (a.status.due ?? "9").localeCompare(b.status.due ?? "9"));
  return { list, today, now };
}

/** Rappels à traiter (cloche de l'en-tête) : en retard, du jour, ou proches. */
export async function getReminderAlerts(): Promise<ReminderWithStatus[]> {
  const { list } = await getRemindersWithStatus();
  return list.filter((r) => isAlert(r.status.state));
}

export type CompletionLog = { id: string; reminder_id: string; title: string; occurrence_date: string; done_at: string; done_by_name: string; can_undo: boolean };

/** Occurrences terminées récemment (qui, quand), pour l'onglet « Terminés ». */
export async function getCompletions(limit = 100): Promise<CompletionLog[]> {
  const [supabase, user] = await Promise.all([createClient(), getOptionalUser()]);
  if (!user) return [];
  const { data } = await supabase.from("reminder_completions").select("id, reminder_id, occurrence_date, done_at, done_by").order("done_at", { ascending: false }).limit(limit);
  const rows = data ?? [];
  if (!rows.length) return [];
  const [{ data: rem }, { data: profiles }] = await Promise.all([
    supabase.from("reminders").select("id, title, created_by").in("id", [...new Set(rows.map((r) => r.reminder_id))]),
    supabase.from("profiles").select("id, full_name, email").in("id", [...new Set(rows.map((r) => r.done_by))]),
  ]);
  const remById = new Map((rem ?? []).map((r) => [r.id as string, r]));
  const names = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string) || (p.email as string)]));
  return rows.map((c) => ({
    id: c.id,
    reminder_id: c.reminder_id,
    title: remById.get(c.reminder_id)?.title ?? "—",
    occurrence_date: c.occurrence_date,
    done_at: c.done_at,
    done_by_name: names.get(c.done_by) ?? "",
    can_undo: c.done_by === user.id || remById.get(c.reminder_id)?.created_by === user.id || user.role === "admin",
  }));
}

/** Nombre d'occurrences terminées aujourd'hui (tableau de bord). */
export async function countCompletedToday(): Promise<number> {
  const supabase = await createClient();
  const today = todayISO();
  // Date de fin dans le fuseau du Maroc (le décalage horaire varie dans l'année)
  const { data } = await supabase.from("reminder_completions").select("done_at").gte("done_at", new Date(Date.now() - 2 * 86400000).toISOString()).limit(1000);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  return (data ?? []).filter((c) => fmt.format(new Date(c.done_at)) === today).length;
}
