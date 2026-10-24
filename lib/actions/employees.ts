"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { POSITIONS, teamOfPosition, type ActionResult, type Position } from "@/lib/types";

const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable());
const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().date().nullable());
const restDaySchema = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(6).nullable());

const employeeSchema = z
  .object({
    id: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
    matricule: z.string().trim().min(1, "Matricule requis."),
    last_name: z.string().trim().min(1, "Nom requis."),
    first_name: z.string().trim().min(1, "Prénom requis."),
    position: z.enum(POSITIONS as [Position, ...Position[]]),
    rest_day: restDaySchema,
    truck_id: optionalUuid,
    chauffeur_id: optionalUuid,
    substitute_id: optionalUuid,
    hire_date: optionalDate,
    phone: z.string().trim().default(""),
    is_active: z.boolean(),
    job_title: z.string().trim().max(60).default(""),
    work_schedule: z.string().trim().max(80).default(""),
  })
  .transform((d) => ({
    ...d,
    team_type: teamOfPosition(d.position),
    // Camion : chauffeur titulaire uniquement ; rattachement à une équipe : rippeur titulaire uniquement
    truck_id: d.position === "chauffeur" ? d.truck_id : null,
    chauffeur_id: d.position === "rippeur" ? d.chauffeur_id : null,
    // Remplaçant attitré : pour les titulaires (chauffeur, rippeur) uniquement
    substitute_id: d.position === "chauffeur" || d.position === "rippeur" ? d.substitute_id : null,
  }))
  .refine((d) => d.position !== "autre" || d.job_title.length > 0, { message: "Indiquez le libellé de la fonction.", path: ["job_title"] });

const RETURN_TARGETS = ["/employes", "/profil?onglet=employes"];

export async function saveEmployee(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("employes", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };

  const parsed = employeeSchema.safeParse({
    id: formData.get("id") ?? undefined,
    matricule: formData.get("matricule"),
    last_name: formData.get("last_name"),
    first_name: formData.get("first_name"),
    position: formData.get("position"),
    rest_day: formData.get("rest_day"),
    truck_id: formData.get("truck_id"),
    chauffeur_id: formData.get("chauffeur_id"),
    substitute_id: formData.get("substitute_id"),
    hire_date: formData.get("hire_date"),
    phone: formData.get("phone") ?? "",
    is_active: formData.get("is_active") === "on",
    job_title: formData.get("job_title") ?? "",
    work_schedule: formData.get("work_schedule") ?? "",
  });
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };

  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = id ? await supabase.from("employees").update(values).eq("id", id) : await supabase.from("employees").insert(values);
  if (error) return { ok: false, error: t(friendlyDbError(error.message)) };

  revalidatePath("/employes");
  revalidatePath("/profil");
  revalidatePath("/pointage");
  const returnTo = String(formData.get("return_to") ?? "");
  const base = RETURN_TARGETS.includes(returnTo) ? returnTo : "/employes";
  redirect(`${base}${base.includes("?") ? "&" : "?"}ok=${id ? "modifie" : "cree"}`);
}

export async function setEmployeeActive(id: string, isActive: boolean): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("employes", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ is_active: isActive }).eq("id", id);
  if (error) return { ok: false, error: t(friendlyDbError(error.message)) };
  revalidatePath("/employes");
  revalidatePath("/profil");
  return { ok: true, message: isActive ? t("Employé réactivé.") : t("Employé désactivé.") };
}

/** Modifie le jour de repos habituel d'un employé (historisé par la base avec l'utilisateur et la date). */
export async function setRestDay(id: string, restDay: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("employes", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = restDaySchema.safeParse(restDay);
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return { ok: false, error: t("Saisie invalide.") };
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ rest_day: parsed.data }).eq("id", id);
  if (error) return { ok: false, error: t(friendlyDbError(error.message)) };
  revalidatePath("/pointage", "layout");
  revalidatePath("/employes");
  return { ok: true, message: t("Jour de repos modifié.") };
}

/** Affecte (ou retire) le remplaçant attitré d'un chauffeur ou d'un rippeur. */
export async function setSubstitute(id: string, substituteId: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("employes", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = optionalUuid.safeParse(substituteId);
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return { ok: false, error: t("Saisie invalide.") };
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ substitute_id: parsed.data }).eq("id", id);
  if (error) return { ok: false, error: t(friendlyDbError(error.message)) };
  revalidatePath("/pointage", "layout");
  revalidatePath("/employes");
  return { ok: true, message: parsed.data ? t("Remplaçant affecté.") : t("Remplaçant retiré.") };
}

// ---------------------------------------------------------------------------
// Camions
// ---------------------------------------------------------------------------
const truckSchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  matricule: z.string().trim().min(1, "Matricule requis."),
  brand: z.string().trim().default(""),
  model: z.string().trim().max(100).default(""),
  internal_number: z.string().trim().max(30).default(""),
  truck_type: z.string().trim().max(60).default(""),
  is_active: z.boolean(),
});

