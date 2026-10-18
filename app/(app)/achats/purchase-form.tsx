"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Save } from "lucide-react";
import { savePurchase } from "@/lib/actions/purchases";
import type { Purchase } from "@/lib/data/purchases";
import { useT } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/money";
import type { PhotoPhase } from "@/lib/photo-types";
import { PAYMENT_METHODS, PURCHASE_CATEGORIES, PURCHASE_CATEGORY_LABELS, PURCHASE_PHOTO_GROUPS, PURCHASE_UNITS, PURCHASE_UNIT_LABELS, computeTotal, type PurchaseUnit } from "@/lib/purchase-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { LinkButton } from "@/components/link-button";
import { PhotoUploader } from "@/components/photo-uploader";
import { PendingPhotosPicker, uploadPendingPhotos, type PendingPhoto } from "@/components/pending-photos";

const toNum = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));

export function PurchaseForm({ purchase, suppliers, defaultDate, canEdit, isAdmin }: { purchase: Purchase | null; suppliers: string[]; defaultDate: string; canEdit: boolean; isAdmin: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const unitDh = t("DH");
  const [quantity, setQuantity] = useState(purchase ? String(purchase.quantity) : "");
  const [unitPrice, setUnitPrice] = useState(purchase ? String(purchase.unit_price) : "");
  const [unit, setUnit] = useState<PurchaseUnit>(purchase?.unit ?? "piece");
  const [adjust, setAdjust] = useState(purchase?.amount_adjusted ?? false);
  const [total, setTotal] = useState(purchase?.amount_adjusted ? String(purchase.total_amount) : "");
  const [paid, setPaid] = useState("");
  const [pending, setPending] = useState<Record<string, PendingPhoto[]>>({ materiel: [], justificatif: [], document: [] });

  const q = toNum(quantity);
  const pu = toNum(unitPrice);
  const computed = Number.isFinite(q) && Number.isFinite(pu) ? computeTotal(q, pu) : null;
  const finalTotal = adjust && total !== "" ? toNum(total) : computed;
  const discrepancy = adjust && computed != null && Number.isFinite(toNum(total)) && Math.abs(toNum(total) - computed) >= 0.005;
  const alreadyPaid = purchase?.amount_paid ?? 0;
  const paidNow = purchase ? alreadyPaid : Number.isFinite(toNum(paid)) ? toNum(paid) : 0;
  const due = finalTotal != null && Number.isFinite(finalTotal) ? Math.round((finalTotal - paidNow) * 100) / 100 : null;

  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof savePurchase>> | null, formData: FormData) => {
    const r = await savePurchase(prev, formData);
    if (!r.ok || !r.data) return r;
    if (purchase) {
      toast.success(r.message);
      router.refresh();
      return r;
    }
    let failed = 0;
    let sent = 0;
    for (const g of PURCHASE_PHOTO_GROUPS) {
      const list = pending[g.phase];
      if (!list.length) continue;
      failed += await uploadPendingPhotos(list, { entityType: "material_purchase", entityId: r.data.id, phase: g.phase as PhotoPhase, activityDate: null });
      sent += list.length;
    }
    if (failed) toast.error(t("{count} photo(s) non envoyée(s) : ajoutez-les à nouveau sur la fiche.", { count: failed }));
    else toast.success(sent ? t("Achat enregistré avec {count} photo(s).", { count: sent }) : r.message);
    router.push(`/achats/${r.data.id}?ok=1`);
    return r;
  }, null);

  const photoBlock = (phase: PhotoPhase, title: string) =>
    purchase ? (
      <PhotoUploader key={phase} entityType="material_purchase" entityId={purchase.id} phase={phase} activityDate={null} photos={purchase.photos[phase]} canEdit={canEdit} title={title} />
    ) : (
      canEdit && <PendingPhotosPicker key={phase} photos={pending[phase]} onChange={(list) => setPending((p) => ({ ...p, [phase]: list }))} title={title} />
    );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={purchase?.id ?? ""} />
      <ActionMessage state={state && !state.ok ? state : null} />
      <fieldset disabled={!canEdit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("1. Achat et fournisseur")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="purchase_date">{t("Date d'achat")}</Label>
              <Input id="purchase_date" name="purchase_date" type="date" defaultValue={purchase?.purchase_date ?? defaultDate} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="supplier_name">{t("Fournisseur")}</Label>
              <Input id="supplier_name" name="supplier_name" list="suppliers" defaultValue={purchase?.supplier_name ?? ""} required placeholder={t("Nom du fournisseur")} />
              <datalist id="suppliers">
                {suppliers.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label htmlFor="supplier_contact">{t("Contact du fournisseur (facultatif)")}</Label>
              <Input id="supplier_contact" name="supplier_contact" defaultValue={purchase?.supplier_contact ?? ""} placeholder={t("Téléphone, adresse…")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("2. Matériel")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="material_name">{t("Matériel acheté")}</Label>
                <Input id="material_name" name="material_name" defaultValue={purchase?.material_name ?? ""} required placeholder={t("Ex. produits de nettoyage, balais, gants…")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="category">{t("Catégorie")}</Label>
                <NativeSelect id="category" name="category" defaultValue={purchase?.category ?? "produits_nettoyage"}>
                  {PURCHASE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(PURCHASE_CATEGORY_LABELS[c])}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="description">{t("Description")}</Label>
                <Textarea id="description" name="description" defaultValue={purchase?.description ?? ""} rows={2} />
              </div>
            </div>
            {photoBlock("materiel", "Photos du matériel")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("3. Quantité et prix")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="quantity">{t("Quantité")}</Label>
                <Input id="quantity" name="quantity" type="number" step="0.001" min="0.001" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="unit">{t("Unité")}</Label>
                <NativeSelect id="unit" name="unit" value={unit} onChange={(e) => setUnit(e.target.value as PurchaseUnit)}>
                  {PURCHASE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {t(PURCHASE_UNIT_LABELS[u])}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {unit === "autre" && (
                <div className="space-y-1">
                  <Label htmlFor="unit_label">{t("Préciser l'unité")}</Label>
                  <Input id="unit_label" name="unit_label" defaultValue={purchase?.unit_label ?? ""} placeholder={t("Ex. rouleau, sac…")} />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="unit_price">{t("Prix unitaire ({unit})", { unit: unitDh })}</Label>
                <Input id="unit_price" name="unit_price" type="number" step="0.01" min="0" inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />
              </div>
            </div>
            <div className="rounded-lg bg-muted/60 p-3 text-sm">
              <div className="text-xs text-muted-foreground">{t("Montant total = quantité × prix unitaire")}</div>
              <div className="text-xl font-bold tabular-nums">{finalTotal != null && Number.isFinite(finalTotal) ? formatMoney(finalTotal, unitDh) : "—"}</div>
              {discrepancy && computed != null && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-orange-700">
                  <AlertTriangle className="size-3.5" /> {t("Écart avec le calcul : {computed} (quantité × prix). Ajustement documenté.", { computed: formatMoney(computed, unitDh) })}
                </p>
              )}
              {purchase?.amount_adjusted && !isAdmin && <p className="mt-1 text-xs text-orange-700">{t("Montant ajusté par l'administrateur : {reason}", { reason: purchase.adjustment_reason })}</p>}
            </div>
            {isAdmin ? (
              <div className="space-y-2 rounded-lg border border-dashed p-3">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="adjust" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} className="mt-0.5 size-4" />
                  <span>
                    {t("Le montant de la facture diffère du calcul (remise, frais…)")}
                    <span className="block text-xs text-muted-foreground">{t("Réservé à l'administrateur ; le motif est enregistré dans l'historique.")}</span>
                  </span>
                </label>
                {adjust && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="total_amount">{t("Montant total facturé ({unit})", { unit: unitDh })}</Label>
                      <Input id="total_amount" name="total_amount" type="number" step="0.01" min="0" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="adjustment_reason">{t("Motif de l'ajustement")}</Label>
                      <Input id="adjustment_reason" name="adjustment_reason" defaultValue={purchase?.adjustment_reason ?? ""} required placeholder={t("Ex. remise de 5 %")} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              purchase?.amount_adjusted && (
                <>
                  <input type="hidden" name="adjust" value="on" />
                  <input type="hidden" name="total_amount" value={purchase.total_amount} />
                  <input type="hidden" name="adjustment_reason" value={purchase.adjustment_reason} />
                </>
              )
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("4. Paiement")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="payment_method">{t("Mode de paiement (facultatif)")}</Label>
                <Input id="payment_method" name="payment_method" list="payment-methods" defaultValue={purchase?.payment_method ?? ""} />
                <datalist id="payment-methods">
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={t(m)} />
                  ))}
                </datalist>
              </div>
              {!purchase && (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="first_payment">{t("Montant payé ({unit})", { unit: unitDh })}</Label>
                    <Input id="first_payment" name="first_payment" type="number" step="0.01" min="0" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="first_payment_date">{t("Date du paiement")}</Label>
                    <Input id="first_payment_date" name="first_payment_date" type="date" defaultValue={defaultDate} />
                  </div>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">{t("Montant payé")}</div>
                <div className="font-semibold tabular-nums">{formatMoney(paidNow, unitDh)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t("Reste à payer")}</div>
                <div className={due != null && due < 0 ? "font-semibold text-destructive tabular-nums" : "font-semibold tabular-nums"}>{due == null ? "—" : formatMoney(due, unitDh)}</div>
              </div>
              {due != null && due < 0 && <p className="col-span-2 text-xs text-destructive sm:col-span-1">{t("Le montant payé dépasse le montant de l'achat.")}</p>}
            </div>
            {purchase && <p className="text-xs text-muted-foreground">{t("Les paiements (un ou plusieurs) s'ajoutent dans la section « Paiements » ci-dessous, sans créer de nouvel achat.")}</p>}
            <div className="space-y-1">
              <Label htmlFor="notes">{t("Notes (facultatif)")}</Label>
              <Textarea id="notes" name="notes" defaultValue={purchase?.notes ?? ""} rows={2} />
            </div>
          </CardContent>
        </Card>
      </fieldset>

      <Card>
        <CardHeader>
          <CardTitle>{t("5. Reçus, factures et documents")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {photoBlock("justificatif", "Reçus / factures")}
          {photoBlock("document", "Documents complémentaires")}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-3 shadow-md backdrop-blur lg:bottom-4">
          <SubmitButton>
            <Save /> {purchase ? t("Enregistrer les modifications") : t("Enregistrer l'achat")}
          </SubmitButton>
          <LinkButton href="/achats" variant="outline">
            {t("Annuler")}
          </LinkButton>
        </div>
      )}
    </form>
  );
}
