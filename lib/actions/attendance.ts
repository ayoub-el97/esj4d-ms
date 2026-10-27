"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertModule, friendlyError, hasPermission } from "@/lib/auth";
import { syncCleaningReport, syncCollectionReports } from "@/lib/report-sync";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { buildSheet, isDayClosed } from "@/lib/data/attendance";
import { formatDateFr } from "@/lib/dates";
import type { SheetPayload, SheetRow } from "@/lib/attendance-types";
import { ALL_POSITIONS, ATTENDANCE_STATUSES, TEAM_LABELS, type ActionResult, type Position, type TeamType } from "@/lib/types";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const optionalTime = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(timeRe, "Heure invalide (HH:MM).").nullable());
const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable());

const rowSchema = z.object({
  employee_id: z.string().uuid(),
  shift: z.number().int().min(1).max(3),
  status: z.enum(ATTENDANCE_STATUSES as [string, ...string[]]),
  time_in: optionalTime,
  time_out: optionalTime,
  // Saisie manuelle uniquement : la part automatique et le total sont calculés par la base
  overtime_manual: z.coerce.number().min(0).max(24),
  // Départ anticipé pour maladie : seulement avec le statut « Absent maladie »
  sick_departure: z.boolean().optional().default(false),
  observation: z.string().max(500).default(""),
  replacing_employee_id: optionalUuid,
  chauffeur_id: optionalUuid,
  truck_id: optionalUuid,
  // Pointages passés : un ancien poste (ex. Agent de sécurité) reste enregistrable tel quel
  position: z.enum(ALL_POSITIONS as [Position, ...Position[]]),
  team_type: z.enum(["collecte", "nettoiement"]),
});

const payloadSchema = z.object({
  activity_date: z.string().date("Date invalide."),
  team_type: z.enum(["collecte", "nettoiement"]),
  team_lead: z.string().max(120).default(""),
  rows: z.array(rowSchema).max(500),
  confirm_conflicts: z.boolean().optional(),
});

/** Message du congé approuvé, avec le nom de l'employé et la date (erreur CONGE_APPROUVE|nom|date de la base). */
function leaveError(t: Awaited<ReturnType<typeof getT>>, message: string): string {
  const a = message.match(/AFFECTATION_DU_JOUR\|([^|]*)\|([0-9/]+)\|(\w+)/);
  if (a) return t("{name} est affecté temporairement à l'équipe {team} le {date} : il ne peut pas figurer sur cette feuille. Rechargez la page, ou annulez l'affectation.", { name: a[1], date: a[2], team: t(a[3] === "collecte" ? "Collecte" : "Nettoiement") });
  const d = message.match(/POINTAGE_DEUX_EQUIPES\|([^|]*)\|([0-9/]+)/);
  if (d) return t("{name} est déjà pointé dans l'autre équipe le {date} : un employé ne peut figurer que sur une seule feuille par jour.", { name: d[1], date: d[2] });
  const m = message.match(/CONGE_APPROUVE\|([^|]*)\|([0-9/]+)/);
  if (m) return t("Attention : {name} bénéficie d'un congé approuvé pour le {date}. Le pointage est automatiquement défini sur « Congé ». Toute modification nécessite une autorisation.", { name: m[1], date: m[2] });
  return t(friendlyError(message));
}

/**
 * Autorise une modification exceptionnelle du pointage sur une date de congé approuvé
 * (droits de modification sur les congés ET le pointage, motif obligatoire, journalisé).
 * La demande de congé n'est pas modifiée ; la dérogation est conservée dans l'historique.
 */
