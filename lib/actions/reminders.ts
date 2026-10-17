"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyError, getOptionalUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const schema = z.object({
  id: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().uuid().optional()),
  title: z.string().trim().min(1, "Indiquez l'objet du rappel.").max(200),
  details: z.string().max(2000).default(""),
  remind_date: z.string().date("Date invalide."),
  notify_days_before: z.preprocess((v) => (v === "" || v == null ? 3 : Number(v)), z.number().int().min(0, "Délai d'alerte invalide.").max(90, "Délai d'alerte invalide.")),
  shared: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

function refresh() {
  // Le compteur d'alertes est affiché dans l'en-tête de toutes les pages
  revalidatePath("/", "layout");
}

export async function saveReminder(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const user = await getOptionalUser();
  if (!user) return { ok: false, error: t("Session expirée : reconnectez-vous.") };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = id ? await supabase.from("reminders").update(values).eq("id", id) : await supabase.from("reminders").insert({ ...values, created_by: user.id });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  refresh();
  return { ok: true, message: id ? t("Rappel modifié.") : t("Rappel créé.") };
}

export async function setReminderDone(id: string, done: boolean): Promise<ActionResult> {
  const t = await getT();
  const user = await getOptionalUser();
  if (!user) return { ok: false, error: t("Session expirée : reconnectez-vous.") };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminders")
    .update(done ? { done_at: new Date().toISOString(), done_by: user.id } : { done_at: null, done_by: null })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  if (!data?.length) return { ok: false, error: t("Seul l'auteur du rappel (ou l'administrateur pour un rappel partagé) peut le modifier.") };
  refresh();
  return { ok: true, message: done ? t("Rappel marqué comme fait.") : t("Rappel réactivé.") };
}

export async function deleteReminder(id: string): Promise<ActionResult> {
  const t = await getT();
  const supabase = await createClient();
  const { data, error } = await supabase.from("reminders").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  if (!data?.length) return { ok: false, error: t("Seul l'auteur du rappel (ou l'administrateur pour un rappel partagé) peut le modifier.") };
  refresh();
  return { ok: true, message: t("Rappel supprimé.") };
}
