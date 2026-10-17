"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { deletePhotosOfEntity } from "@/lib/actions/photos";
import type { ActionResult } from "@/lib/types";

const dateSchema = z.string().date("Date invalide.");
const uuid = z.string().uuid();
const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), uuid.nullable());
const optionalNumber = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(0).nullable());
const intField = z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().int().min(0));

// ===========================================================================
// Rapport journalier — Nettoiement
// ===========================================================================

/** Crée le rapport du jour, prérempli avec les agents présents au pointage. */
export async function createCleaningReport(date: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_journalier", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!dateSchema.safeParse(date).success) return { ok: false, error: t("Date invalide.") };

  const supabase = await createClient();
  const { data: report, error } = await supabase.from("cleaning_reports").insert({ activity_date: date }).select("id").single();
  if (error) return { ok: false, error: t(friendlyError(error.message)) };

  const { data: present } = await supabase
    .from("attendance")
    .select("employee_id")
    .eq("activity_date", date)
    .eq("team_type", "nettoiement")
    .eq("status", "present")
    .eq("shift", 1);
  const ids = Array.from(new Set((present ?? []).map((p) => p.employee_id)));
  if (ids.length) {
    const { data: emps } = await supabase.from("employees").select("id, order_number").in("id", ids);
    const rows = (emps ?? []).map((e) => ({ report_id: report.id, activity_date: date, employee_id: e.id, sort_order: e.order_number }));
    const { error: e2 } = await supabase.from("cleaning_report_agents").insert(rows);
    if (e2) return { ok: false, error: t(friendlyError(e2.message)) };
  }
  revalidatePath("/rapport-journalier/nettoiement");
  return { ok: true, message: ids.length ? t("Rapport créé avec {count} agent(s) présent(s) au pointage.", { count: ids.length }) : t("Rapport créé (aucun agent présent au pointage : ajoutez-les manuellement).") };
}

export async function updateCleaningAgent(id: string, patch: { location?: string; comment?: string }): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_journalier", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = z.object({ location: z.string().max(200).optional(), comment: z.string().max(1000).optional() }).safeParse(patch);
  if (!parsed.success) return { ok: false, error: t("Saisie invalide.") };
  const supabase = await createClient();
  const { error } = await supabase.from("cleaning_report_agents").update(parsed.data).eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  return { ok: true };
}

export async function addCleaningAgent(reportId: string, date: string, employeeId: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_journalier", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!uuid.safeParse(reportId).success || !uuid.safeParse(employeeId).success) return { ok: false, error: t("Identifiant invalide.") };
  const supabase = await createClient();
  const { data: e } = await supabase.from("employees").select("order_number").eq("id", employeeId).maybeSingle();
  const { error } = await supabase.from("cleaning_report_agents").insert({ report_id: reportId, activity_date: date, employee_id: employeeId, sort_order: e?.order_number ?? 999 });
  if (error) return { ok: false, error: error.message.includes("duplicate") ? t("Cet agent est déjà dans le rapport.") : t(friendlyError(error.message)) };
  revalidatePath("/rapport-journalier/nettoiement");
  return { ok: true, message: t("Agent ajouté au rapport (le pointage n'est pas modifié).") };
}

export async function removeCleaningAgent(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_journalier", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("cleaning_report_agents").delete().eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  await deletePhotosOfEntity("cleaning_report_agent", id);
  revalidatePath("/rapport-journalier/nettoiement");
  return { ok: true, message: t("Agent retiré du rapport.") };
}

export async function updateCleaningReport(id: string, observations: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_journalier", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("cleaning_reports").update({ observations: observations.slice(0, 2000) }).eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  return { ok: true, message: t("Observations enregistrées.") };
}

// ===========================================================================
// Rapport journalier — Collecte
// ===========================================================================