export async function authorizeLeaveOverride(employeeId: string, date: string, reason: string): Promise<ActionResult<{ id: string; reason: string; at: string }>> {
  const t = await getT();
  const a1 = await assertModule("conges", "edit");
  if ("error" in a1) return { ok: false, error: t("Seuls les utilisateurs autorisés à modifier les congés et le pointage peuvent autoriser cette modification.") };
  const a2 = await assertModule("pointage", "edit");
  if ("error" in a2) return { ok: false, error: t("Seuls les utilisateurs autorisés à modifier les congés et le pointage peuvent autoriser cette modification.") };
  if (!z.string().uuid().safeParse(employeeId).success || !z.string().date().safeParse(date).success) return { ok: false, error: t("Saisie invalide.") };
  if (reason.trim().length < 5) return { ok: false, error: t("Indiquez le motif de la modification (5 caractères minimum).") };
  if (await isDayClosed(date)) return { ok: false, error: t("Cette journée est clôturée : aucune modification possible.") };
  const supabase = await createClient();
  const { data: req } = await supabase.from("leave_requests").select("id").eq("employee_id", employeeId).eq("status", "acceptee").lte("start_date", date).gte("end_date", date).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("attendance_leave_overrides")
    .insert({ employee_id: employeeId, activity_date: date, leave_request_id: req?.id ?? null, reason: reason.trim().slice(0, 500), created_by: a1.user.id })
    .select("id, reason, created_at")
    .single();
  if (error) return { ok: false, error: error.message.includes("duplicate") ? t("Une modification est déjà autorisée pour cet employé à cette date.") : t(friendlyError(error.message)) };
  revalidatePath("/pointage", "layout");
  return { ok: true, message: t("Modification autorisée et enregistrée dans l'historique. Vous pouvez maintenant changer le statut, puis enregistrer la feuille."), data: { id: data.id, reason: data.reason, at: data.created_at } };
}

/** Retire la dérogation : la date repasse automatiquement en « Congé ». */
export async function revokeLeaveOverride(id: string): Promise<ActionResult> {
  const t = await getT();
  const a1 = await assertModule("conges", "edit");
  const a2 = await assertModule("pointage", "edit");
  if ("error" in a1 || "error" in a2) return { ok: false, error: t("Seuls les utilisateurs autorisés à modifier les congés et le pointage peuvent autoriser cette modification.") };
  const supabase = await createClient();
  const { error } = await supabase.from("attendance_leave_overrides").update({ revoked: true }).eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/pointage", "layout");
  return { ok: true, message: t("Autorisation retirée : le pointage repasse en « Congé ».") };
}