export async function saveTruck(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("employes", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };

  const parsed = truckSchema.safeParse({
    id: formData.get("id") ?? undefined,
    matricule: formData.get("matricule"),
    brand: formData.get("brand") ?? "",
    model: formData.get("model") ?? "",
    internal_number: formData.get("internal_number") ?? "",
    truck_type: formData.get("truck_type") ?? "",
    is_active: formData.get("is_active") !== "off",
  });
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };

  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = id ? await supabase.from("trucks").update(values).eq("id", id) : await supabase.from("trucks").insert(values);
  if (error) return { ok: false, error: t(friendlyDbError(error.message)) };

  revalidatePath("/employes/camions");
  revalidatePath("/profil");
  return { ok: true, message: id ? t("Camion modifié.") : t("Camion ajouté.") };
}

export async function setTruckActive(id: string, isActive: boolean): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("employes", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("trucks").update({ is_active: isActive }).eq("id", id);
  if (error) return { ok: false, error: t(friendlyDbError(error.message)) };
  revalidatePath("/employes/camions");
  revalidatePath("/profil");
  return { ok: true, message: isActive ? t("Camion réactivé.") : t("Camion désactivé.") };
}

function friendlyDbError(message: string): string {
  if (message.includes("trucks_internal_number_uniq")) return "Ce numéro interne de camion existe déjà.";
  if (message.includes("duplicate key") && message.includes("matricule")) return "Ce matricule existe déjà.";
  if (message.includes("REMPLACANT_INVALIDE")) return "Le remplaçant d'un chauffeur doit être un chauffeur remplaçant, celui d'un rippeur un rippeur remplaçant.";
  if (message.includes("employees_substitute_not_self")) return "Un employé ne peut pas être son propre remplaçant.";
  return friendlyError(message);
}

/**
 * Supprime un véhicule jamais utilisé. S'il a un historique (pointage, rapports, pleins)
 * ou s'il est affecté à un chauffeur, la base refuse : on propose alors de le désactiver.
 */
export async function deleteTruck(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("employes", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: t("Saisie invalide.") };
  const supabase = await createClient();
  const { data, error } = await supabase.from("trucks").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503" || error.message.includes("foreign key"))
      return { ok: false, error: t("Ce véhicule a un historique (pointage, rapports, carburant) ou est affecté à un chauffeur : il ne peut pas être supprimé. Désactivez-le pour le retirer des listes.") };
    return { ok: false, error: t(friendlyDbError(error.message)) };
  }
  if (!data?.length) return { ok: false, error: t("Véhicule introuvable.") };
  revalidatePath("/employes/camions");
  revalidatePath("/profil");
  return { ok: true, message: t("Véhicule supprimé.") };
}

// ---------------------------------------------------------------------------
// Saisie de plusieurs employés en une fois
// ---------------------------------------------------------------------------
export type BulkEmployeeInput = { matricule: string; last_name: string; first_name: string; position: string; rest_day: string; hire_date: string; phone: string };
export type BulkResult = { created: number; errors: { line: number; error: string }[] };

/**
 * Crée les employés ligne par ligne (le numéro d'ordre NB est attribué automatiquement).
 * Les lignes valides sont enregistrées ; les autres sont renvoyées avec la raison.
 * Camion, équipe d'un rippeur et remplaçant se règlent ensuite sur la fiche de chaque employé.
 */
export async function createEmployeesBulk(rows: BulkEmployeeInput[]): Promise<ActionResult<BulkResult>> {
  const t = await getT();
  const auth = await assertModule("employes", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: t("Aucune ligne à enregistrer.") };
  if (rows.length > 500) return { ok: false, error: t("500 lignes au maximum par envoi.") };

  const supabase = await createClient();
  const result: BulkResult = { created: 0, errors: [] };
  for (const [i, r] of rows.entries()) {
    const parsed = employeeSchema.safeParse({
      matricule: r.matricule,
      last_name: r.last_name,
      first_name: r.first_name,
      position: r.position,
      rest_day: r.rest_day,
      truck_id: null,
      chauffeur_id: null,
      substitute_id: null,
      hire_date: r.hire_date,
      phone: r.phone ?? "",
      is_active: true,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const msg = issue.path[0] === "position" ? "Poste invalide." : issue.path[0] === "hire_date" ? "Date d'entrée invalide." : issue.path[0] === "rest_day" ? "Jour de repos invalide." : issue.message;
      result.errors.push({ line: i + 1, error: t(msg) });
      continue;
    }
    const { id: _id, ...values } = parsed.data;
    void _id;
    const { error } = await supabase.from("employees").insert(values);
    if (error) result.errors.push({ line: i + 1, error: t(friendlyDbError(error.message)) });
    else result.created++;
  }
  if (result.created) {
    revalidatePath("/employes");
    revalidatePath("/profil");
    revalidatePath("/pointage", "layout");
  }
  return { ok: true, data: result };
}
