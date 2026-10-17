"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { moroccoHolidays } from "@/lib/holidays-ma";
import { MODULES, ROLES, type ActionResult, type AppModule, type AppRole } from "@/lib/types";

const roleSchema = z.enum(ROLES as [AppRole, ...AppRole[]]);

// ---------------------------------------------------------------------------
// Comptes utilisateurs
// ---------------------------------------------------------------------------
const createUserSchema = z.object({
  email: z.string().trim().email("Adresse e-mail invalide."),
  full_name: z.string().trim().min(2, "Nom complet requis."),
  role: roleSchema,
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

export async function createUser(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };

  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name, role: parsed.data.role },
  });
  if (error) return { ok: false, error: t("Création impossible : {message}", { message: error.message }) };

  revalidatePath("/parametres/comptes");
  return { ok: true, message: t("Compte {email} créé.", { email: parsed.data.email }) };
}

export async function updateUserRole(userId: string, role: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsedRole = roleSchema.safeParse(role);
  if (!parsedRole.success) return { ok: false, error: t("Rôle invalide.") };
  if (userId === auth.user.id && parsedRole.data !== "admin") {
    return { ok: false, error: t("Vous ne pouvez pas retirer votre propre rôle administrateur.") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role: parsedRole.data }).eq("id", userId);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/parametres/comptes");
  return { ok: true, message: t("Rôle mis à jour.") };
}

export async function setUserActive(userId: string, isActive: boolean): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (userId === auth.user.id) return { ok: false, error: t("Vous ne pouvez pas désactiver votre propre compte.") };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", userId);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/parametres/comptes");
  return { ok: true, message: isActive ? t("Compte réactivé.") : t("Compte désactivé.") };
}

export async function resetUserPassword(userId: string, password: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (password.length < 8) return { ok: false, error: t("Le mot de passe doit contenir au moins 8 caractères.") };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: t("Mot de passe réinitialisé.") };
}

// ---------------------------------------------------------------------------
// Permissions par rôle
// ---------------------------------------------------------------------------
export async function savePermissions(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };

  const rows: { role: AppRole; module: AppModule; can_view: boolean; can_edit: boolean }[] = [];
  for (const role of ROLES) {
    for (const mod of MODULES) {
      if (role === "admin") continue; // l'admin a toujours tous les droits
      const canEdit = formData.get(`edit:${role}:${mod}`) === "on";
      const canView = canEdit || formData.get(`view:${role}:${mod}`) === "on";
      rows.push({ role, module: mod, can_view: canView, can_edit: canEdit });
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("role_permissions").upsert(rows, { onConflict: "role,module" });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/", "layout");
  return { ok: true, message: t("Permissions enregistrées.") };
}

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------
const settingsSchema = z.object({
  director_email: z.union([z.literal(""), z.string().trim().email("E-mail du directeur invalide.")]),
  timezone: z.string().trim().min(1),
  leave_days_per_month: z.coerce.number().min(0).max(31),
  double_day_on_rest_day: z.boolean(),
  double_day_two_shifts: z.boolean(),
  project_start_date: z.union([z.literal(""), z.string().date("Date de début du projet invalide.")]),
});

export async function saveSettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };

  const parsed = settingsSchema.safeParse({
    director_email: formData.get("director_email") ?? "",
    timezone: formData.get("timezone"),
    leave_days_per_month: formData.get("leave_days_per_month"),
    double_day_on_rest_day: formData.get("double_day_on_rest_day") === "on",
    double_day_two_shifts: formData.get("double_day_two_shifts") === "on",
    project_start_date: formData.get("project_start_date") ?? "",
  });
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };

  const supabase = await createClient();
  const rows = Object.entries(parsed.data).map(([key, value]) => ({ key, value }));
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  // La date de début du projet change le découpage des mois partout
  revalidatePath("/", "layout");
  return { ok: true, message: t("Réglages enregistrés.") };
}

