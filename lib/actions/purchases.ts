"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PURCHASE_CATEGORIES, PURCHASE_UNITS, computeTotal, type PurchaseCategory, type PurchaseUnit } from "@/lib/purchase-types";
import type { ActionResult } from "@/lib/types";

const num = (msg: string) => z.preprocess((v) => (v === "" || v == null ? undefined : Number(String(v).replace(",", "."))), z.number({ message: msg }).finite(msg));
const optionalNum = z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(",", "."))), z.number().finite().nullable());

const purchaseSchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  purchase_date: z.string().date("Date d'achat invalide."),
  supplier_name: z.string().trim().min(1, "Indiquez le fournisseur.").max(200),
  supplier_contact: z.string().trim().max(300).default(""),
  material_name: z.string().trim().min(1, "Indiquez le matériel acheté.").max(200),
  category: z.enum(PURCHASE_CATEGORIES as [PurchaseCategory, ...PurchaseCategory[]]),
  description: z.string().max(2000).default(""),
  quantity: num("Quantité invalide.").refine((v) => v > 0, "La quantité doit être supérieure à 0."),
  unit: z.enum(PURCHASE_UNITS as [PurchaseUnit, ...PurchaseUnit[]]),
  unit_label: z.string().trim().max(50).default(""),
  unit_price: num("Prix unitaire invalide.").refine((v) => v >= 0, "Le prix unitaire ne peut pas être négatif."),
  payment_method: z.string().trim().max(100).default(""),
  notes: z.string().max(2000).default(""),
  // Ajustement du total (administrateur, motif obligatoire)
  adjust: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  total_amount: optionalNum,
  adjustment_reason: z.string().trim().max(500).default(""),
  // Premier paiement (création)
  first_payment: optionalNum,
  first_payment_date: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().date().optional()),
});

function refresh(id?: string) {
  revalidatePath("/achats", "layout");
  if (id) revalidatePath(`/achats/${id}`);
}

function purchaseError(message: string): string {
  if (message.includes("PAIEMENT_SUPERIEUR")) return "Le total payé dépasserait le montant de l'achat.";
  if (message.includes("AJUSTEMENT_RESERVE")) return "Seul l'administrateur peut ajuster le montant total d'un achat.";
  if (message.includes("ACHAT_ANNULE")) return "Impossible d'enregistrer un paiement sur un achat annulé.";
  if (message.includes("material_purchases_adjust_chk")) return "Indiquez le motif de l'ajustement du montant.";
  if (message.includes("cancel_chk")) return "Indiquez le motif de l'annulation.";
  if (message.includes("check constraint")) return "Valeur invalide : vérifiez la quantité, le prix et les montants.";
  return friendlyError(message);
}

/**
 * Crée ou corrige un achat (jamais de doublon : la modification met à jour la même ligne).
 * Total = quantité × prix unitaire ; un total différent n'est accepté que de l'administrateur,
 * avec un motif. À la création, un premier paiement peut être saisi.
 */
export async function savePurchase(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const auth = await assertModule("achats", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = purchaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, adjust, total_amount, adjustment_reason, first_payment, first_payment_date, ...rest } = parsed.data;

  const computed = computeTotal(rest.quantity, rest.unit_price);
  const adjusted = adjust && total_amount != null && Math.abs(total_amount - computed) >= 0.005;
  if (adjusted) {
    if (auth.user.role !== "admin") return { ok: false, error: t("Seul l'administrateur peut ajuster le montant total d'un achat.") };
    if (total_amount! < 0) return { ok: false, error: t("Montant total invalide.") };
    if (!adjustment_reason) return { ok: false, error: t("Indiquez le motif de l'ajustement du montant.") };
  }
  const values = {
    ...rest,
    unit_label: rest.unit === "autre" ? rest.unit_label : "",
    amount_adjusted: adjusted,
    total_amount: adjusted ? total_amount! : computed,
    adjustment_reason: adjusted ? adjustment_reason : "",
  };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("material_purchases").update(values).eq("id", id);
    if (error) return { ok: false, error: t(purchaseError(error.message)) };
    refresh(id);
    return { ok: true, message: t("Achat enregistré."), data: { id } };
  }
  const { data, error } = await supabase.from("material_purchases").insert(values).select("id").single();
  if (error) return { ok: false, error: t(purchaseError(error.message)) };
  if (first_payment != null && first_payment > 0) {
    const { error: pe } = await supabase.from("material_purchase_payments").insert({ purchase_id: data.id, payment_date: first_payment_date ?? rest.purchase_date, amount: first_payment, method: rest.payment_method });
    if (pe) {
      refresh();
      return { ok: true, message: t("Achat enregistré, mais le paiement n'a pas été accepté : {reason}", { reason: t(purchaseError(pe.message)) }), data: { id: data.id } };
    }
  }
  refresh();
  return { ok: true, message: t("Achat enregistré."), data: { id: data.id } };
}

const paymentSchema = z.object({
  purchase_id: z.string().uuid(),
  payment_date: z.string().date("Date du paiement invalide."),
  amount: num("Montant invalide.").refine((v) => v > 0, "Le montant du paiement doit être supérieur à 0."),
  method: z.string().trim().max(100).default(""),
  note: z.string().trim().max(500).default(""),
});

/** Ajoute un paiement (règlement en plusieurs fois, sans créer de nouvel achat). */
export async function addPurchasePayment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("achats", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const supabase = await createClient();
  const { error } = await supabase.from("material_purchase_payments").insert(parsed.data);
  if (error) return { ok: false, error: t(purchaseError(error.message)) };
  refresh(parsed.data.purchase_id);
  return { ok: true, message: t("Paiement enregistré.") };
}

/** Annule un paiement saisi par erreur (conservé avec son motif dans l'historique). */
export async function cancelPurchasePayment(id: string, reason: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("achats", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!reason.trim()) return { ok: false, error: t("Indiquez le motif de l'annulation.") };
  const supabase = await createClient();
  const { data, error } = await supabase.from("material_purchase_payments").update({ cancelled: true, cancel_reason: reason.trim().slice(0, 500) }).eq("id", id).select("purchase_id").single();
  if (error) return { ok: false, error: t(purchaseError(error.message)) };
  refresh(data.purchase_id);
  return { ok: true, message: t("Paiement annulé.") };
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
