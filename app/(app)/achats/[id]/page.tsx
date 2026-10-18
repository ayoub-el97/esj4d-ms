import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getPurchase, getPurchaseHistory, getSuppliers } from "@/lib/data/purchases";
import { formatDateFr, formatDateTimeFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/config";
import { formatMoney } from "@/lib/money";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES } from "@/lib/purchase-types";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PurchaseForm } from "../purchase-form";
import { PaymentsPanel } from "../payments-panel";

export const generateMetadata = pageTitle("Achat de matériel");

/** Champs suivis dans l'historique (clés de traduction). */
const TRACKED: Record<string, string> = {
  purchase_date: "Date d'achat",
  supplier_name: "Fournisseur",
  material_name: "Matériel",
  category: "Catégorie",
  quantity: "Quantité",
  unit: "Unité",
  unit_price: "Prix unitaire",
  total_amount: "Montant total",
  amount_adjusted: "Ajustement",
  cancelled: "Annulation",
  payment_method: "Mode de paiement",
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
  const changes = Object.keys(TRACKED)
    .filter((k) => JSON.stringify(od[k]) !== JSON.stringify(nd[k]))
    .map((k) => (k === "quantity" || k === "unit_price" || k === "total_amount" ? `${t(TRACKED[k])} : ${od[k]} → ${nd[k]}` : t(TRACKED[k])));
  if (nd.cancelled && !od.cancelled) return t("Achat annulé : {reason}", { reason: String(nd.cancel_reason ?? "") });
  if (!nd.cancelled && od.cancelled) return t("Achat rétabli");
  return changes.length ? t("Modification : {changes}", { changes: changes.join(" · ") }) : t("Modification");
}

export default async function AchatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const [user, t] = await Promise.all([requireModule("achats"), getT()]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [purchase, history, suppliers] = await Promise.all([getPurchase(id), getPurchaseHistory(id), getSuppliers()]);
  if (!purchase) notFound();
  const canEdit = user.permissions.achats.can_edit;
  const unit = t("DH");

  return (
    <div className="mx-auto max-w-6xl">
      <ModuleHeader title={purchase.material_name} subtitle={t("Achat du {date} — {supplier}", { date: formatDateFr(purchase.purchase_date), supplier: purchase.supplier_name })} backHref="/achats">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", PAYMENT_STATUS_STYLES[purchase.payment_status])}>{t(PAYMENT_STATUS_LABELS[purchase.payment_status])}</span>
        <span className="text-sm font-semibold">{formatMoney(purchase.total_amount, unit)}</span>
      </ModuleHeader>
      {sp.ok && (
        <Alert className="mb-4">
          <AlertDescription>{t("Achat enregistré. Vous pouvez revenir à tout moment pour ajouter des photos, un paiement ou corriger une information.")}</AlertDescription>
        </Alert>
      )}
      {purchase.cancelled && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{t("Achat annulé : {reason}. Il reste dans l'historique mais n'entre plus dans les totaux.", { reason: purchase.cancel_reason })}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <PurchaseForm purchase={purchase} suppliers={suppliers} defaultDate={purchase.purchase_date} canEdit={canEdit && !purchase.cancelled} isAdmin={user.role === "admin"} />
        <div className="space-y-6">
          <PaymentsPanel purchase={purchase} payments={purchase.payments} canEdit={canEdit} />
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
      <ModuleButtons pdfSlot={<PdfExportButton kind="achat" params={{ id: purchase.id }} label="PDF de l'achat (avec reçus)" />} historyHref="/achats" monthlyHref="/achats/rapport" />
    </div>
  );
}
