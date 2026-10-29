"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { leaveSegments, type LeaveDay, type LeaveSegment } from "@/lib/leave-segments";

// Les demandes de congé et de récupération ne sont jamais supprimées :
// elles changent de statut (en attente / acceptée / refusée) et chaque changement est journalisé.

const statusSchema = z.enum(["en_attente", "acceptee", "refusee"]);
/** Décision sur une demande de congé : « annulee » en plus (demande conservée, pointage recalculé). */
const leaveDecisionSchema = z.enum(["en_attente", "acceptee", "refusee", "annulee"]);

// ---------------------------------------------------------------------------
// Congé
// ---------------------------------------------------------------------------
const leaveSchema = z
  .object({
    employee_id: z.string().uuid("Choisissez un employé."),
    request_date: z.string().date("Date de la demande invalide."),
    start_date: z.string().date("Date de début invalide."),
    end_date: z.string().date("Date de fin invalide."),
    requested_days: z.coerce.number().positive("Indiquez le nombre de jours demandés.").max(366),
    reason: z.string().max(500).default(""),
    status: statusSchema.default("en_attente"),
  })
  .refine((d) => d.end_date >= d.start_date, { message: "La date de fin doit être postérieure ou égale à la date de début.", path: ["end_date"] });

export async function createLeaveRequest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("conges", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = leaveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const d = parsed.data;
  const decided = d.status !== "en_attente";

  const supabase = await createClient();
  // Jours de repos hebdomadaires exclus : jour de repos inconnu → confirmation explicite
  const { data: days } = await supabase.rpc("leave_period_breakdown", { p_employee: d.employee_id, p_start: d.start_date, p_end: d.end_date });
  const b = leaveSegments((days ?? []) as LeaveDay[]);
  if (b.restUnknown && formData.get("confirm_rest_unknown") !== "on") {
    return { ok: false, error: t("Le jour de repos de cet employé n'est pas défini : aucun jour ne peut être exclu. Cochez la confirmation ou renseignez son jour de repos.") };
  }
  if (b.total === 0) return { ok: false, error: t("La période ne contient que des jours de repos : aucun jour de congé à déduire.") };
  if (d.requested_days > b.total) return { ok: false, error: t("Nombre de jours demandés supérieur aux jours de congé de la période ({count} jour(s) hors repos).", { count: b.total }) };
  const { error } = await supabase.from("leave_requests").insert({
    ...d,
    decided_by: decided ? auth.user.id : null,
    decided_at: decided ? new Date().toISOString() : null,
  });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/conges");
  return { ok: true, message: t("Demande de congé enregistrée.") };
}

/**
 * Décide d'une demande de congé. La base synchronise aussitôt le pointage :
 * acceptée -> chaque date en « Congé » ; refusée, annulée ou remise en attente -> congé retiré
 * (pointage d'origine restauré). Les journées clôturées ne sont jamais modifiées.
 */