// ---------------------------------------------------------------------------
// Jours fériés
// ---------------------------------------------------------------------------
export async function addHoliday(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };

  const parsed = z
    .object({ date: z.string().date("Date invalide."), label: z.string().trim().min(1, "Libellé requis.") })
    .safeParse({ date: formData.get("date"), label: formData.get("label") });
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };

  const supabase = await createClient();
  const { error } = await supabase.from("holidays").upsert(parsed.data, { onConflict: "date" });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/parametres/feries");
  return { ok: true, message: t("Jour férié enregistré.") };
}

export async function deleteHoliday(date: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("holidays").delete().eq("date", date);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/parametres/feries");
  return { ok: true, message: t("Jour férié supprimé.") };
}

// ---------------------------------------------------------------------------
// Jours fériés du Maroc : synchronisation du calendrier
// ---------------------------------------------------------------------------
type HolidayRow = { date: string; label: string; sync_key: string | null; estimated: boolean };

/**
 * Ajoute les jours fériés officiels du Maroc pour une année (fêtes nationales + fêtes
 * religieuses estimées). Ne supprime rien, ne modifie jamais une date confirmée ni un
 * férié saisi à la main ; une date encore estimée est réajustée si le calcul change.
 */
export async function syncMoroccoHolidays(year: number): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { ok: false, error: t("Année invalide.") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holidays")
    .select("date, label, sync_key, estimated")
    .or(`and(date.gte.${year}-01-01,date.lte.${year}-12-31),sync_key.like.${year}:*`);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  const rows = (data ?? []) as HolidayRow[];
  const byKey = new Map(rows.filter((r) => r.sync_key).map((r) => [r.sync_key!, r]));
  const byDate = new Map(rows.map((r) => [r.date, r]));

  let added = 0;
  let updated = 0;
  let kept = 0;
  for (const h of moroccoHolidays(year)) {
    const linked = byKey.get(h.sync_key);
    if (linked) {
      if (!linked.estimated || linked.date === h.date || byDate.has(h.date)) {
        kept++;
        continue;
      }
      const { error: e } = await supabase.from("holidays").update({ date: h.date }).eq("sync_key", h.sync_key);
      if (e) return { ok: false, error: t(friendlyError(e.message)) };
      byDate.delete(linked.date);
      byDate.set(h.date, { ...linked, date: h.date });
      updated++;
      continue;
    }
    const sameDate = byDate.get(h.date);
    if (sameDate) {
      // Férié déjà saisi à cette date : on le rattache sans changer son libellé
      if (!sameDate.sync_key) await supabase.from("holidays").update({ sync_key: h.sync_key }).eq("date", h.date);
      kept++;
      continue;
    }
    const { error: e } = await supabase.from("holidays").insert(h);
    if (e) return { ok: false, error: t(friendlyError(e.message)) };
    byDate.set(h.date, { ...h });
    added++;
  }
  revalidatePath("/parametres/feries");
  revalidatePath("/pointage", "layout");
  return { ok: true, message: t("Année {year} : {added} férié(s) ajouté(s), {updated} date(s) estimée(s) mise(s) à jour, {kept} déjà présent(s).", { year, added, updated, kept }) };
}

/** Confirme la date d'un férié estimé (après l'annonce officielle), éventuellement en la corrigeant. */
export async function confirmHoliday(date: string, newDate?: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const d = z.string().date().safeParse(date);
  const nd = z.string().date().optional().safeParse(newDate || undefined);
  if (!d.success || !nd.success) return { ok: false, error: t("Date invalide.") };
  const supabase = await createClient();
  const target = nd.data ?? d.data;
  if (target !== d.data) {
    const { data: clash } = await supabase.from("holidays").select("date").eq("date", target).maybeSingle();
    if (clash) return { ok: false, error: t("Un jour férié existe déjà à cette date.") };
  }
  const { error } = await supabase.from("holidays").update({ date: target, estimated: false }).eq("date", d.data);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/parametres/feries");
  revalidatePath("/pointage", "layout");
  return { ok: true, message: target !== d.data ? t("Date corrigée et confirmée.") : t("Date confirmée.") };
}
