"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const requestSchema = z
  .object({
    employee_id: z.string().uuid("Choisissez un employé."),
    start_date: z.string().date("Date de début invalide."),
    end_date: z.string().date("Date de fin invalide."),
    reason: z.string().max(500).default(""),
  })
  .refine((d) => d.end_date >= d.start_date, { message: "La date de fin doit être postérieure ou égale à la date de début.", path: ["end_date"] });

export async function createLeaveRequest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await assertModule("conges", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("leave_requests").insert(parsed.data);
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath("/conges");
  return { ok: true, message: "Demande de congé enregistrée (en attente)." };
}

export async function decideLeaveRequest(id: string, status: "acceptee" | "refusee" | "en_attente", note = ""): Promise<ActionResult> {
  const auth = await assertModule("conges", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!["acceptee", "refusee", "en_attente"].includes(status)) return { ok: false, error: "Statut invalide." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status, decided_by: status === "en_attente" ? null : auth.user.id, decided_at: status === "en_attente" ? null : new Date().toISOString(), decision_note: note.slice(0, 500) })
    .eq("id", id);
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath("/conges");
  return { ok: true, message: status === "acceptee" ? "Demande acceptée." : status === "refusee" ? "Demande refusée." : "Demande remise en attente." };
}

export async function deleteLeaveRequest(id: string): Promise<ActionResult> {
  const auth = await assertModule("conges", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase.from("leave_requests").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath("/conges");
  return { ok: true, message: "Demande supprimée." };
}

const adjustmentSchema = z.object({
  employee_id: z.string().uuid(),
  days: z.coerce.number().refine((n) => n !== 0, "Indiquez un nombre de jours (positif ou négatif)."),
  reason: z.string().trim().min(3, "Le motif est obligatoire."),
});

export async function addLeaveAdjustment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await assertModule("conges", "edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (auth.user.role !== "admin") return { ok: false, error: "Seul un administrateur peut ajuster un solde." };
  const parsed = adjustmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("leave_adjustments").insert(parsed.data);
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath("/conges");
  return { ok: true, message: "Ajustement enregistré (tracé dans le journal d'audit)." };
}
