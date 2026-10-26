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
    // Facultatif : vide = aucun matricule (null) ; l'employé est identifié par son id interne
    matricule: z.preprocess((v) => {
      const s = String(v ?? "").trim();
      return s ? s : null;
    }, z.string().max(40, "Matricule trop long (40 caractères maximum).").nullable()),
    last_name: z.string().trim().min(1, "Nom requis."),
    first_name: z.string().trim().min(1, "Prénom requis."),
    position: z.enum(POSITIONS as [Position, ...Position[]], { message: "Poste retiré ou invalide : choisissez un autre poste (« Agent de sécurité » n'est plus proposé)." }),
    rest_day: restDaySchema,
    truck_id: optionalUuid,
    chauffeur_id: optionalUuid,
    substitute_id: optionalUuid,
    hire_date: optionalDate,
    in_service_before_start: z.boolean().default(false),
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
    // Le drapeau ne sert que si la date est inconnue
    in_service_before_start: d.hire_date ? false : d.in_service_before_start,
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
    in_service_before_start: formData.get("in_service_before_start") === "on",
    phone: formData.get("phone") ?? "",
    is_active: formData.get("is_active") === "on",
    job_title: formData.get("job_title") ?? "",
    work_schedule: formData.get("work_schedule") ?? "",
  });
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };

  // Doublon : même nom et prénom, sans matricule pour les distinguer
  const supabaseCheck = await createClient();
  const homonym = await findHomonym(supabaseCheck, parsed.data.last_name, parsed.data.first_name, parsed.data.matricule, parsed.data.id);
  if (homonym && formData.get("confirm_homonym") !== "on") {
    return {
      ok: false,
      error: t("Un employé nommé {name} existe déjà ({matricule}). Ajoutez un matricule pour les distinguer, ou cochez « Autre personne portant le même nom ».", {
        name: homonym.name,
        matricule: homonym.matricule ? t("matricule {m}", { m: homonym.matricule }) : t("sans matricule"),
      }),
    };
  }

  const { id, ...rest } = parsed.data;
  // Fiche réactivée par le formulaire : le départ enregistré est levé (il reste dans le journal)
  const values = rest.is_active ? { ...rest, departure_date: null, departure_reason: null, departure_comment: "" } : rest;
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

const nameKey = (last: string, first: string) => `${last} ${first}`.trim().replace(/\s+/g, " ").toLowerCase();
const likeExact = (s: string) => s.trim().replace(/\s+/g, " ").replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Employé existant portant le même nom et prénom (sans tenir compte des majuscules), qui ne peut pas
 * être distingué par le matricule (l'un des deux n'en a pas, ou c'est le même). Deux homonymes avec
 * des matricules différents sont acceptés.
 */
async function findHomonym(supabase: Awaited<ReturnType<typeof createClient>>, last: string, first: string, matricule: string | null, excludeId?: string): Promise<{ name: string; matricule: string | null } | null> {
  let q = supabase.from("employees").select("id, last_name, first_name, matricule").ilike("last_name", likeExact(last)).ilike("first_name", likeExact(first)).limit(5);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  const hit = (data ?? []).find((e) => !e.matricule || !matricule || e.matricule === matricule);
  return hit ? { name: `${hit.last_name} ${hit.first_name}`, matricule: hit.matricule } : null;
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
export type BulkEmployeeInput = { matricule: string; last_name: string; first_name: string; position: string; rest_day: string; hire_date: string; phone: string; in_service_before_start?: boolean };
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
  const batch = new Map<string, string>();
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
      in_service_before_start: !!r.in_service_before_start,
      phone: r.phone ?? "",
      is_active: true,
    });
    if (parsed.success) {
      // Doublons : dans la base et dans les lignes déjà acceptées de cet envoi
      const key = nameKey(parsed.data.last_name, parsed.data.first_name);
      const inBatch = batch.get(key);
      const homonym = inBatch !== undefined && (!inBatch || !parsed.data.matricule || inBatch === parsed.data.matricule) ? { name: `${parsed.data.last_name} ${parsed.data.first_name}` } : await findHomonym(supabase, parsed.data.last_name, parsed.data.first_name, parsed.data.matricule);
      if (homonym) {
        result.errors.push({ line: i + 1, error: t("Doublon : un employé nommé {name} existe déjà. Ajoutez un matricule pour distinguer deux personnes portant le même nom.", { name: homonym.name }) });
        continue;
      }
      batch.set(key, parsed.data.matricule ?? "");
    }
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

