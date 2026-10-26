"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyError, getOptionalUser } from "@/lib/auth";
import { getReminders } from "@/lib/data/reminders";
import { nowHHMM, todayISO } from "@/lib/dates";
import { getT } from "@/lib/i18n/server";
import { occurrenceToComplete } from "@/lib/reminder-types";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const optDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().date("Date invalide.").nullable());

const schema = z
  .object({
    id: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().uuid().optional()),
    title: z.string().trim().min(1, "Indiquez le titre du rappel.").max(200),
    details: z.string().max(2000).default(""),
    frequency: z.enum(["once", "daily", "weekly", "weekdays", "monthly"], { message: "Fréquence invalide." }),
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
    month_day: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1, "Jour du mois invalide (1 à 31).").max(31, "Jour du mois invalide (1 à 31).").nullable()),
    remind_time: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (HH:MM).").nullable()),
    remind_date: z.string().date("Date de début invalide."),
    end_date: optDate,
    paused: z.boolean().default(false),
    priority: z.enum(["normal", "important", "urgent"]).default("normal"),
    notify_days_before: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().int().min(0, "Délai d'alerte invalide.").max(90, "Délai d'alerte invalide.")),
    shared: z.boolean().default(false),
  })
  .refine((d) => !["weekly", "weekdays"].includes(d.frequency) || d.weekdays.length > 0, { message: "Choisissez au moins un jour de la semaine.", path: ["weekdays"] })
  .refine((d) => d.frequency !== "weekly" || d.weekdays.length === 1, { message: "« Chaque semaine » : choisissez un seul jour (ou « Certains jours de la semaine »).", path: ["weekdays"] })
  .refine((d) => d.frequency !== "monthly" || d.month_day != null, { message: "Indiquez le jour du mois.", path: ["month_day"] })
  .refine((d) => !d.end_date || d.end_date >= d.remind_date, { message: "La date de fin ne peut pas précéder la date de début.", path: ["end_date"] })
  .transform((d) => ({
    ...d,
    weekdays: ["weekly", "weekdays"].includes(d.frequency) ? [...new Set(d.weekdays)].sort() : [],
    month_day: d.frequency === "monthly" ? d.month_day : null,
    end_date: d.frequency === "once" ? null : d.end_date,
    notify_days_before: d.frequency === "once" ? d.notify_days_before : 0,
  }));

function refresh() {
  // Le compteur d'alertes est affiché dans l'en-tête de toutes les pages
  revalidatePath("/", "layout");
}

const NOT_ALLOWED = "Seul l'auteur du rappel (ou l'administrateur pour un rappel partagé) peut le modifier.";

export async function saveReminder(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const user = await getOptionalUser();
  if (!user) return { ok: false, error: t("Session expirée : reconnectez-vous.") };
  const parsed = schema.safeParse({
    ...Object.fromEntries(formData),
    weekdays: formData.getAll("weekdays"),
    paused: formData.get("paused") === "on",
    shared: formData.get("shared") === "on",
  });
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  if (id) {
    // Règle modifiée : le report éventuel est levé
    const { data, error } = await supabase.from("reminders").update({ ...values, snoozed_until: null }).eq("id", id).select("id");
    if (error) return { ok: false, error: t(friendlyError(error.message)) };
    if (!data?.length) return { ok: false, error: t(NOT_ALLOWED) };
  } else {
    const { error } = await supabase.from("reminders").insert({ ...values, created_by: user.id });
    if (error) return { ok: false, error: t(friendlyError(error.message)) };
  }
  refresh();
  return { ok: true, message: id ? t("Rappel modifié.") : t("Rappel créé.") };
}

/** Termine l'occurrence due (les occurrences précédentes non terminées sont couvertes) ; les suivantes restent prévues. */
export async function completeReminder(id: string): Promise<ActionResult> {
  const t = await getT();
  const user = await getOptionalUser();
  if (!user) return { ok: false, error: t("Session expirée : reconnectez-vous.") };
  const r = (await getReminders()).find((x) => x.id === id);
  if (!r) return { ok: false, error: t("Rappel introuvable.") };
  const occurrence = occurrenceToComplete(r, todayISO(), nowHHMM());
  if (!occurrence) return { ok: false, error: t("Aucune occurrence à terminer (rappel arrivé à sa date de fin).") };
  const supabase = await createClient();
  const { error } = await supabase.from("reminder_completions").insert({ reminder_id: id, occurrence_date: occurrence, done_by: user.id });
  if (error && !error.message.includes("reminder_completions_uniq")) return { ok: false, error: t(friendlyError(error.message)) };
  if (r.snoozed_until) await supabase.from("reminders").update({ snoozed_until: null }).eq("id", id);
  refresh();
  return {
    ok: true,
    message: r.frequency === "once" ? t("Rappel terminé.") : t("Occurrence du {date} terminée ; le rappel reste programmé pour les prochaines dates.", { date: occurrence.split("-").reverse().join("/") }),
  };
}

/** Annule une occurrence terminée (le rappel redevient dû pour cette date). */
export async function undoCompletion(completionId: string): Promise<ActionResult> {
  const t = await getT();
  const supabase = await createClient();
  const { data, error } = await supabase.from("reminder_completions").delete().eq("id", completionId).select("id");
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  if (!data?.length) return { ok: false, error: t("Seul celui qui l'a terminée, l'auteur du rappel ou l'administrateur peut l'annuler.") };
  refresh();
  return { ok: true, message: t("Occurrence de nouveau à faire.") };
}

/** Reporte le rappel : masqué jusqu'à la date choisie, puis de nouveau dû. */
export async function snoozeReminder(id: string, until: string): Promise<ActionResult> {
  const t = await getT();
  if (!z.string().date().safeParse(until).success || until <= todayISO()) return { ok: false, error: t("Choisissez une date de report après aujourd'hui.") };
  const supabase = await createClient();
  const { data, error } = await supabase.from("reminders").update({ snoozed_until: until }).eq("id", id).select("id");
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  if (!data?.length) return { ok: false, error: t(NOT_ALLOWED) };
  refresh();
  return { ok: true, message: t("Rappel reporté au {date}.", { date: until.split("-").reverse().join("/") }) };
}

export async function setReminderPaused(id: string, paused: boolean): Promise<ActionResult> {
  const t = await getT();
  const supabase = await createClient();
  const { data, error } = await supabase.from("reminders").update({ paused }).eq("id", id).select("id");
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  if (!data?.length) return { ok: false, error: t(NOT_ALLOWED) };
  refresh();
  return { ok: true, message: paused ? t("Rappel mis en pause.") : t("Rappel réactivé.") };
}

export async function deleteReminder(id: string): Promise<ActionResult> {
  const t = await getT();
  const supabase = await createClient();
  const { data, error } = await supabase.from("reminders").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  if (!data?.length) return { ok: false, error: t(NOT_ALLOWED) };
  refresh();
  return { ok: true, message: t("Rappel supprimé.") };
}
