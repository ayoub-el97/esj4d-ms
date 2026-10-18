import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPhotosFor } from "@/lib/data/photos";
import { getProjectStart } from "@/lib/data/settings";
import { workMonthOf } from "@/lib/dates";
import type { PhotoItem, PhotoPhase } from "@/lib/photo-types";
import type { PaymentStatus, PurchaseCategory, PurchaseUnit } from "@/lib/purchase-types";

export type PurchasePayment = { id: string; purchase_id: string; payment_date: string; amount: number; method: string; note: string; cancelled: boolean; cancel_reason: string };

export type Purchase = {
  id: string;
  purchase_date: string;
  supplier_name: string;
  supplier_contact: string;
  material_name: string;
  category: PurchaseCategory;
  description: string;
  quantity: number;
  unit: PurchaseUnit;
  unit_label: string;
  unit_price: number;
  total_amount: number;
  computed_total: number;
  amount_adjusted: boolean;
  adjustment_reason: string;
  payment_method: string;
  notes: string;
  cancelled: boolean;
  cancel_reason: string;
  amount_paid: number;
  amount_due: number;
  payment_status: PaymentStatus;
  created_at: string;
  updated_at: string;
  photos: Record<PhotoPhase, PhotoItem[]>;
  photo_count: number;
};

export type PurchaseFilters = {
  q?: string; // matériel, fournisseur, description
  category?: string;
  supplier?: string;
  status?: string;
  from?: string;
  to?: string;
  min?: number;
  max?: number;
};

const n = (v: unknown) => Number(v ?? 0);

function hydrateRow(r: Record<string, unknown>, photos: PhotoItem[]): Purchase {
  const g: Record<PhotoPhase, PhotoItem[]> = { vehicule: [], avant: [], apres: [], justificatif: [], materiel: [], document: [] };
  for (const p of photos) g[p.phase]?.push(p);
  return {
    ...(r as unknown as Purchase),
    quantity: n(r.quantity),
    unit_price: n(r.unit_price),
    total_amount: n(r.total_amount),
    computed_total: n(r.computed_total),
    amount_paid: n(r.amount_paid),
    amount_due: n(r.amount_due),
    photos: g,
    photo_count: photos.length,
  };
}

/** Liste filtrée (date d'achat). Recherche plein texte sur matériel, fournisseur, description, notes. */
export async function getPurchases(f: PurchaseFilters = {}, limit = 2000): Promise<Purchase[]> {
  const supabase = await createClient();
  let q = supabase.from("material_purchases_calc").select("*").order("purchase_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  if (f.from) q = q.gte("purchase_date", f.from);
  if (f.to) q = q.lte("purchase_date", f.to);
  if (f.category) q = q.eq("category", f.category);
  if (f.status) q = q.eq("payment_status", f.status);
  if (f.supplier) q = q.ilike("supplier_name", `%${f.supplier.replace(/[%_]/g, "")}%`);
  if (f.min != null && Number.isFinite(f.min)) q = q.gte("total_amount", f.min);
  if (f.max != null && Number.isFinite(f.max)) q = q.lte("total_amount", f.max);
  const { data } = await q;
  const rows = (data ?? []) as Record<string, unknown>[];
  const photos = await getPhotosFor("material_purchase", rows.map((r) => String(r.id)));
  let list = rows.map((r) => hydrateRow(r, photos.get(String(r.id)) ?? []));
  const term = (f.q ?? "").trim().toLowerCase();
  if (term) list = list.filter((p) => [p.material_name, p.supplier_name, p.description, p.notes, p.supplier_contact].some((x) => (x ?? "").toLowerCase().includes(term)));
  return list;
}

export async function getPurchase(id: string): Promise<(Purchase & { payments: PurchasePayment[] }) | null> {
  const supabase = await createClient();
  const [{ data }, { data: payments }, photos] = await Promise.all([
    supabase.from("material_purchases_calc").select("*").eq("id", id).maybeSingle(),
    supabase.from("material_purchase_payments").select("*").eq("purchase_id", id).order("payment_date").order("created_at"),
    getPhotosFor("material_purchase", [id]),
  ]);
  if (!data) return null;
  return {
    ...hydrateRow(data as Record<string, unknown>, photos.get(id) ?? []),
    payments: ((payments ?? []) as PurchasePayment[]).map((p) => ({ ...p, amount: n(p.amount) })),
  };
}

export type PurchaseHistoryEntry = { at: string; tbl: string; action: string; user_email: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null };

export async function getPurchaseHistory(id: string): Promise<PurchaseHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("purchase_history", { p_purchase: id });
  if (error) return [];
  return (data ?? []) as PurchaseHistoryEntry[];
}

