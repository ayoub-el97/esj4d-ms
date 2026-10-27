"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { savePurchase } from "@/lib/actions/purchases";
import type { Purchase } from "@/lib/data/purchases";
import { useT } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/money";
import type { PhotoPhase } from "@/lib/photo-types";
import { PURCHASE_PHOTO_GROUPS, categoryLabel, unitLabel } from "@/lib/purchase-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { LinkButton } from "@/components/link-button";
import { PhotoUploader } from "@/components/photo-uploader";
import { PendingPhotosPicker, uploadPendingPhotos, type PendingPhoto } from "@/components/pending-photos";

const NEW = "__nouvelle";

/**
 * Achat : date d'achat, description, catégorie, montant total (DH) saisi directement,
 * photos des achats et photos de la facture / du bon (facultatives).
 */
export function PurchaseForm({ purchase, categories, defaultDate, canEdit }: { purchase: Purchase | null; categories: string[]; defaultDate: string; canEdit: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const unitDh = t("DH");
  const [category, setCategory] = useState(purchase?.category ?? categories[0] ?? "");
  const [pending, setPending] = useState<Record<string, PendingPhoto[]>>({ materiel: [], justificatif: [] });
  const legacy = purchase && (purchase.material_name || purchase.supplier_name || purchase.quantity != null);

  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof savePurchase>> | null, formData: FormData) => {
    const r = await savePurchase(prev, formData);
    if (!r.ok || !r.data) return r;
    if (purchase) {
      toast.success(r.message);
      router.refresh();
      return r;
    }
    // Photos envoyées une seule fois, après l'enregistrement de l'achat
    let failed = 0;
    let sent = 0;
    for (const g of PURCHASE_PHOTO_GROUPS) {
      const list = pending[g.phase];
      if (!list.length) continue;
      failed += await uploadPendingPhotos(list, { entityType: "material_purchase", entityId: r.data.id, phase: g.phase as PhotoPhase, activityDate: null });
      sent += list.length;
    }
    setPending({ materiel: [], justificatif: [] });
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
      <input type="hidden" name="has_legacy_label" value={purchase?.material_name ? "1" : ""} />
      <ActionMessage state={state && !state.ok ? state : null} />
      <Card>
        <CardHeader>
          <CardTitle>{t("Achat")}</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="purchase_date">{t("Date d'achat")}</Label>
              <Input id="purchase_date" name="purchase_date" type="date" defaultValue={purchase?.purchase_date ?? defaultDate} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="total_amount">{t("Montant total ({unit})", { unit: unitDh })}</Label>
              <Input id="total_amount" name="total_amount" type="number" step="0.01" min="0.01" inputMode="decimal" defaultValue={purchase ? purchase.total_amount : ""} required />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="description">{t("Description")}</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={purchase?.description ?? ""}
                rows={2}
                required={!purchase?.material_name}
                placeholder={t("Ex. 20 balais et 10 paires de gants ; réparation de la porte du dépôt…")}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="category">{t("Catégorie")}</Label>
              <NativeSelect id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(t, c)}
                  </option>
                ))}
                <option value={NEW}>{t("+ Nouvelle catégorie…")}</option>
              </NativeSelect>
            </div>
            {category === NEW && (
              <div className="space-y-1">
                <Label htmlFor="new_category">{t("Nom de la nouvelle catégorie")}</Label>
                <Input id="new_category" name="new_category" maxLength={60} required autoFocus placeholder={t("Ex. Fournitures de bureau")} />
              </div>
            )}
          </fieldset>
          {legacy && (
            <div className="mt-3 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">{t("Informations saisies avant la simplification (conservées)")}</p>
              {purchase.material_name && (
                <p>
                  {t("Matériel")} : {purchase.material_name}
                </p>
              )}
              {purchase.supplier_name && (
                <p>
                  {t("Fournisseur")} : {purchase.supplier_name}
                  {purchase.supplier_contact ? ` (${purchase.supplier_contact})` : ""}
                </p>
              )}
              {purchase.quantity != null && (
                <p>
                  {t("Quantité")} : {purchase.quantity} {t(unitLabel(purchase.unit, purchase.unit_label))}
                  {purchase.unit_price != null ? ` · ${t("Prix unitaire")} : ${formatMoney(purchase.unit_price, unitDh)}` : ""}
                </p>
              )}
              {purchase.notes && (
                <p>
                  {t("Notes")} : {purchase.notes}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Photos (facultatives)")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {PURCHASE_PHOTO_GROUPS.map((g) => photoBlock(g.phase, g.title))}
          {purchase && purchase.photos.document.length > 0 && photoBlock("document", "Documents complémentaires")}
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
