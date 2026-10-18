import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Purchase, PurchasePayment, PurchaseReport } from "@/lib/data/purchases";
import { formatDateFr, formatWorkMonth } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { PAYMENT_STATUS_LABELS, PURCHASE_CATEGORY_LABELS, PURCHASE_UNIT_LABELS, type PurchaseCategory, type PurchaseUnit } from "@/lib/purchase-types";
import { PdfDocument, PdfFooter, PdfHeader, PdfTable, PhotoGrid, styles, type Column } from "./components";
import { usePdf } from "./context";

const unitText = (t: (k: string) => string, u: string, custom = "") => (u === "autre" && custom ? custom : u in PURCHASE_UNIT_LABELS ? t(PURCHASE_UNIT_LABELS[u as PurchaseUnit]) : u);

/** Fiche d'un achat : informations, paiements, photos du matériel et reçus / factures (images réelles). */
export function PurchasePdf({ company, purchase, payments, generatedBy }: { company: string; purchase: Purchase; payments: PurchasePayment[]; generatedBy: string }) {
  const { t, locale } = usePdf();
  const unit = t("DH");
  const p = purchase;
  const line = (label: string, value: string) => (
    <View style={{ flexDirection: "row", marginBottom: 2 }}>
      <Text style={{ width: 150, color: "#555" }}>{t(label)}</Text>
      <Text style={{ flex: 1 }}>{value || "—"}</Text>
    </View>
  );
  return (
    <Document title={`${t("Achat de matériel")} ${p.material_name}`} author={company} language={locale}>
      <Page size="A4" style={styles.page}>
        <PdfHeader company={company} title={t("Achat de matériel")} subtitle={`${p.material_name} — ${formatDateFr(p.purchase_date)}`} />
        {p.cancelled && <Text style={{ color: "#b91c1c", marginBottom: 6 }}>{t("Achat annulé : {reason}", { reason: p.cancel_reason })}</Text>}
        <Text style={styles.section}>{t("Achat et fournisseur")}</Text>
        {line("Date d'achat", formatDateFr(p.purchase_date))}
        {line("Fournisseur", p.supplier_name)}
        {line("Contact du fournisseur", p.supplier_contact)}
        <Text style={styles.section}>{t("Matériel")}</Text>
        {line("Matériel", p.material_name)}
        {line("Catégorie", t(PURCHASE_CATEGORY_LABELS[p.category]))}
        {line("Description", p.description)}
        {line("Quantité", `${p.quantity} ${unitText(t, p.unit, p.unit_label)}`)}
        {line("Prix unitaire", formatMoney(p.unit_price, unit))}
        {line("Montant total", formatMoney(p.total_amount, unit))}
        {p.amount_adjusted ? line("Ajustement", `${t("calcul : {computed}", { computed: formatMoney(p.computed_total, unit) })} — ${p.adjustment_reason}`) : null}
        <Text style={styles.section}>{t("Paiement")}</Text>
        {line("Statut", t(PAYMENT_STATUS_LABELS[p.payment_status]))}
        {line("Montant payé", formatMoney(p.amount_paid, unit))}
        {line("Reste à payer", formatMoney(p.amount_due, unit))}
        {line("Mode de paiement", p.payment_method)}
        {payments.length > 0 && (
          <PdfTable
            columns={[
              { key: "d", label: "Date du paiement", width: 22 },
              { key: "a", label: "Montant (DH)", width: 20, align: "right" },
              { key: "m", label: "Mode", width: 20 },
              { key: "n", label: "Note", width: 38 },
            ]}
            rows={payments.map((x) => ({ d: formatDateFr(x.payment_date), a: x.cancelled ? `${formatAmount(x.amount)} (${t("annulé")})` : formatAmount(x.amount), m: x.method, n: x.cancelled ? x.cancel_reason : x.note }))}
          />
        )}
        {p.notes ? (
          <>
            <Text style={styles.section}>{t("Notes")}</Text>
            <Text>{p.notes}</Text>
          </>
        ) : null}
        <PhotoGrid title="Reçus / factures" photos={p.photos.justificatif} />
        <PhotoGrid title="Photos du matériel" photos={p.photos.materiel} />
        {p.photos.document.length > 0 && <PhotoGrid title="Documents complémentaires" photos={p.photos.document} />}
        <PdfFooter company={company} generatedBy={generatedBy} />
      </Page>
    </Document>
  );
}