/** Fournisseurs déjà utilisés (suggestions de saisie). */
export async function getSuppliers(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("material_purchases").select("supplier_name, supplier_contact").order("purchase_date", { ascending: false }).limit(1000);
  return Array.from(new Set((data ?? []).map((r) => r.supplier_name as string))).sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Rapports : valeur des achats (date d'achat) ≠ paiements (date de paiement)
// ---------------------------------------------------------------------------
export type PurchaseReport = {
  from: string;
  to: string;
  purchases: Purchase[]; // achats non annulés de la période
  count: number;
  totalValue: number;
  /** Paiements effectués pendant la période (quel que soit le mois de l'achat) */
  paidInPeriod: number;
  /** Paiements de la période se rapportant à des achats d'une période antérieure */
  paidForEarlier: number;
  /** Reste dû des achats de la période */
  dueOnPeriod: number;
  /** Total dû aux fournisseurs à la fin de la période (tous achats jusqu'à cette date) */
  outstandingAtEnd: number;
  byCategory: { key: string; count: number; total: number }[];
  bySupplier: { key: string; count: number; total: number; due: number }[];
  byMaterial: { key: string; unit: string; quantity: number; count: number; total: number }[];
  byMonth: { month: string; purchases: number; value: number; paid: number }[];
  top: Purchase[];
};

export async function getPurchaseReport(from: string, to: string): Promise<PurchaseReport> {
  const supabase = await createClient();
  const [purchases, { data: pays }, { data: before }, projectStart] = await Promise.all([
    getPurchases({ from, to }),
    supabase.from("material_purchase_payments").select("purchase_id, payment_date, amount").eq("cancelled", false).gte("payment_date", from).lte("payment_date", to),
    supabase.from("material_purchases_calc").select("id, total_amount, purchase_date").lte("purchase_date", to).eq("cancelled", false),
    getProjectStart(),
  ]);
  const active = purchases.filter((p) => !p.cancelled);
  const ids = new Set(active.map((p) => p.id));
  const payments = (pays ?? []).map((p) => ({ ...p, amount: n(p.amount) }));

  // Reste dû à la fin de la période : achats (non annulés) jusqu'à « to » − leurs paiements jusqu'à « to »
  const { data: paidToEnd } = await supabase
    .from("material_purchase_payments")
    .select("amount, material_purchases!inner(purchase_date, cancelled)")
    .eq("cancelled", false)
    .lte("payment_date", to)
    .lte("material_purchases.purchase_date", to)
    .eq("material_purchases.cancelled", false);
  const outstandingAtEnd = (before ?? []).reduce((s, b) => s + n(b.total_amount), 0) - (paidToEnd ?? []).reduce((s, p) => s + n(p.amount), 0);

  const group = <T extends { key: string }>(list: Purchase[], keyOf: (p: Purchase) => string, init: (k: string, p: Purchase) => T, add: (acc: T, p: Purchase) => void) => {
    const m = new Map<string, T>();
    for (const p of list) {
      const k = keyOf(p);
      const acc = m.get(k) ?? init(k, p);
      add(acc, p);
      m.set(k, acc);
    }
    return Array.from(m.values());
  };

  const byCategory = group(active, (p) => p.category, (key) => ({ key, count: 0, total: 0 }), (a, p) => ((a.count += 1), (a.total += p.total_amount))).sort((a, b) => b.total - a.total);
  const bySupplier = group(active, (p) => p.supplier_name.trim(), (key) => ({ key, count: 0, total: 0, due: 0 }), (a, p) => ((a.count += 1), (a.total += p.total_amount), (a.due += p.amount_due))).sort((a, b) => b.total - a.total);
  const byMaterial = group(
    active,
    (p) => `${p.material_name.trim().toLowerCase()}|${p.unit}|${p.unit_label}`,
    (key, p) => ({ key: p.material_name.trim(), unit: p.unit === "autre" ? p.unit_label : p.unit, quantity: 0, count: 0, total: 0 }),
    (a, p) => ((a.quantity += p.quantity), (a.count += 1), (a.total += p.total_amount)),
  ).sort((a, b) => b.count - a.count || b.total - a.total);

  // Par mois (mois de projet) : valeur des achats et paiements effectués
  const months = new Map<string, { month: string; purchases: number; value: number; paid: number }>();
  const mo = (d: string) => {
    const k = workMonthOf(d, projectStart);
    const v = months.get(k) ?? { month: k, purchases: 0, value: 0, paid: 0 };
    months.set(k, v);
    return v;
  };
  for (const p of active) {
    const m = mo(p.purchase_date);
    m.purchases += 1;
    m.value += p.total_amount;
  }
  for (const pay of payments) mo(pay.payment_date).paid += pay.amount;

  const round = (x: number) => Math.round(x * 100) / 100;
  return {
    from,
    to,
    purchases: active,
    count: active.length,
    totalValue: round(active.reduce((s, p) => s + p.total_amount, 0)),
    paidInPeriod: round(payments.reduce((s, p) => s + p.amount, 0)),
    paidForEarlier: round(payments.filter((p) => !ids.has(p.purchase_id)).reduce((s, p) => s + p.amount, 0)),
    dueOnPeriod: round(active.reduce((s, p) => s + p.amount_due, 0)),
    outstandingAtEnd: round(outstandingAtEnd),
    byCategory,
    bySupplier,
    byMaterial,
    byMonth: Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month)),
    top: [...active].sort((a, b) => b.total_amount - a.total_amount).slice(0, 10),
  };
}