/** Crée le rapport d'un camion pour une date, équipe préremplie (pointage du jour, sinon affectations). */
export async function createCollectionReport(date: string, truckId: string): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const auth = await assertModule("rapport_journalier", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!dateSchema.safeParse(date).success || !uuid.safeParse(truckId).success) return { ok: false, error: t("Paramètres invalides.") };

  const supabase = await createClient();
  const { data: chauffeur } = await supabase.from("employees").select("id").eq("truck_id", truckId).eq("position", "chauffeur").eq("is_active", true).limit(1).maybeSingle();

  let ripperIds: string[] = [];
  if (chauffeur) {
    const { data: att } = await supabase
      .from("attendance")
      .select("employee_id")
      .eq("activity_date", date)
      .eq("chauffeur_id", chauffeur.id)
      .eq("status", "present");
    ripperIds = Array.from(new Set((att ?? []).map((a) => a.employee_id)));
    if (!ripperIds.length) {
      const { data: emps } = await supabase.from("employees").select("id").eq("chauffeur_id", chauffeur.id).eq("is_active", true);
      ripperIds = (emps ?? []).map((e) => e.id);
    }
  }

  const { data: report, error } = await supabase
    .from("collection_reports")
    .insert({ activity_date: date, truck_id: truckId, chauffeur_id: chauffeur?.id ?? null })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message.includes("duplicate") ? t("Un rapport existe déjà pour ce camion à cette date.") : t(friendlyError(error.message)) };

  if (ripperIds.length) {
    await supabase.from("collection_report_rippers").insert(ripperIds.map((employee_id) => ({ report_id: report.id, employee_id })));
  }
  await supabase
    .from("truck_daily_reports")
    .upsert({ activity_date: date, truck_id: truckId, chauffeur_id: chauffeur?.id ?? null, rippers_count: ripperIds.length }, { onConflict: t("activity_date,truck_id") });

  revalidatePath("/rapport-journalier/collecte");
  revalidatePath("/rapport-camions");
  return { ok: true, data: { id: report.id } };
}

const collectionSchema = z.object({
  id: uuid,
  chauffeur_id: optionalUuid,
  sectors: z.string().max(1000).default(""),
  observations: z.string().max(2000).default(""),
  rippers: z.array(uuid),
  ticket1: z.string().max(50).default(""),
  tonnage1: optionalNumber,
  ticket2: z.string().max(50).default(""),
  tonnage2: optionalNumber,
  dumps_count: intField,
  km: optionalNumber,
  fuel: optionalNumber,
});

export async function saveCollectionReport(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_journalier", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };

  const parsed = collectionSchema.safeParse({
    id: formData.get("id"),
    chauffeur_id: formData.get("chauffeur_id"),
    sectors: formData.get("sectors") ?? "",
    observations: formData.get("observations") ?? "",
    rippers: formData.getAll("rippers"),
    ticket1: formData.get("ticket1") ?? "",
    tonnage1: formData.get("tonnage1"),
    ticket2: formData.get("ticket2") ?? "",
    tonnage2: formData.get("tonnage2"),
    dumps_count: formData.get("dumps_count"),
    km: formData.get("km"),
    fuel: formData.get("fuel"),
  });
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: existing } = await supabase.from("collection_reports").select("activity_date, truck_id").eq("id", d.id).maybeSingle();
  if (!existing) return { ok: false, error: t("Rapport introuvable.") };

  const { error } = await supabase
    .from("collection_reports")
    .update({ chauffeur_id: d.chauffeur_id, sectors: d.sectors, observations: d.observations })
    .eq("id", d.id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };

  await supabase.from("collection_report_rippers").delete().eq("report_id", d.id);
  if (d.rippers.length) {
    const { error: e2 } = await supabase.from("collection_report_rippers").insert(d.rippers.map((employee_id) => ({ report_id: d.id, employee_id })));
    if (e2) return { ok: false, error: t(friendlyError(e2.message)) };
  }

  // Rapport camions alimenté automatiquement (pas de double saisie)
  const { error: e3 } = await supabase.from("truck_daily_reports").upsert(
    {
      activity_date: existing.activity_date,
      truck_id: existing.truck_id,
      chauffeur_id: d.chauffeur_id,
      ticket1: d.ticket1,
      tonnage1: d.tonnage1,
      ticket2: d.ticket2,
      tonnage2: d.tonnage2,
      dumps_count: d.dumps_count,
      rippers_count: d.rippers.length,
      km: d.km,
      fuel: d.fuel,
      observations: d.observations,
    },
    { onConflict: t("activity_date,truck_id") },
  );
  if (e3) return { ok: false, error: t(friendlyError(e3.message)) };

  revalidatePath("/rapport-journalier");
  revalidatePath("/rapport-camions");
  return { ok: true, message: t("Rapport de collecte enregistré (rapport camions mis à jour).") };
}