/** Rapport mensuel / annuel : synthèse, répartitions, détail, et (option) reçus de chaque achat. */
export function PurchaseReportPdf({ company, title, subtitle, report, withPhotos, generatedBy }: { company: string; title: string; subtitle: string; report: PurchaseReport; withPhotos: boolean; generatedBy: string }) {
  const { t, locale, projectStart } = usePdf();
  const unit = t("DH");
  const r = report;
  const detailCols: Column[] = [
    { key: "d", label: "Date", width: 10 },
    { key: "m", label: "Matériel", width: 20 },
    { key: "c", label: "Catégorie", width: 14 },
    { key: "f", label: "Fournisseur", width: 15 },
    { key: "q", label: "Quantité", width: 10, align: "right" },
    { key: "tot", label: "Total (DH)", width: 10, align: "right" },
    { key: "pay", label: "Payé (DH)", width: 10, align: "right" },
    { key: "due", label: "Reste (DH)", width: 11, align: "right" },
  ];
  return (
    <PdfDocument title={`${title} ${subtitle}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={title} subtitle={subtitle} />
      <View style={styles.metaRow}>
        <View style={styles.metaBox}>
          <Text>
            {t("Nombre d'achats")} : {r.count}
          </Text>
          <Text>
            {t("Valeur des achats de la période")} : {formatMoney(r.totalValue, unit)}
          </Text>
        </View>
        <View style={styles.metaBox}>
          <Text>
            {t("Paiements effectués pendant la période")} : {formatMoney(r.paidInPeriod, unit)}
          </Text>
          <Text>
            {t("Reste dû sur les achats de la période")} : {formatMoney(r.dueOnPeriod, unit)}
          </Text>
          <Text>
            {t("Total dû aux fournisseurs à la fin de la période")} : {formatMoney(r.outstandingAtEnd, unit)}
          </Text>
        </View>
      </View>
      <Text style={styles.small}>{t("La valeur des achats suit la date d'achat ; les paiements suivent leur propre date (un achat payé plus tard ou en plusieurs fois est réparti correctement).")}</Text>

      {r.byMonth.length > 1 && (
        <>
          <Text style={styles.section}>{t("Répartition mensuelle")}</Text>
          <PdfTable
            columns={[
              { key: "m", label: "Mois", width: 40 },
              { key: "n", label: "Achats", width: 15, align: "right" },
              { key: "v", label: "Valeur (DH)", width: 22, align: "right" },
              { key: "p", label: "Paiements (DH)", width: 23, align: "right" },
            ]}
            rows={[
              ...r.byMonth.map((m) => ({ m: formatWorkMonth(m.month, projectStart, locale), n: String(m.purchases), v: formatAmount(m.value), p: formatAmount(m.paid) })),
              { m: t("Total"), n: String(r.count), v: formatAmount(r.totalValue), p: formatAmount(r.paidInPeriod) },
            ]}
          />
        </>
      )}

      <Text style={styles.section}>{t("Dépenses par catégorie")}</Text>
      <PdfTable
        columns={[
          { key: "c", label: "Catégorie", width: 50 },
          { key: "n", label: "Achats", width: 20, align: "right" },
          { key: "v", label: "Total (DH)", width: 30, align: "right" },
        ]}
        rows={r.byCategory.map((c) => ({ c: t(PURCHASE_CATEGORY_LABELS[c.key as PurchaseCategory] ?? c.key), n: String(c.count), v: formatAmount(c.total) }))}
      />
      <Text style={styles.section}>{t("Dépenses par fournisseur")}</Text>
      <PdfTable
        columns={[
          { key: "s", label: "Fournisseur", width: 40 },
          { key: "n", label: "Achats", width: 14, align: "right" },
          { key: "v", label: "Total (DH)", width: 23, align: "right" },
          { key: "d", label: "Reste dû (DH)", width: 23, align: "right" },
        ]}
        rows={r.bySupplier.map((s) => ({ s: s.key, n: String(s.count), v: formatAmount(s.total), d: formatAmount(s.due) }))}
      />
      <Text style={styles.section}>{t("Matériels les plus achetés (quantités)")}</Text>
      <PdfTable
        columns={[
          { key: "m", label: "Matériel", width: 40 },
          { key: "q", label: "Quantité", width: 22, align: "right" },
          { key: "n", label: "Achats", width: 13, align: "right" },
          { key: "v", label: "Total (DH)", width: 25, align: "right" },
        ]}
        rows={r.byMaterial.slice(0, 15).map((m) => ({ m: m.key, q: `${Math.round(m.quantity * 1000) / 1000} ${unitText(t, m.unit)}`, n: String(m.count), v: formatAmount(m.total) }))}
      />
      <Text style={styles.section}>{t("Achats les plus importants")}</Text>
      <PdfTable
        columns={[
          { key: "d", label: "Date", width: 15 },
          { key: "m", label: "Matériel", width: 35 },
          { key: "s", label: "Fournisseur", width: 28 },
          { key: "v", label: "Total (DH)", width: 22, align: "right" },
        ]}
        rows={r.top.map((p) => ({ d: formatDateFr(p.purchase_date), m: p.material_name, s: p.supplier_name, v: formatAmount(p.total_amount) }))}
      />
      <Text style={styles.section}>{t("Détail des achats")}</Text>
      <PdfTable
        columns={detailCols}
        rows={[
          ...r.purchases.map((p) => ({
            d: formatDateFr(p.purchase_date),
            m: p.material_name,
            c: t(PURCHASE_CATEGORY_LABELS[p.category]),
            f: p.supplier_name,
            q: `${p.quantity} ${unitText(t, p.unit, p.unit_label)}`,
            tot: formatAmount(p.total_amount),
            pay: formatAmount(p.amount_paid),
            due: formatAmount(p.amount_due),
          })),
          { d: t("Total"), tot: formatAmount(r.totalValue), pay: formatAmount(r.purchases.reduce((s, p) => s + p.amount_paid, 0)), due: formatAmount(r.dueOnPeriod) },
        ]}
      />
      {withPhotos &&
        r.purchases
          .filter((p) => p.photos.justificatif.length)
          .map((p) => <PhotoGrid key={p.id} title={`${t("Reçus / factures")} — ${p.material_name} — ${formatDateFr(p.purchase_date)} — ${formatMoney(p.total_amount, unit)}`} photos={p.photos.justificatif} />)}
    </PdfDocument>
  );
}

/** Liste des achats (selon les filtres). */
export function PurchaseListPdf({ company, subtitle, purchases, generatedBy }: { company: string; subtitle: string; purchases: Purchase[]; generatedBy: string }) {
  const { t } = usePdf();
  const active = purchases.filter((p) => !p.cancelled);
  return (
    <PdfDocument title={`${t("Historique des achats")} ${subtitle}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={t("Historique des achats")} subtitle={subtitle} />
      <PdfTable
        columns={[
          { key: "d", label: "Date d'achat", width: 9 },
          { key: "m", label: "Matériel", width: 17 },
          { key: "c", label: "Catégorie", width: 12 },
          { key: "f", label: "Fournisseur", width: 14 },
          { key: "q", label: "Quantité", width: 9, align: "right" },
          { key: "tot", label: "Total (DH)", width: 9, align: "right" },
          { key: "pay", label: "Payé (DH)", width: 9, align: "right" },
          { key: "due", label: "Reste (DH)", width: 9, align: "right" },
          { key: "s", label: "Statut", width: 12 },
        ]}
        rows={[
          ...purchases.map((p) => ({
            d: formatDateFr(p.purchase_date),
            m: p.material_name,
            c: t(PURCHASE_CATEGORY_LABELS[p.category]),
            f: p.supplier_name,
            q: `${p.quantity} ${unitText(t, p.unit, p.unit_label)}`,
            tot: formatAmount(p.total_amount),
            pay: formatAmount(p.amount_paid),
            due: formatAmount(p.amount_due),
            s: t(PAYMENT_STATUS_LABELS[p.payment_status]),
          })),
          {
            d: t("Total"),
            tot: formatAmount(active.reduce((s, p) => s + p.total_amount, 0)),
            pay: formatAmount(active.reduce((s, p) => s + p.amount_paid, 0)),
            due: formatAmount(active.reduce((s, p) => s + p.amount_due, 0)),
            s: t("hors annulés"),
          },
        ]}
      />
    </PdfDocument>
  );
}
