"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
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

export async function saveWarning(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await assertModule("avertissements", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();

  if (id) {
    const { error } = await supabase.from("warnings").update(values).eq("id", id);
    if (error) return { ok: false, error: friendlyError(error.message) };
    revalidatePath("/avertissements");
    return { ok: true, message: "Avertissement enregistré." };
  }
  const { data, error } = await supabase.from("warnings").insert(values).select("id").single();
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath("/avertissements");
  redirect(`/avertissements/${data.id}?ok=1`);
}

export async function deleteWarning(id: string): Promise<ActionResult> {
  const auth = await assertModule("avertissements", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase.from("warnings").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyError(error.message) };
  await deletePhotosOfEntity("warning", id);
  revalidatePath("/avertissements");
  redirect("/avertissements");
}
