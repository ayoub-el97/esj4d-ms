"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { BRANDING_BUCKET } from "@/lib/data/settings";
import type { ActionResult } from "@/lib/types";

// ---------------------------------------------------------------------------
// Identité de l'entreprise
// ---------------------------------------------------------------------------
const companySchema = z.object({
  company_name: z.string().trim().min(1, "Nom de la société requis."),
  agency_name: z.string().trim().min(1, "Nom de l'agence requis."),
});

export async function saveCompanyProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = companySchema.safeParse({ company_name: formData.get("company_name"), agency_name: formData.get("agency_name") });
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };

  const supabase = await createClient();
  const rows = Object.entries(parsed.data).map(([key, value]) => ({ key, value }));
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/", "layout");
  return { ok: true, message: t("Profil de l'entreprise enregistré.") };
}

/**
 * Enregistre le chemin du logo (déjà téléversé dans le bucket "branding" par le navigateur)
 * et supprime l'ancien fichier. path = null retire le logo.
 */
export async function setCompanyLogo(path: string | null): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (path !== null && !/^logo\/[\w.-]+$/.test(path)) return { ok: false, error: t("Chemin de fichier invalide.") };

  const supabase = await createClient();
  const { data: current } = await supabase.from("settings").select("value").eq("key", "company_logo_path").maybeSingle();
  const { error } = await supabase.from("settings").upsert({ key: "company_logo_path", value: path ?? "" }, { onConflict: "key" });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };

  const oldPath = current?.value as string | undefined;
  if (oldPath && oldPath !== path) await supabase.storage.from(BRANDING_BUCKET).remove([oldPath]);

  revalidatePath("/", "layout");
  return { ok: true, message: path ? t("Logo mis à jour.") : t("Logo supprimé.") };
}

// ---------------------------------------------------------------------------
// Chefs d'équipe
// ---------------------------------------------------------------------------
const leadSchema = z.object({
  id: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().uuid().optional()),
  full_name: z.string().trim().min(2, "Nom du chef d'équipe requis."),
  team_type: z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(["collecte", "nettoiement"]).nullable()),
  phone: z.string().trim().max(30).default(""),
  employee_id: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable()),
});

export async function saveTeamLead(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, ...values } = parsed.data;

  const supabase = await createClient();
  const { error } = id ? await supabase.from("team_leads").update(values).eq("id", id) : await supabase.from("team_leads").insert(values);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/profil");
  return { ok: true, message: id ? t("Chef d'équipe modifié.") : t("Chef d'équipe ajouté.") };
}

export async function setTeamLeadActive(id: string, isActive: boolean): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("team_leads").update({ is_active: isActive }).eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/profil");
  return { ok: true, message: isActive ? t("Chef d'équipe réactivé.") : t("Chef d'équipe désactivé.") };
}

export async function deleteTeamLead(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("team_leads").delete().eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/profil");
  return { ok: true, message: t("Chef d'équipe supprimé.") };
}
