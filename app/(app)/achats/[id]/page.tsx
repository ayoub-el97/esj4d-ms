import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getPurchase, getPurchaseCategories, getPurchaseHistory } from "@/lib/data/purchases";
import { formatDateFr, formatDateTimeFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/config";
import { formatMoney } from "@/lib/money";
import { categoryLabel } from "@/lib/purchase-types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PurchaseForm } from "../purchase-form";
import { PurchaseSidePanel } from "../purchase-side-panel";

export const generateMetadata = pageTitle("Achat");

/** Champs suivis dans l'historique (clés de traduction). */
const TRACKED: Record<string, string> = {
  purchase_date: "Date d'achat",
  description: "Description",
  category: "Catégorie",
  total_amount: "Montant total",
  cancelled: "Annulation",
};

function describe(h: Awaited<ReturnType<typeof getPurchaseHistory>>[number], t: TFunction, unit: string): string {
  const nd = h.new_data ?? {};
  const od = h.old_data ?? {};
  if (h.tbl === "material_purchase_payments") {
    if (h.action === "INSERT") return t("Paiement de {amount} ({date})", { amount: formatMoney(Number(nd.amount), unit), date: formatDateFr(String(nd.payment_date)) });
    if (nd.cancelled && !od.cancelled) return t("Paiement de {amount} annulé : {reason}", { amount: formatMoney(Number(nd.amount), unit), reason: String(nd.cancel_reason ?? "") });
    return t("Paiement modifié");
  }
  if (h.action === "INSERT") return t("Création de l'achat ({amount})", { amount: formatMoney(Number(nd.total_amount), unit) });
  if (nd.cancelled && !od.cancelled) return t("Achat annulé : {reason}", { reason: String(nd.cancel_reason ?? "") });
  if (!nd.cancelled && od.cancelled) return t("Achat rétabli");
  const changes = Object.keys(TRACKED)
    .filter((k) => k !== "cancelled" && JSON.stringify(od[k]) !== JSON.stringify(nd[k]))
    .map((k) => (k === "total_amount" ? `${t(TRACKED[k])} : ${od[k]} → ${nd[k]}` : t(TRACKED[k])));
  return changes.length ? t("Modification : {changes}", { changes: changes.join(" · ") }) : t("Modification");
}

export default async function AchatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const [user, t] = await Promise.all([requireModule("achats"), getT()]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [purchase, history, categories] = await Promise.all([getPurchase(id), getPurchaseHistory(id), getPurchaseCategories()]);
  if (!purchase) notFound();
  const canEdit = user.permissions.achats.can_edit;
  const unit = t("DH");

  return (
    <div className="mx-auto max-w-6xl">
      <ModuleHeader title={purchase.label || t("Achat")} subtitle={t("Achat du {date} — {category}", { date: formatDateFr(purchase.purchase_date), category: categoryLabel(t, purchase.category) })} backHref="/achats">
        <span className="text-sm font-semibold">{formatMoney(purchase.total_amount, unit)}</span>
      </ModuleHeader>
      {sp.ok && (
        <Alert className="mb-4">
          <AlertDescription>{t("Achat enregistré. Vous pouvez revenir à tout moment pour ajouter des photos ou corriger une information.")}</AlertDescription>
        </Alert>
      )}
      {purchase.cancelled && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{t("Achat annulé : {reason}. Il reste dans l'historique mais n'entre plus dans les totaux.", { reason: purchase.cancel_reason })}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <PurchaseForm purchase={purchase} categories={categories} defaultDate={purchase.purchase_date} canEdit={canEdit && !purchase.cancelled} />
        <div className="space-y-6">
          <PurchaseSidePanel purchase={purchase} payments={purchase.payments} canEdit={canEdit} />
          <Card>
            <CardHeader>
              <CardTitle>{t("Historique des modifications")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {history.length === 0 && <li className="text-muted-foreground">{t("Aucun historique disponible.")}</li>}
                {history.map((h, i) => (
                  <li key={i} className="border-s-2 border-primary/30 ps-3">
                    <div>{describe(h, t, unit)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTimeFr(h.at)} · {h.user_email ?? t("utilisateur inconnu")}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
      <ModuleButtons pdfSlot={<PdfExportButton kind="achat" params={{ id: purchase.id }} label="PDF de l'achat (avec photos)" />} historyHref="/achats" monthlyHref="/achats/rapport" />
    </div>
  );
}
