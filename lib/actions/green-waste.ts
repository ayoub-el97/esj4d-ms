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
  activity_date: z.string().date("Date invalide."),
  location: z.string().max(200).default(""),
  comment: z.string().max(2000).default(""),
});

export async function saveGreenWaste(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await assertModule("dechet_vert", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("green_waste_entries").update(values).eq("id", id);
    if (error) return { ok: false, error: friendlyError(error.message) };
    revalidatePath("/dechet-vert");
    return { ok: true, message: "Entrée enregistrée." };
  }
  const { data, error } = await supabase.from("green_waste_entries").insert(values).select("id").single();
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath("/dechet-vert");
  redirect(`/dechet-vert/${data.id}`);
}

export async function deleteGreenWaste(id: string): Promise<ActionResult> {
  const auth = await assertModule("dechet_vert", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createClient();
  const { data: row } = await supabase.from("green_waste_entries").select("activity_date").eq("id", id).maybeSingle();
  const { error } = await supabase.from("green_waste_entries").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyError(error.message) };
  await deletePhotosOfEntity("green_waste", id);
  revalidatePath("/dechet-vert");
  redirect(`/dechet-vert?date=${row?.activity_date ?? ""}`);
}
