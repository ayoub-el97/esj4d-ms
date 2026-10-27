import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Purchase, PurchasePayment, PurchaseReport } from "@/lib/data/purchases";
import { formatDateFr, formatWorkMonth } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { categoryLabel, unitLabel } from "@/lib/purchase-types";
import { PdfDocument, PdfFooter, PdfHeader, PdfTable, PhotoGrid, styles } from "./components";
import { usePdf } from "./context";

/** Fiche d'un achat : informations et photos réelles (achats, facture / bon). */
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
    <Document title={`${t("Achat")} ${p.label}`} author={company} language={locale}>
      <Page size="A4" style={styles.page}>
        <PdfHeader company={company} title={t("Achat")} subtitle={`${p.label} — ${formatDateFr(p.purchase_date)}`} />
        {p.cancelled && <Text style={{ color: "#b91c1c", marginBottom: 6 }}>{t("Achat annulé : {reason}", { reason: p.cancel_reason })}</Text>}
        {line("Date d'achat", formatDateFr(p.purchase_date))}
        {line("Description", p.description)}
        {line("Catégorie", categoryLabel(t, p.category))}
        {line("Montant total", formatMoney(p.total_amount, unit))}
        {(p.material_name || p.supplier_name || p.quantity != null) && (
          <>
            <Text style={styles.section}>{t("Informations saisies avant la simplification (conservées)")}</Text>
            {p.material_name ? line("Matériel", p.material_name) : null}
            {p.supplier_name ? line("Fournisseur", p.supplier_name) : null}
            {p.quantity != null ? line("Quantité", `${p.quantity} ${t(unitLabel(p.unit, p.unit_label))}`) : null}
            {p.unit_price != null ? line("Prix unitaire", formatMoney(p.unit_price, unit)) : null}
            {p.notes ? line("Notes", p.notes) : null}
          </>
        )}
        {payments.length > 0 && (
          <>
            <Text style={styles.section}>{t("Paiements enregistrés")}</Text>
            <PdfTable
              columns={[
                { key: "d", label: "Date du paiement", width: 22 },
                { key: "a", label: "Montant (DH)", width: 20, align: "right" },
                { key: "m", label: "Mode", width: 20 },
                { key: "n", label: "Note", width: 38 },
              ]}
              rows={payments.map((x) => ({ d: formatDateFr(x.payment_date), a: x.cancelled ? `${formatAmount(x.amount)} (${t("annulé")})` : formatAmount(x.amount), m: x.method, n: x.cancelled ? x.cancel_reason : x.note }))}
            />
          </>
        )}
        <PhotoGrid title="Photos des achats" photos={p.photos.materiel} />
        <PhotoGrid title="Photos de la facture / du bon" photos={p.photos.justificatif} />
        {p.photos.document.length > 0 && <PhotoGrid title="Documents complémentaires" photos={p.photos.document} />}
        <PdfFooter company={company} generatedBy={generatedBy} />
      </Page>
    </Document>
  );
}