// ---------------------------------------------------------------------------
// Départ, réactivation, suppression définitive
// ---------------------------------------------------------------------------
const departureSchema = z.object({
  id: z.string().uuid(),
  departure_date: z.string().date("Date de départ invalide."),
  departure_reason: z.enum(["demission", "fin_contrat", "licenciement", "autre"], { message: "Choisissez le motif de départ." }),
  departure_comment: z.string().trim().max(500).default(""),
});

function refreshEmployees() {
  revalidatePath("/employes");
  revalidatePath("/profil");
  revalidatePath("/pointage", "layout");
}

/** Départ de l'employé : désactivation (jamais de suppression), historique intact. Journalisé. */
export async function deactivateEmployee(input: { id: string; departure_date: string; departure_reason: string; departure_comment?: string }): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("employes", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = departureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { data: emp } = await supabase.from("employees").select("hire_date").eq("id", id).maybeSingle();
  if (!emp) return { ok: false, error: t("Employé introuvable.") };
  if (emp.hire_date && values.departure_date < emp.hire_date) return { ok: false, error: t("La date de départ ne peut pas précéder la date de début de travail.") };
  const { error } = await supabase.from("employees").update({ ...values, is_active: false }).eq("id", id);
  if (error) return { ok: false, error: t(friendlyDbError(error.message)) };
  refreshEmployees();
  return { ok: true, message: t("Départ enregistré : l'employé est désactivé. Son historique est conservé.") };
}

/** Réactivation : l'employé redevient sélectionnable ; le départ précédent reste dans le journal. */
export async function reactivateEmployee(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("employes", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: t("Saisie invalide.") };
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ is_active: true, departure_date: null, departure_reason: null, departure_comment: "" }).eq("id", id);
  if (error) return { ok: false, error: t(friendlyDbError(error.message)) };
  refreshEmployees();
  return { ok: true, message: t("Employé réactivé.") };
}

export type EmployeeDependency = { table_name: string; label: string; records: number };

/** Enregistrements qui font référence à l'employé (vérifié par la base sur toutes les tables liées). */
export async function checkEmployeeDeletion(id: string): Promise<ActionResult<{ dependencies: EmployeeDependency[]; canDelete: boolean }>> {
  const t = await getT();
  const auth = await assertModule("employes", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: t("Saisie invalide.") };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("employee_dependencies", { p_employee: id });
  if (error) return { ok: false, error: t(friendlyDbError(error.message)) };
  const dependencies = ((data ?? []) as EmployeeDependency[]).map((d) => ({ ...d, records: Number(d.records) }));
  return { ok: true, data: { dependencies, canDelete: dependencies.length === 0 && auth.user.role === "admin" } };
}

/** Suppression définitive (administrateur, aucun enregistrement lié, matricule saisi pour confirmer). */
export async function deleteEmployee(id: string, confirmMatricule: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("employes", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (auth.user.role !== "admin") return { ok: false, error: t("Seul un administrateur peut supprimer définitivement un employé.") };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: t("Saisie invalide.") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_employee", { p_employee: id, p_confirm_matricule: confirmMatricule });
  if (error) {
    const m = error.message.match(/EMPLOYE_HISTORIQUE\|(.*)$/);
    if (m) return { ok: false, error: t("Suppression impossible : l'employé figure dans {list}. Désactivez-le pour conserver l'historique.", { list: m[1] }) };
    if (error.message.includes("CONFIRMATION_INVALIDE")) return { ok: false, error: t("La confirmation saisie ne correspond pas : suppression annulée.") };
    if (error.message.includes("SUPPRESSION_REFUSEE")) return { ok: false, error: t("Seul un administrateur peut supprimer définitivement un employé.") };
    return { ok: false, error: t(friendlyDbError(error.message)) };
  }
  refreshEmployees();
  return { ok: true, message: t("Employé supprimé définitivement (aucun historique ne le concernait). La suppression est inscrite au journal.") };
}