export async function decideLeaveRequest(id: string, status: string, note = ""): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("conges", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = leaveDecisionSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: t("Statut invalide.") };
  if (parsed.data === "annulee" && note.trim().length < 3) return { ok: false, error: t("Indiquez le motif de l'annulation.") };
  const pending = parsed.data === "en_attente";
  const supabase = await createClient();
  const { data: req } = await supabase.from("leave_requests").select("employee_id, start_date, end_date, status").eq("id", id).maybeSingle();
  if (!req) return { ok: false, error: t("Demande introuvable.") };

  // Effet sur le pointage (pour informer l'utilisateur)
  const [{ data: att }, { data: closedDays }, { data: overrides }] = await Promise.all([
    supabase.from("attendance").select("activity_date, status").eq("employee_id", req.employee_id).gte("activity_date", req.start_date).lte("activity_date", req.end_date),
    supabase.from("work_days").select("activity_date").eq("status", "closed").gte("activity_date", req.start_date).lte("activity_date", req.end_date),
    supabase.from("attendance_leave_overrides").select("activity_date").eq("employee_id", req.employee_id).eq("revoked", false).gte("activity_date", req.start_date).lte("activity_date", req.end_date),
  ]);
  const closed = new Set((closedDays ?? []).map((d) => d.activity_date));
  const derog = new Set((overrides ?? []).map((d) => d.activity_date));
  const conflicts = new Set((att ?? []).filter((a) => a.status !== "conge" && !closed.has(a.activity_date) && !derog.has(a.activity_date)).map((a) => a.activity_date)).size;

  const { error } = await supabase
    .from("leave_requests")
    .update({ status: parsed.data, decided_by: pending ? null : auth.user.id, decided_at: pending ? null : new Date().toISOString(), decision_note: note.slice(0, 500) })
    .eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/conges");
  revalidatePath("/pointage", "layout");

  const days = Math.round((Date.parse(req.end_date) - Date.parse(req.start_date)) / 86400000) + 1;
  const parts: string[] = [];
  if (parsed.data === "acceptee") {
    parts.push(t("Demande acceptée : {count} jour(s) mis en « Congé » au pointage.", { count: days - closed.size - derog.size }));
    if (conflicts) parts.push(t("{count} pointage(s) déjà saisi(s) converti(s) en « Congé » (ancien statut conservé dans l'historique).", { count: conflicts }));
  } else if (req.status === "acceptee") {
    parts.push(
      parsed.data === "refusee" ? t("Demande refusée.") : parsed.data === "annulee" ? t("Demande annulée (conservée dans l'historique).") : t("Demande remise en attente."),
      t("Le congé a été retiré du pointage ; le statut d'origine est restauré quand il existait."),
    );
  } else {
    parts.push(parsed.data === "refusee" ? t("Demande refusée.") : parsed.data === "annulee" ? t("Demande annulée (conservée dans l'historique).") : t("Demande remise en attente."));
  }
  if (closed.size) parts.push(t("{count} journée(s) clôturée(s) non modifiée(s) : rouvrez-les pour corriger le pointage.", { count: closed.size }));
  if (derog.size && parsed.data === "acceptee") parts.push(t("{count} date(s) avec une modification autorisée laissée(s) telle(s) quelle(s).", { count: derog.size }));
  return { ok: true, message: parts.join(" ") };
}

// ---------------------------------------------------------------------------
// Récupération
// ---------------------------------------------------------------------------
const recoverySchema = z
  .object({
    employee_id: z.string().uuid("Choisissez un employé."),
    request_date: z.string().date("Date de la demande invalide."),
    worked_rest_date: z.string().date("Choisissez le jour travaillé (repos ou férié)."),
    recovery_date: z.string().date("Date de récupération invalide."),
    requested_days: z.coerce.number().positive().max(1, "Un jour travaillé (repos ou férié) donne au plus 1 jour de récupération."),
    comment: z.string().max(500).default(""),
    status: statusSchema.default("en_attente"),
  })
  .refine((d) => d.recovery_date > d.worked_rest_date, { message: "La récupération doit être postérieure au jour travaillé.", path: ["recovery_date"] });

export async function createRecoveryRequest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("conges", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = recoverySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const d = parsed.data;
  const decided = d.status !== "en_attente";

  const supabase = await createClient();
  const { error } = await supabase.from("recovery_requests").insert({
    ...d,
    decided_by: decided ? auth.user.id : null,
    decided_at: decided ? new Date().toISOString() : null,
  });
  if (error) return { ok: false, error: t(recoveryError(error.message)) };
  revalidatePath("/conges");
  return { ok: true, message: t("Demande de récupération enregistrée.") };
}

export async function decideRecoveryRequest(id: string, status: string, note = ""): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("conges", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: t("Statut invalide.") };
  const pending = parsed.data === "en_attente";
  const supabase = await createClient();
  const { error } = await supabase
    .from("recovery_requests")
    .update({ status: parsed.data, decided_by: pending ? null : auth.user.id, decided_at: pending ? null : new Date().toISOString(), decision_note: note.slice(0, 500) })
    .eq("id", id);
  if (error) return { ok: false, error: t(recoveryError(error.message)) };
  revalidatePath("/conges");
  return { ok: true, message: parsed.data === "acceptee" ? t("Demande acceptée.") : parsed.data === "refusee" ? t("Demande refusée.") : t("Demande remise en attente.") };
}

