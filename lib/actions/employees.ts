"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable());
const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().date().nullable());

const employeeSchema = z
  .object({
    id: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
    matricule: z.string().trim().min(1, "Matricule requis."),
    last_name: z.string().trim().min(1, "Nom requis."),
    first_name: z.string().trim().min(1, "Prénom requis."),
    position: z.enum(["chauffeur", "rippeur", "balayeur"]),
    rest_day: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(6).nullable()),
    truck_id: optionalUuid,
    chauffeur_id: optionalUuid,
    hire_date: optionalDate,
    phone: z.string().trim().default(""),
    is_active: z.boolean(),
  })
  .transform((d) => ({
    ...d,
    team_type: d.position === "balayeur" ? ("nettoiement" as const) : ("collecte" as const),
    truck_id: d.position === "chauffeur" ? d.truck_id : null,
    chauffeur_id: d.position === "rippeur" ? d.chauffeur_id : null,
  }));

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
    hire_date: formData.get("hire_date"),
    phone: formData.get("phone") ?? "",
    is_active: formData.get("is_active") === "on",
  });
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };

  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = id ? await supabase.from("employees").update(values).eq("id", id) : await supabase.from("employees").insert(values);
  if (error) return { ok: false, error: t(friendlyDbError(error.message)) };

  revalidatePath("/employes");
  revalidatePath("/profil");
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

// ---------------------------------------------------------------------------
// Camions
// ---------------------------------------------------------------------------
const truckSchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  matricule: z.string().trim().min(1, "Matricule requis."),
  brand: z.string().trim().default(""),
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
    is_active: formData.get("is_active") !== "off",
  });
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };

  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = id ? await supabase.from("trucks").update(values).eq("id", id) : await supabase.from("trucks").insert(values);
  if (error) return { ok: false, error: t(friendlyDbError(error.message)) };

  revalidatePath("/employes/camions");
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
  return { ok: true, message: isActive ? t("Camion réactivé.") : t("Camion désactivé.") };
}

function friendlyDbError(message: string): string {
  if (message.includes("duplicate key") && message.includes("matricule")) return "Ce matricule existe déjà.";
  return friendlyError(message);
}
