"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

// Les demandes de congé et de récupération ne sont jamais supprimées :
// elles changent de statut (en attente / acceptée / refusée) et chaque changement est journalisé.

const statusSchema = z.enum(["en_attente", "acceptee", "refusee"]);

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
  const { error } = await supabase.from("leave_requests").insert({
    ...d,
    decided_by: decided ? auth.user.id : null,
    decided_at: decided ? new Date().toISOString() : null,
  });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/conges");
  return { ok: true, message: t("Demande de congé enregistrée.") };
}

export async function decideLeaveRequest(id: string, status: string, note = ""): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("conges", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: t("Statut invalide.") };
  const pending = parsed.data === "en_attente";
  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status: parsed.data, decided_by: pending ? null : auth.user.id, decided_at: pending ? null : new Date().toISOString(), decision_note: note.slice(0, 500) })
    .eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/conges");
  return { ok: true, message: parsed.data === "acceptee" ? t("Demande acceptée.") : parsed.data === "refusee" ? t("Demande refusée.") : t("Demande remise en attente.") };
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
});

export async function addLeaveAdjustment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("conges", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (auth.user.role !== "admin") return { ok: false, error: t("Seul un administrateur peut ajuster un solde.") };
  const parsed = adjustmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const supabase = await createClient();
  const { error } = await supabase.from("leave_adjustments").insert(parsed.data);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/conges");
  return { ok: true, message: t("Ajustement enregistré (tracé dans le journal d'audit).") };
}
