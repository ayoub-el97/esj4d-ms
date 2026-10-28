"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { ABSENCE_CLASSES, CERTIFICATE_STATUSES, CERTIFICATE_VERIFICATIONS, ENGAGEMENT_STATUSES, type AbsenceClass } from "@/lib/absence-types";
import type { ActionResult } from "@/lib/types";

const optDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().date("Date invalide.").nullable());

async function refresh(employeeId: string) {
  const supabase = await createClient();
  // Rappels « Rappels et alertes » recalculés (création / retrait, jamais de doublon)
  await supabase.rpc("sync_absence_alerts");
  revalidatePath("/pointage/absences");
  revalidatePath(`/pointage/absences/${employeeId}`);
  revalidatePath("/", "layout");
}

/**
 * Révision du classement d'un jour d'absence (utilisateur autorisé). null = retour au classement
 * du pointage. Le pointage et la date de l'absence ne sont jamais modifiés ; journalisé.
 */
export async function setAbsenceClassification(employeeId: string, date: string, classification: AbsenceClass | null, comment: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("pointage", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!z.string().uuid().safeParse(employeeId).success || !z.string().date().safeParse(date).success) return { ok: false, error: t("Données invalides.") };
  if (classification && !ABSENCE_CLASSES.includes(classification)) return { ok: false, error: t("Classement invalide.") };
  const supabase = await createClient();
  const { error } = classification
    ? await supabase.from("absence_reviews").upsert({ employee_id: employeeId, activity_date: date, classification, comment: comment.trim().slice(0, 1000) }, { onConflict: "employee_id,activity_date" })
    : await supabase.from("absence_reviews").delete().eq("employee_id", employeeId).eq("activity_date", date);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  await refresh(employeeId);
  return { ok: true, message: t("Classement de l'absence enregistré.") };
}

const certificateSchema = z
  .object({
    id: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().uuid().optional()),
    employee_id: z.string().uuid(),
    start_date: z.string().date("Date de début invalide."),
    end_date: z.string().date("Date de fin invalide."),
    submitted_on: optDate,
    status: z.enum(CERTIFICATE_STATUSES as [string, ...string[]]).default("en_attente"),
    verification: z.enum(CERTIFICATE_VERIFICATIONS as [string, ...string[]]).default("non_verifiee"),
    comment: z.string().trim().max(1000).default(""),
  })
  .refine((d) => d.end_date >= d.start_date, { message: "La date de fin ne peut pas précéder la date de début.", path: ["end_date"] });

/** Certificat médical (un ou plusieurs jours) : créé ou mis à jour, même après la période d'absence. */
export async function saveMedicalCertificate(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("pointage", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = certificateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = id ? await supabase.from("medical_certificates").update(values).eq("id", id) : await supabase.from("medical_certificates").insert(values);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  await refresh(values.employee_id);
  return { ok: true, message: id ? t("Certificat médical mis à jour.") : t("Certificat médical enregistré. Ajoutez les photos du certificat quand il est remis.") };
}

export async function deleteMedicalCertificate(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("pointage", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { count } = await supabase.from("photos").select("id", { count: "exact", head: true }).eq("entity_type", "medical_certificate").eq("entity_id", id);
  if (count) return { ok: false, error: t("Retirez d'abord les photos du certificat.") };
  const { data, error } = await supabase.from("medical_certificates").delete().eq("id", id).select("employee_id").single();
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  await refresh(data.employee_id);
  return { ok: true, message: t("Certificat médical supprimé (conservé dans le journal).") };
}

const engagementSchema = z.object({
  id: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().uuid().optional()),
  employee_id: z.string().uuid(),
  status: z.enum(ENGAGEMENT_STATUSES as [string, ...string[]]),
  signed_on: optDate,
  comment: z.string().trim().max(1000).default(""),
  unjustified_count: z.coerce.number().int().min(0).default(0),
});

/** Engagement écrit relatif aux absences : statut, date de signature (jamais signé automatiquement). */
export async function saveEngagement(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("pointage", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = engagementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, ...v } = parsed.data;
  if (v.status === "signe" && !v.signed_on) return { ok: false, error: t("Indiquez la date de signature.") };
  const values = { ...v, kind: "engagement", signed_on: v.status === "signe" ? v.signed_on : null };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("absence_actions").update(values).eq("id", id) : await supabase.from("absence_actions").insert(values);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  await refresh(v.employee_id);
  return { ok: true, message: t("Engagement écrit enregistré.") };
}

const decisionSchema = z.object({
  employee_id: z.string().uuid(),
  decision: z.string().trim().min(3, "Indiquez la décision.").max(2000),
  decision_date: z.string().date("Date de la décision invalide."),
  comment: z.string().trim().max(1000).default(""),
  unjustified_count: z.coerce.number().int().min(0),
});

/** Décision du responsable (aucune désactivation ni sanction automatique). */
export async function saveDecision(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("pointage", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const supabase = await createClient();
  const { error } = await supabase.from("absence_actions").insert({ ...parsed.data, kind: "decision" });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  await refresh(parsed.data.employee_id);
  return { ok: true, message: t("Décision du responsable enregistrée.") };
}
