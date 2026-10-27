import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPhotosFor } from "@/lib/data/photos";
import { getProjectStart } from "@/lib/data/settings";
import { workMonthOf } from "@/lib/dates";
import type { PhotoItem, PhotoPhase } from "@/lib/photo-types";
import { PURCHASE_CATEGORIES, purchaseLabel, type PurchaseUnit } from "@/lib/purchase-types";

/** Paiements enregistrés avant la simplification (conservés, affichés en lecture seule). */
export type PurchasePayment = { id: string; purchase_id: string; payment_date: string; amount: number; method: string; note: string; cancelled: boolean; cancel_reason: string };

export type Purchase = {
  id: string;
  purchase_date: string;
  description: string;
  category: string;
  total_amount: number;
  cancelled: boolean;
  cancel_reason: string;
  created_at: string;
  updated_at: string;
  /** Intitulé affiché (description, ou matériel pour les achats saisis avant la simplification) */
  label: string;
  // Champs des achats saisis avant la simplification (facultatifs, affichage uniquement)
  material_name: string;
  supplier_name: string;
  supplier_contact: string;
  quantity: number | null;
  unit: PurchaseUnit;
  unit_label: string;
  unit_price: number | null;
  notes: string;
  amount_paid: number;
  photos: Record<PhotoPhase, PhotoItem[]>;
  photo_count: number;
};

export type PurchaseFilters = {
  q?: string; // description, matériel
  category?: string;
  from?: string;
  to?: string;
};

const n = (v: unknown) => Number(v ?? 0);
const nn = (v: unknown) => (v == null ? null : Number(v));

function hydrateRow(r: Record<string, unknown>, photos: PhotoItem[]): Purchase {
  const g: Record<PhotoPhase, PhotoItem[]> = { vehicule: [], avant: [], apres: [], justificatif: [], materiel: [], document: [] };
  for (const p of photos) g[p.phase]?.push(p);
  const row = r as unknown as Purchase;
  return {
    ...row,
    description: (r.description as string) ?? "",
    material_name: (r.material_name as string) ?? "",
    supplier_name: (r.supplier_name as string) ?? "",
    label: purchaseLabel({ material_name: r.material_name as string, description: r.description as string }),
    quantity: nn(r.quantity),
    unit_price: nn(r.unit_price),
    total_amount: n(r.total_amount),
    amount_paid: n(r.amount_paid),
    photos: g,
    photo_count: photos.length,
  };
}

/** Liste filtrée (date d'achat, catégorie). Recherche sur la description et le matériel. */
export async function getPurchases(f: PurchaseFilters = {}, limit = 2000): Promise<Purchase[]> {
  const supabase = await createClient();
  let q = supabase.from("material_purchases_calc").select("*").order("purchase_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  if (f.from) q = q.gte("purchase_date", f.from);
  if (f.to) q = q.lte("purchase_date", f.to);
  if (f.category) q = q.eq("category", f.category);
  const { data } = await q;
  const rows = (data ?? []) as Record<string, unknown>[];
  const photos = await getPhotosFor("material_purchase", rows.map((r) => String(r.id)));
  let list = rows.map((r) => hydrateRow(r, photos.get(String(r.id)) ?? []));
  const term = (f.q ?? "").trim().toLowerCase();
  if (term) list = list.filter((p) => [p.description, p.material_name, p.notes].some((x) => (x ?? "").toLowerCase().includes(term)));
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

/** Catégories : celles proposées par défaut puis celles ajoutées par les utilisateurs. */
export async function getPurchaseCategories(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("material_purchases").select("category").limit(5000);
  const base: string[] = [...PURCHASE_CATEGORIES];
  const extra = Array.from(new Set((data ?? []).map((r) => String(r.category ?? "").trim()).filter((c) => c && !base.includes(c)))).sort((a, b) => a.localeCompare(b, "fr"));
  return [...base, ...extra];
}

// ---------------------------------------------------------------------------
// Rapports : dépenses = somme des montants saisis (achats non annulés), par date d'achat
// ---------------------------------------------------------------------------
export type PurchaseReport = {
  from: string;
  to: string;
  category?: string;
  purchases: Purchase[]; // achats non annulés de la période
  count: number;
  totalValue: number;
  byCategory: { key: string; count: number; total: number }[];
  byMonth: { month: string; purchases: number; value: number }[];
  top: Purchase[];
};

export async function getPurchaseReport(from: string, to: string, category?: string): Promise<PurchaseReport> {
  const [purchases, projectStart] = await Promise.all([getPurchases({ from, to, category }), getProjectStart()]);
  const active = purchases.filter((p) => !p.cancelled);

  const cats = new Map<string, { key: string; count: number; total: number }>();
  for (const p of active) {
    const c = cats.get(p.category) ?? { key: p.category, count: 0, total: 0 };
    c.count += 1;
    c.total += p.total_amount;
    cats.set(p.category, c);
  }
  // Par mois (mois de projet)
  const months = new Map<string, { month: string; purchases: number; value: number }>();
  for (const p of active) {
    const k = workMonthOf(p.purchase_date, projectStart);
    const m = months.get(k) ?? { month: k, purchases: 0, value: 0 };
    m.purchases += 1;
    m.value += p.total_amount;
    months.set(k, m);
  }

  const round = (x: number) => Math.round(x * 100) / 100;
  return {
    from,
    to,
    category,
    purchases: active,
    count: active.length,
    totalValue: round(active.reduce((s, p) => s + p.total_amount, 0)),
    byCategory: Array.from(cats.values()).sort((a, b) => b.total - a.total),
    byMonth: Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month)),
    top: [...active].sort((a, b) => b.total_amount - a.total_amount).slice(0, 10),
  };
}