/** Enregistre une feuille de présence complète (ajouts, modifications, suppressions). */
export async function saveSheet(payload: SheetPayload): Promise<ActionResult & { conflicts?: string[] }> {
  const t = await getT();
  const auth = await assertModule("pointage", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${t(issue.message)} (${issue.path.join(".")})` };
  }
  const { activity_date, team_type, team_lead, rows, confirm_conflicts } = parsed.data;

  if (await isDayClosed(activity_date)) {
    return { ok: false, error: t("Cette journée est clôturée : aucune modification possible.") };
  }

  const keys = new Set(rows.map((r) => `${r.employee_id}:${r.shift}`));
  if (keys.size !== rows.length) return { ok: false, error: t("Un employé apparaît deux fois sur le même service.") };

  const supabase = await createClient();

  // Affectation temporaire du jour vers l'autre équipe : l'employé ne peut pas figurer ici
  const { data: assigned } = await supabase.from("daily_team_assignments").select("employee_id, team_type").eq("activity_date", activity_date).neq("team_type", team_type).in("employee_id", rows.length ? rows.map((r) => r.employee_id) : ["00000000-0000-0000-0000-000000000000"]);
  if (assigned?.length) {
    const { data: emps } = await supabase.from("employees").select("id, last_name, first_name").in("id", assigned.map((a) => a.employee_id));
    const names = (emps ?? []).map((e) => `${e.last_name} ${e.first_name}`).join(", ");
    return { ok: false, error: t("Affectation temporaire du jour : {names} travaille(nt) ce jour dans l'autre équipe. Rechargez la page : ces agents sont retirés automatiquement de cette feuille.", { names }) };
  }

  // Conflits d'affectation : employé déjà pointé dans l'autre équipe (même date, même service),
  // ou même camion pour deux chauffeurs. Enregistrement seulement après confirmation explicite.
  const { data: others } = await supabase.from("attendance").select("employee_id, shift, team_type").eq("activity_date", activity_date).neq("team_type", team_type);
  const otherKeys = new Map((others ?? []).map((o) => [`${o.employee_id}:${o.shift}`, o.team_type as string]));
  const transfers = rows.filter((r) => otherKeys.has(`${r.employee_id}:${r.shift}`));
  const conflicts: string[] = [];
  if (transfers.length) {
    const { data: emps } = await supabase.from("employees").select("id, last_name, first_name").in("id", transfers.map((r) => r.employee_id));
    const nameOf = new Map((emps ?? []).map((e) => [e.id as string, `${e.last_name} ${e.first_name}`]));
    for (const r of transfers)
      conflicts.push(t("{name} est déjà pointé dans l'équipe {team} ce jour (service {shift}) : il sera transféré dans cette équipe.", { name: nameOf.get(r.employee_id) ?? "?", team: t(otherKeys.get(`${r.employee_id}:${r.shift}`) === "collecte" ? "Collecte" : "Nettoiement"), shift: r.shift }));
  }
  const DRIVING = ["chauffeur", "chauffeur_remplacant"];
  const byTruck = new Map<string, number>();
  for (const r of rows) if (r.truck_id && DRIVING.includes(r.position) && ["present", "repos_travaille"].includes(r.status)) byTruck.set(`${r.truck_id}:${r.shift}`, (byTruck.get(`${r.truck_id}:${r.shift}`) ?? 0) + 1);
  const dupTrucks = [...byTruck.entries()].filter(([, n]) => n > 1).map(([k]) => k.split(":")[0]);
  if (dupTrucks.length) {
    const { data: tr } = await supabase.from("trucks").select("id, matricule").in("id", dupTrucks);
    for (const x of tr ?? []) conflicts.push(t("Le camion {plate} est affecté à plusieurs chauffeurs sur le même service.", { plate: x.matricule as string }));
  }
  if (conflicts.length && !confirm_conflicts) {
    return { ok: false, error: t("Affectations à confirmer avant l'enregistrement."), conflicts };
  }

  // Lignes existantes de cette équipe/date, pour supprimer celles retirées de la feuille
  const { data: existing } = await supabase.from("attendance").select("id, employee_id, shift").eq("activity_date", activity_date).eq("team_type", team_type);
  const toDelete = (existing ?? []).filter((e) => !keys.has(`${e.employee_id}:${e.shift}`)).map((e) => e.id);
  if (toDelete.length) {
    const { error } = await supabase.from("attendance").delete().in("id", toDelete);
    if (error) return { ok: false, error: leaveError(t, error.message) };
  }

  if (rows.length) {
    const { error } = await supabase.from("attendance").upsert(
      rows.map((r) => ({ ...r, sick_departure: r.status === "absent_maladie" && !!r.sick_departure, activity_date, team_type })),
      { onConflict: "activity_date,employee_id,shift" },
    );
    if (error) return { ok: false, error: leaveError(t, error.message) };
  }

  const { error: metaError } = await supabase.from("attendance_sheet_meta").upsert({ activity_date, team_type, team_lead }, { onConflict: "activity_date,team_type" });
  if (metaError) return { ok: false, error: t(friendlyError(metaError.message)) };

  // Affectations du jour vers cette équipe : fonction et équipe de camion suivent la feuille enregistrée
  for (const r of rows.filter((x) => x.shift === 1)) {
    await supabase.from("daily_team_assignments").update({ position: r.position, chauffeur_id: team_type === "collecte" ? r.chauffeur_id : null }).eq("activity_date", activity_date).eq("employee_id", r.employee_id).eq("team_type", team_type);
  }

  revalidatePath("/pointage");

  // Rapport journalier rempli automatiquement depuis le pointage (si l'utilisateur peut le modifier)
  let reportNote = "";
  if (hasPermission(auth.user, "rapport_journalier", "edit")) {
    try {
      if (team_type === "nettoiement") {
        const n = await syncCleaningReport(supabase, activity_date);
        reportNote = t("Rapport journalier nettoiement mis à jour : {count} agent(s).", { count: n });
      } else {
        const r = await syncCollectionReports(supabase, activity_date);
        reportNote = t("Rapport journalier collecte mis à jour : {count} équipe(s).", { count: r.teams });
        if (r.warnings.length) reportNote += " " + r.warnings.map((w) => t(w.key, w.vars)).join(" ");
      }
      // Employés transférés depuis l'autre équipe : son rapport du jour est recalculé aussi
      if (transfers.length) {
        if (team_type === "nettoiement") await syncCollectionReports(supabase, activity_date);
        else await syncCleaningReport(supabase, activity_date);
      }
      revalidatePath("/rapport-journalier", "layout");
      revalidatePath("/rapport-camions");
    } catch (e) {
      reportNote = t("Le rapport journalier n'a pas pu être mis à jour : {message}", { message: t(friendlyError((e as Error).message)) });
    }
  }
  return { ok: true, message: [t("Feuille de présence enregistrée."), reportNote].filter(Boolean).join(" ") };
}

export async function closeDay(date: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("cloture", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!z.string().date().safeParse(date).success) return { ok: false, error: t("Date invalide.") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_day", { p_date: date });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/cloture");
  revalidatePath("/pointage");
  return { ok: true, message: t("Journée clôturée. Les données sont conservées dans l'historique.") };
}

export async function reopenDay(date: string, reason: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("cloture", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (auth.user.role !== "admin") return { ok: false, error: t("Seul un administrateur peut rouvrir une journée.") };
  if (!z.string().date().safeParse(date).success) return { ok: false, error: t("Date invalide.") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_day", { p_date: date, p_reason: reason });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/cloture");
  revalidatePath("/pointage");
  return { ok: true, message: t("Journée rouverte. La justification a été enregistrée dans le journal d'audit.") };
}

/**
 * Affecte temporairement un employé à une équipe pour une date (ex. un balayeur à la Collecte).
 * La fiche de l'employé n'est pas modifiée. Le pointage déjà saisi pour cette date dans l'autre
 * équipe est déplacé (statut, heures, HS, observation conservés). Renvoie ses lignes de feuille.
 */
export async function assignEmployeeForDay(input: { date: string; employee_id: string; team: TeamType; position: Position; chauffeur_id: string | null }): Promise<ActionResult<{ rows: SheetRow[] }>> {
  const t = await getT();
  const auth = await assertModule("pointage", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = z.object({ date: z.string().date(), employee_id: z.string().uuid(), team: z.enum(["collecte", "nettoiement"]), position: z.string().min(1), chauffeur_id: z.string().uuid().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("Données invalides.") };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_day_assignment", { p_date: d.date, p_employee: d.employee_id, p_team: d.team, p_position: d.position, p_chauffeur: d.chauffeur_id, p_note: "" });
  if (error) return { ok: false, error: leaveError(t, error.message) };
  await afterAssignmentChange(auth.user, d.date);
  const sheet = await buildSheet(d.date, d.team);
  return { ok: true, message: t("Agent affecté à l'équipe {team} pour le {date} uniquement. Sa fiche n'est pas modifiée.", { team: t(TEAM_LABELS[d.team]), date: formatDateFr(d.date) }), data: { rows: sheet.rows.filter((r) => r.employee_id === d.employee_id) } };
}

/** Annule l'affectation du jour : le pointage de cette date revient dans l'équipe habituelle. */
export async function cancelDayAssignment(date: string, employeeId: string): Promise<ActionResult<{ rows: SheetRow[]; team: TeamType }>> {
  const t = await getT();
  const auth = await assertModule("pointage", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!z.string().date().safeParse(date).success || !z.string().uuid().safeParse(employeeId).success) return { ok: false, error: t("Données invalides.") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_day_assignment", { p_date: date, p_employee: employeeId });
  if (error) return { ok: false, error: leaveError(t, error.message) };
  await afterAssignmentChange(auth.user, date);
  const { data: e } = await supabase.from("employees").select("team_type").eq("id", employeeId).single();
  const team = (e?.team_type ?? "nettoiement") as TeamType;
  const sheet = await buildSheet(date, team);
  return { ok: true, message: t("Affectation annulée : l'agent revient dans l'équipe {team} pour le {date}.", { team: t(TEAM_LABELS[team]), date: formatDateFr(date) }), data: { rows: sheet.rows.filter((r) => r.employee_id === employeeId), team } };
}

/** Pointage déplacé d'une équipe à l'autre : les deux rapports journaliers du jour sont recalculés. */
async function afterAssignmentChange(user: Parameters<typeof hasPermission>[0], date: string) {
  revalidatePath("/pointage", "layout");
  if (!hasPermission(user, "rapport_journalier", "edit")) return;
  const supabase = await createClient();
  try {
    await syncCleaningReport(supabase, date);
    await syncCollectionReports(supabase, date);
    revalidatePath("/rapport-journalier", "layout");
  } catch {
    // le rapport sera recalculé au prochain enregistrement de la feuille
  }
}
