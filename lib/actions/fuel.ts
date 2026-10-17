"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { formatDateFr } from "@/lib/dates";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { deletePhotosOfEntity } from "@/lib/actions/photos";
import type { ActionResult } from "@/lib/types";

const positive = (msg: string) => z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number({ message: msg }).positive(msg));
const nonNegative = (msg: string) => z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number({ message: msg }).min(0, msg));

const schema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  activity_date: z.string().date("Date invalide."),
  truck_id: z.string().uuid("Choisissez un camion."),
  driver_id: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable()),
  liters: positive("Indiquez le nombre de litres."),
  cost: nonNegative("Indiquez le coût du plein."),
  odometer_km: nonNegative("Indiquez le kilométrage du compteur."),
  station: z.string().max(200).default(""),
  observations: z.string().max(2000).default(""),
});

export async function saveFuelEntry(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_camions", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();

  // Le compteur ne peut pas reculer : cohérence avec le plein précédent et le suivant du même camion
  const others = supabase.from("fuel_entries").select("activity_date, odometer_km").eq("truck_id", values.truck_id);
  const [{ data: before }, { data: after }] = await Promise.all([
    (id ? others.neq("id", id) : others).lte("activity_date", values.activity_date).order("activity_date", { ascending: false }).order("odometer_km", { ascending: false }).limit(1).maybeSingle(),
    (() => {
      const q = supabase.from("fuel_entries").select("activity_date, odometer_km").eq("truck_id", values.truck_id).gt("activity_date", values.activity_date);
      return (id ? q.neq("id", id) : q).order("activity_date").order("odometer_km").limit(1).maybeSingle();
    })(),
  ]);
  if (before && values.odometer_km < Number(before.odometer_km))
    return { ok: false, error: t("Kilométrage inférieur au plein précédent de ce camion ({km} km le {date}).", { km: Number(before.odometer_km), date: formatDateFr(before.activity_date) }) };
  if (after && values.odometer_km > Number(after.odometer_km))
    return { ok: false, error: t("Kilométrage supérieur au plein suivant de ce camion ({km} km le {date}).", { km: Number(after.odometer_km), date: formatDateFr(after.activity_date) }) };

  if (id) {
    const { error } = await supabase.from("fuel_entries").update(values).eq("id", id);
    if (error) return { ok: false, error: t(friendlyError(error.message)) };
    revalidatePath("/rapport-camions/carburant");
    return { ok: true, message: t("Plein enregistré.") };
  }
  const { data, error } = await supabase.from("fuel_entries").insert(values).select("id").single();
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/rapport-camions/carburant");
  redirect(`/rapport-camions/carburant/${data.id}?ok=1`);
}

export async function deleteFuelEntry(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("rapport_camions", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("fuel_entries").delete().eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  await deletePhotosOfEntity("fuel_entry", id);
  revalidatePath("/rapport-camions/carburant");
  return { ok: true, message: t("Plein supprimé.") };
}
