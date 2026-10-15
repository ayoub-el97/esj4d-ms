"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };

  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name, role: parsed.data.role },
  });
  if (error) return { ok: false, error: `Création impossible : ${error.message}` };

  revalidatePath("/parametres/comptes");
  return { ok: true, message: `Compte ${parsed.data.email} créé.` };
}

export async function updateUserRole(userId: string, role: string): Promise<ActionResult> {
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  const parsedRole = roleSchema.safeParse(role);
  if (!parsedRole.success) return { ok: false, error: "Rôle invalide." };
  if (userId === auth.user.id && parsedRole.data !== "admin") {
    return { ok: false, error: "Vous ne pouvez pas retirer votre propre rôle administrateur." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role: parsedRole.data }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parametres/comptes");
  return { ok: true, message: "Rôle mis à jour." };
}

export async function setUserActive(userId: string, isActive: boolean): Promise<ActionResult> {
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (userId === auth.user.id) return { ok: false, error: "Vous ne pouvez pas désactiver votre propre compte." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parametres/comptes");
  return { ok: true, message: isActive ? "Compte réactivé." : "Compte désactivé." };
}

export async function resetUserPassword(userId: string, password: string): Promise<ActionResult> {
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (password.length < 8) return { ok: false, error: "Le mot de passe doit contenir au moins 8 caractères." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Mot de passe réinitialisé." };
}

// ---------------------------------------------------------------------------
// Permissions par rôle
// ---------------------------------------------------------------------------
export async function savePermissions(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };

  const rows: { role: AppRole; module: AppModule; can_view: boolean; can_edit: boolean }[] = [];
  for (const role of ROLES) {
    for (const module of MODULES) {
      if (role === "admin") continue; // l'admin a toujours tous les droits
      const canEdit = formData.get(`edit:${role}:${module}`) === "on";
      const canView = canEdit || formData.get(`view:${role}:${module}`) === "on";
      rows.push({ role, module, can_view: canView, can_edit: canEdit });
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("role_permissions").upsert(rows, { onConflict: "role,module" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Permissions enregistrées." };
}

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------
const settingsSchema = z.object({
  company_name: z.string().trim().min(1, "Nom de la société requis."),
  agency_name: z.string().trim().min(1, "Nom de l'agence requis."),
  director_email: z.union([z.literal(""), z.string().trim().email("E-mail du directeur invalide.")]),
  timezone: z.string().trim().min(1),
  leave_days_per_month: z.coerce.number().min(0).max(31),
  double_day_on_rest_day: z.boolean(),
  double_day_two_shifts: z.boolean(),
});

export async function saveSettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };

  const parsed = settingsSchema.safeParse({
    company_name: formData.get("company_name"),
    agency_name: formData.get("agency_name"),
    director_email: formData.get("director_email") ?? "",
    timezone: formData.get("timezone"),
    leave_days_per_month: formData.get("leave_days_per_month"),
    double_day_on_rest_day: formData.get("double_day_on_rest_day") === "on",
    double_day_two_shifts: formData.get("double_day_two_shifts") === "on",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const rows = Object.entries(parsed.data).map(([key, value]) => ({ key, value }));
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parametres/reglages");
  return { ok: true, message: "Réglages enregistrés." };
}

// ---------------------------------------------------------------------------
// Jours fériés
// ---------------------------------------------------------------------------
export async function addHoliday(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };

  const parsed = z
    .object({ date: z.string().date("Date invalide."), label: z.string().trim().min(1, "Libellé requis.") })
    .safeParse({ date: formData.get("date"), label: formData.get("label") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("holidays").upsert(parsed.data, { onConflict: "date" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parametres/feries");
  return { ok: true, message: "Jour férié enregistré." };
}

export async function deleteHoliday(date: string): Promise<ActionResult> {
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase.from("holidays").delete().eq("date", date);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parametres/feries");
  return { ok: true, message: "Jour férié supprimé." };
}
