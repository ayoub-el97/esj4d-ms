"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { REPAIR_STATUSES, type RepairStatus } from "@/lib/repair-types";
import type { ActionResult } from "@/lib/types";

const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().date("Date de réparation invalide.").nullable());
const optionalCost = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number({ message: "Coût invalide." }).min(0, "Coût invalide.").nullable());

const schema = z
  .object({
    id: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
    truck_id: z.string().uuid("Choisissez le camion."),
    reported_date: z.string().date("Date du problème invalide."),
    problem_description: z.string().trim().min(3, "Décrivez le problème."),
    problem_location: z.string().trim().max(200).default(""),
    notes: z.string().max(2000).default(""),
    repair_date: optionalDate,
    repair_description: z.string().max(4000).default(""),
    status: z.enum(REPAIR_STATUSES as [RepairStatus, ...RepairStatus[]]),
    cost: optionalCost,
    cancelled_expense: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    repair_notes: z.string().max(2000).default(""),
    out_of_service: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    out_of_service_since: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().date("Date d'immobilisation invalide.").nullable()),
    expected_return_date: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().date("Date de remise en service prévue invalide.").nullable()),
    correction_reason: z.string().trim().max(500).default(""),
  })
  .refine((d) => !d.out_of_service || !!d.out_of_service_since, { message: "Indiquez la date à laquelle le camion est devenu indisponible.", path: ["out_of_service_since"] })
  .refine((d) => !d.out_of_service || d.status !== "repare" || !d.repair_date || !d.out_of_service_since || d.repair_date >= d.out_of_service_since, {
    message: "La date de remise en service ne peut pas précéder la date d'immobilisation.",
    path: ["repair_date"],
  })
  .refine((d) => !d.out_of_service || !d.expected_return_date || !d.out_of_service_since || d.expected_return_date >= d.out_of_service_since, {
    message: "La remise en service prévue ne peut pas précéder la date d'immobilisation.",
    path: ["expected_return_date"],
  })
  .refine((d) => d.status !== "repare" || (d.repair_date && d.cost != null), { message: "Pour une réparation terminée, indiquez la date de réparation et le coût (0 si gratuit).", path: ["status"] })
  .refine((d) => !d.repair_date || d.repair_date >= d.reported_date, { message: "La date de réparation ne peut pas précéder la date du problème.", path: ["repair_date"] })
  .transform(({ out_of_service, correction_reason, ...d }) => ({
    ...d,
    cancelled_expense: d.status === "annule" ? d.cancelled_expense : false,
    out_of_service_since: out_of_service ? d.out_of_service_since : null,
    expected_return_date: out_of_service ? d.expected_return_date : null,
    // Motif envoyé seulement s'il est saisi (le précédent reste dans le journal)
    ...(correction_reason ? { correction_reason } : {}),
  }));

function refresh(id?: string) {
  revalidatePath("/reparations", "layout");
  if (id) revalidatePath(`/reparations/${id}`);
}

/** Crée ou modifie un dossier de réparation. À la création, renvoie l'id pour l'envoi des photos. */
export async function saveRepair(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const auth = await assertModule("rapport_camions", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("truck_repairs").update(values).eq("id", id);
    if (error) return { ok: false, error: t(friendlyError(error.message)) };
    refresh(id);
    return { ok: true, message: t("Dossier de réparation enregistré."), data: { id } };
  }
  const { data, error } = await supabase.from("truck_repairs").insert(values).select("id").single();
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  refresh();
  return { ok: true, message: t("Problème enregistré."), data: { id: data.id } };
}
