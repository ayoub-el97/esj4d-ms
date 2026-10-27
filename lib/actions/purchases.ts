"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

// Saisie simplifiée : date, description, catégorie, montant total saisi directement.
// Quantité, prix unitaire, fournisseur : plus demandés (les valeurs des anciens achats restent en base).
const purchaseSchema = z
  .object({
    id: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
    purchase_date: z.string().date("Date d'achat invalide."),
    description: z.string().trim().max(2000).default(""),
    category: z.string().trim().min(1, "Choisissez une catégorie.").max(60, "Nom de catégorie trop long (60 caractères maximum)."),
    new_category: z.string().trim().max(60, "Nom de catégorie trop long (60 caractères maximum).").default(""),
    total_amount: z.preprocess(
      (v) => (v === "" || v == null ? undefined : Number(String(v).replace(/\s/g, "").replace(",", "."))),
      z.number({ message: "Indiquez le montant total." }).finite("Montant total invalide.").min(0.01, "Le montant total doit être supérieur à 0.").max(99_999_999, "Montant total invalide."),
    ),
    // Anciens achats : le matériel saisi autrefois suffit comme intitulé
    has_legacy_label: z.preprocess((v) => v === "1", z.boolean()),
  })
  .transform((d) => ({ ...d, category: d.category === "__nouvelle" ? d.new_category : d.category }))
  .refine((d) => d.category.length > 0, { message: "Indiquez le nom de la nouvelle catégorie.", path: ["new_category"] })
  .refine((d) => d.description.length > 0 || d.has_legacy_label, { message: "Indiquez la description de l'achat.", path: ["description"] });

function refresh(id?: string) {
  revalidatePath("/achats", "layout");
  if (id) revalidatePath(`/achats/${id}`);
}

function purchaseError(message: string): string {
  if (message.includes("PAIEMENT_SUPERIEUR")) return "Le montant total ne peut pas être inférieur aux paiements déjà enregistrés pour cet achat.";
  if (message.includes("MONTANT_INVALIDE")) return "Le montant total doit être supérieur à 0.";
  if (message.includes("cancel_chk")) return "Indiquez le motif de l'annulation.";
  if (message.includes("material_purchases_label_chk")) return "Indiquez la description de l'achat.";
  if (message.includes("check constraint")) return "Valeur invalide : vérifiez la description, la catégorie et le montant.";
  return friendlyError(message);
}

/**
 * Crée ou corrige un achat (jamais de doublon : la modification met à jour la même ligne).
 * Le montant total est celui saisi par l'utilisateur.
 */
export async function savePurchase(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const auth = await assertModule("achats", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = purchaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, purchase_date, description, category, total_amount } = parsed.data;
  const values = { purchase_date, description, category, total_amount: Math.round(total_amount * 100) / 100 };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("material_purchases").update(values).eq("id", id);
    if (error) return { ok: false, error: t(purchaseError(error.message)) };
    refresh(id);
    return { ok: true, message: t("Achat enregistré."), data: { id } };
  }
  const { data, error } = await supabase.from("material_purchases").insert(values).select("id").single();
  if (error) return { ok: false, error: t(purchaseError(error.message)) };
  refresh();
  return { ok: true, message: t("Achat enregistré."), data: { id: data.id } };
}

/** Annule un achat (jamais supprimé) ou le rétablit. Un achat annulé n'entre plus dans les totaux. */
export async function setPurchaseCancelled(id: string, cancelled: boolean, reason: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("achats", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (cancelled && !reason.trim()) return { ok: false, error: t("Indiquez le motif de l'annulation.") };
  const supabase = await createClient();
  const { error } = await supabase.from("material_purchases").update({ cancelled, cancel_reason: cancelled ? reason.trim().slice(0, 500) : "" }).eq("id", id);
  if (error) return { ok: false, error: t(purchaseError(error.message)) };
  refresh(id);
  return { ok: true, message: cancelled ? t("Achat annulé (conservé dans l'historique).") : t("Achat rétabli.") };
}