function recoveryError(message: string): string {
  if (message.includes("CREDIT_INVALIDE")) return "Aucun jour de repos ou jour férié travaillé pointé à cette date pour cet employé.";
  if (message.includes("FERIE_HORS_DELAI")) return "La récupération d'un jour férié travaillé doit être demandée avant la fin du mois du férié. Passé ce délai, le jour est payé avec le salaire.";
  if (message.includes("recovery_requests_credit_uniq") || message.includes("duplicate key")) return "Ce jour de repos travaillé est déjà utilisé par une autre demande.";
  return friendlyError(message);
}

// ---------------------------------------------------------------------------
// Corrections manuelles de solde (administrateur, motif obligatoire, jamais supprimées)
// ---------------------------------------------------------------------------
const adjustmentSchema = z.object({
  employee_id: z.string().uuid(),
  kind: z.enum(["conge", "recuperation"]),
  days: z.coerce.number().refine((n) => n !== 0, "Indiquez un nombre de jours (positif ou négatif)."),
  reason: z.string().trim().min(3, "Le motif est obligatoire."),
  // « solde_initial » : reprise des registres papier (congés uniquement)
  category: z.enum(["correction", "solde_initial"]).default("correction"),
}).refine((d) => d.category === "correction" || d.kind === "conge", { message: "Le solde initial ne concerne que les congés.", path: ["category"] });

export async function addLeaveAdjustment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("conges", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (auth.user.role !== "admin") return { ok: false, error: t("Seul un administrateur peut ajuster un solde.") };
  const parsed = adjustmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const supabase = await createClient();
  const { error } = await supabase.from("leave_adjustments").insert({ ...parsed.data, created_by: auth.user.id });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/conges");
  return { ok: true, message: t("Ajustement enregistré (tracé dans le journal d'audit).") };
}

const historyBeforeSchema = z
  .object({
    id: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().uuid().optional()),
    employee_id: z.string().uuid(),
    days: z.coerce.number().min(0.5, "Indiquez le nombre de jours (au moins 0,5).").max(999),
    start_date: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().date("Date invalide.").nullable()),
    end_date: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().date("Date invalide.").nullable()),
    note: z.string().trim().max(1000).default(""),
  })
  .refine((d) => !d.start_date || !d.end_date || d.end_date >= d.start_date, { message: "La date de fin ne peut pas précéder la date de début.", path: ["end_date"] });

/** Congés pris avant le système (registres papier) : ajout ou correction, administrateur, journalisé. */
export async function saveLeaveHistoryBefore(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("conges", "view");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (auth.user.role !== "admin") return { ok: false, error: t("Seul un administrateur peut modifier les données de reprise des congés.") };
  const parsed = historyBeforeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = id ? await supabase.from("leave_history_before").update(values).eq("id", id) : await supabase.from("leave_history_before").insert({ ...values, created_by: auth.user.id });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/conges", "layout");
  revalidatePath(`/employes/${values.employee_id}`);
  return { ok: true, message: id ? t("Congés pris avant le système corrigés.") : t("Congés pris avant le système enregistrés.") };
}

export async function deleteLeaveHistoryBefore(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("conges", "view");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (auth.user.role !== "admin") return { ok: false, error: t("Seul un administrateur peut modifier les données de reprise des congés.") };
  const supabase = await createClient();
  const { data, error } = await supabase.from("leave_history_before").delete().eq("id", id).select("employee_id").single();
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/conges", "layout");
  revalidatePath(`/employes/${data.employee_id}`);
  return { ok: true, message: t("Ligne supprimée (conservée dans le journal).") };
}

/** Aperçu d'une demande : jours de repos exclus, périodes de congé et total déduit (avant confirmation). */
export async function previewLeaveRequest(employeeId: string, start: string, end: string): Promise<ActionResult<{ segments: LeaveSegment[]; restDays: string[]; total: number; restUnknown: boolean; calendarDays: number }>> {
  const t = await getT();
  const auth = await assertModule("conges", "view");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!z.string().uuid().safeParse(employeeId).success || !z.string().date().safeParse(start).success || !z.string().date().safeParse(end).success || end < start) return { ok: false, error: t("Données invalides.") };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leave_period_breakdown", { p_employee: employeeId, p_start: start, p_end: end });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  const list = (data ?? []) as LeaveDay[];
  return { ok: true, data: { ...leaveSegments(list), calendarDays: list.length } };
}