/** Rapport mensuel / annuel : synthèse, répartitions, détail, et (option) photos de chaque achat. */
export function PurchaseReportPdf({ company, title, subtitle, report, withPhotos, generatedBy }: { company: string; title: string; subtitle: string; report: PurchaseReport; withPhotos: boolean; generatedBy: string }) {
  const { t, locale, projectStart } = usePdf();
  const unit = t("DH");
  const r = report;
  return (
    <PdfDocument title={`${title} ${subtitle}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={title} subtitle={subtitle} />
      <View style={styles.metaRow}>
        <View style={styles.metaBox}>
          <Text>
            {t("Nombre d'achats")} : {r.count}
          </Text>
          <Text>
            {t("Total des dépenses de la période")} : {formatMoney(r.totalValue, unit)}
          </Text>
        </View>
      </View>
      <Text style={styles.small}>{t("Total = somme des montants saisis pour chaque achat, selon la date d'achat. Les achats annulés ne sont pas comptés.")}</Text>

      {r.byMonth.length > 1 && (
        <>
          <Text style={styles.section}>{t("Répartition mensuelle")}</Text>
          <PdfTable
            columns={[
              { key: "m", label: "Mois", width: 50 },
              { key: "n", label: "Achats", width: 20, align: "right" },
              { key: "v", label: "Total (DH)", width: 30, align: "right" },
            ]}
            rows={[...r.byMonth.map((m) => ({ m: formatWorkMonth(m.month, projectStart, locale), n: String(m.purchases), v: formatAmount(m.value) })), { m: t("Total"), n: String(r.count), v: formatAmount(r.totalValue) }]}
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
        rows={r.byCategory.map((c) => ({ c: categoryLabel(t, c.key), n: String(c.count), v: formatAmount(c.total) }))}
      />
      <Text style={styles.section}>{t("Détail des achats")}</Text>
      <PdfTable
        columns={[
          { key: "d", label: "Date", width: 12 },
          { key: "m", label: "Description", width: 42 },
          { key: "c", label: "Catégorie", width: 18 },
          { key: "ph", label: "Photos", width: 13, align: "right" },
          { key: "tot", label: "Total (DH)", width: 15, align: "right" },
        ]}
        rows={[
          ...r.purchases.map((p) => ({
            d: formatDateFr(p.purchase_date),
            m: p.label,
            c: categoryLabel(t, p.category),
            ph: `${p.photos.materiel.length} / ${p.photos.justificatif.length}`,
            tot: formatAmount(p.total_amount),
          })),
          { d: t("Total"), tot: formatAmount(r.totalValue) },
        ]}
      />
      <Text style={styles.small}>{t("Photos : photos des achats / photos de la facture ou du bon.")}</Text>
      {withPhotos &&
        r.purchases
          .filter((p) => p.photos.materiel.length || p.photos.justificatif.length)
          .map((p) => (
            <View key={p.id}>
              <Text style={styles.section} minPresenceAhead={140}>
                {`${formatDateFr(p.purchase_date)} — ${p.label} — ${formatMoney(p.total_amount, unit)}`}
              </Text>
              {p.photos.materiel.length > 0 && <PhotoGrid title="Photos des achats" photos={p.photos.materiel} />}
              {p.photos.justificatif.length > 0 && <PhotoGrid title="Photos de la facture / du bon" photos={p.photos.justificatif} />}
            </View>
          ))}
    </PdfDocument>
  );
}

/** Liste des achats (selon les filtres). */
export function PurchaseListPdf({ company, subtitle, purchases, generatedBy }: { company: string; subtitle: string; purchases: Purchase[]; generatedBy: string }) {
  const { t } = usePdf();
  const active = purchases.filter((p) => !p.cancelled);
  return (
    <PdfDocument title={`${t("Historique des achats")} ${subtitle}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={t("Historique des achats")} subtitle={subtitle} />
      <PdfTable
        columns={[
          { key: "d", label: "Date d'achat", width: 13 },
          { key: "m", label: "Description", width: 40 },
          { key: "c", label: "Catégorie", width: 18 },
          { key: "ph", label: "Photos", width: 12, align: "right" },
          { key: "tot", label: "Total (DH)", width: 17, align: "right" },
        ]}
        rows={[
          ...purchases.map((p) => ({
            d: formatDateFr(p.purchase_date),
            m: p.cancelled ? `${p.label} (${t("annulé")})` : p.label,
            c: categoryLabel(t, p.category),
            ph: `${p.photos.materiel.length} / ${p.photos.justificatif.length}`,
            tot: p.cancelled ? "" : formatAmount(p.total_amount),
          })),
          { d: t("Total"), m: t("hors annulés"), tot: formatAmount(active.reduce((s, p) => s + p.total_amount, 0)) },
        ]}
      />
      <Text style={styles.small}>{t("Photos : photos des achats / photos de la facture ou du bon.")}</Text>
    </PdfDocument>
  );
}