export async function deleteCollectionReport(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_journalier", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { data: r } = await supabase.from("collection_reports").select("activity_date, truck_id").eq("id", id).maybeSingle();
  if (!r) return { ok: false, error: t("Rapport introuvable.") };
  const { error } = await supabase.from("collection_reports").delete().eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  await deletePhotosOfEntity("collection_report", id);
  revalidatePath("/rapport-journalier/collecte");
  redirect(`/rapport-journalier/collecte?date=${r.activity_date}`);
}

// ===========================================================================
// Rapport camions (saisie directe, sans rapport de collecte)
// ===========================================================================
const truckReportSchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  activity_date: dateSchema,
  truck_id: uuid,
  chauffeur_id: optionalUuid,
  ticket1: z.string().max(50).default(""),
  tonnage1: optionalNumber,
  ticket2: z.string().max(50).default(""),
  tonnage2: optionalNumber,
  dumps_count: intField,
  rippers_count: intField,
  km: optionalNumber,
  fuel: optionalNumber,
  observations: z.string().max(2000).default(""),
});

export async function saveTruckReport(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_camions", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = truckReportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, ...values } = parsed.data;

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("truck_daily_reports").update(values).eq("id", id)
    : await supabase.from("truck_daily_reports").upsert(values, { onConflict: t("activity_date,truck_id") });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/rapport-camions");
  revalidatePath("/rapport-journalier/global");
  redirect(`/rapport-camions?date=${values.activity_date}&ok=1`);
}

export async function deleteTruckReport(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_camions", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("truck_daily_reports").delete().eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/rapport-camions");
  revalidatePath("/rapport-journalier/global");
  return { ok: true, message: t("Ligne supprimée.") };
}

// ===========================================================================
// Récapitulatif nettoiement (rapport journalier global)
// ===========================================================================
const summarySchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  activity_date: dateSchema,
  zone: z.string().max(100).default(""),
  planned_headcount: intField,
  work_duration: z.string().max(50).default(""),
  active_count: intField,
  sick_count: intField,
  paid_leave_count: intField,
  absent_count: intField,
  holiday_count: intField,
  rest_count: intField,
  total_count: intField,
});

export async function saveCleaningSummaryRow(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_journalier", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = summarySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = id ? await supabase.from("cleaning_daily_summary").update(values).eq("id", id) : await supabase.from("cleaning_daily_summary").insert(values);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/rapport-journalier/global");
  return { ok: true, message: t("Ligne enregistrée.") };
}

export async function deleteCleaningSummaryRow(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_journalier", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("cleaning_daily_summary").delete().eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/rapport-journalier/global");
  return { ok: true, message: t("Ligne supprimée.") };
}

/** Calcule (ou recalcule) la ligne « Total pointage » à partir de la feuille de présence nettoiement. */
export async function computeCleaningSummary(date: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_journalier", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!dateSchema.safeParse(date).success) return { ok: false, error: t("Date invalide.") };

  const supabase = await createClient();
  const { data: att } = await supabase.from("attendance").select("employee_id, status").eq("activity_date", date).eq("team_type", "nettoiement").eq("shift", 1);
  const rows = att ?? [];
  if (!rows.length) return { ok: false, error: t("Aucun pointage nettoiement pour cette date.") };
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const { count: planned } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq("team_type", "nettoiement").eq("is_active", true);

  const values = {
    activity_date: date,
    zone: "Total pointage",
    planned_headcount: planned ?? 0,
    work_duration: "",
    active_count: count("present"),
    sick_count: count("absent_maladie"),
    paid_leave_count: count("conge"),
    absent_count: count("absent"),
    holiday_count: count("ferie"),
    rest_count: count("repos"),
    total_count: rows.length,
    sort_order: -1,
  };
  const { data: existing } = await supabase.from("cleaning_daily_summary").select("id").eq("activity_date", date).eq("zone", "Total pointage").maybeSingle();
  const { error } = existing
    ? await supabase.from("cleaning_daily_summary").update(values).eq("id", existing.id)
    : await supabase.from("cleaning_daily_summary").insert(values);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/rapport-journalier/global");
  return { ok: true, message: t("Récapitulatif calculé depuis le pointage.") };
}
