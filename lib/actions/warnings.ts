"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { deletePhotosOfEntity } from "@/lib/actions/photos";
import type { ActionResult } from "@/lib/types";

const schema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  employee_id: z.string().uuid("Choisissez un employé."),
  incident_date: z.string().date("Date de l'incident invalide."),
  description: z.string().trim().min(3, "Décrivez la faute ou l'incident."),
  observations: z.string().max(2000).default(""),
  status: z.enum(["ouvert", "en_cours", "clos"]).default("ouvert"),
});

/** Enregistre un avertissement. À la création, renvoie l'id pour que le formulaire envoie ensuite les photos choisies. */
export async function saveWarning(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const auth = await assertModule("avertissements", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();

  if (id) {
    const { error } = await supabase.from("warnings").update(values).eq("id", id);
    if (error) return { ok: false, error: t(friendlyError(error.message)) };
    revalidatePath("/avertissements");
    return { ok: true, message: t("Avertissement enregistré.") };
  }
  const { data, error } = await supabase.from("warnings").insert(values).select("id").single();
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/avertissements");
  return { ok: true, message: t("Avertissement enregistré."), data: { id: data.id } };
}

export async function deleteWarning(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("avertissements", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("warnings").delete().eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  await deletePhotosOfEntity("warning", id);
  revalidatePath("/avertissements");
  redirect("/avertissements");
}
