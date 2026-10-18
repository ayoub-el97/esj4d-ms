import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Repair, RepairExpenseReport } from "@/lib/data/repairs";
import { formatDateFr, formatWorkMonth } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { REPAIR_STATUS_LABELS } from "@/lib/repair-types";
import { PdfDocument, PdfFooter, PdfHeader, PdfTable, PhotoGrid, styles, type Column } from "./components";
import { usePdf } from "./context";

/** Rapport des dépenses de réparation : par camion, détail des réparations, total flotte. */
export function RepairExpensesPdf({ company, subtitle, report, generatedBy }: { company: string; subtitle: string; report: RepairExpenseReport; generatedBy: string }) {
  const { t, locale, projectStart } = usePdf();
  const title = t("Dépenses de réparation des camions");
  const unit = t("DH");
  const summaryCols: Column[] = [
    { key: "rank", label: "N°", width: 6, align: "center" },
    { key: "mat", label: "Matricule", width: 18 },
    { key: "brand", label: "Marque / modèle", width: 30 },
    { key: "n", label: "Nombre de réparations", width: 20, align: "right" },
    { key: "total", label: "Total des dépenses (DH)", width: 26, align: "right" },
  ];
  const detailCols: Column[] = [
    { key: "mat", label: "Matricule", width: 14 },
    { key: "date", label: "Date de réparation", width: 14 },
    { key: "desc", label: "Réparation / pièces", width: 38 },
    { key: "status", label: "Statut", width: 10 },
    { key: "rec", label: "Reçus", width: 8, align: "right" },
    { key: "cost", label: "Coût (DH)", width: 16, align: "right" },
  ];
  return (
    <PdfDocument title={`${title} ${subtitle}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={title} subtitle={subtitle} />
      <View style={styles.metaRow}>
        <View style={styles.metaBox}>
          <Text>
            {t("Total dépensé (flotte)")} : {formatMoney(report.total, unit)}
          </Text>
        </View>
        <View style={styles.metaBox}>
          <Text>
            {t("Réparations comptées")} : {report.repairs} · {t("Camions concernés")} : {report.rows.length}
          </Text>
        </View>
      </View>
      <Text style={styles.section}>{t("Dépenses par camion")}</Text>
      <PdfTable
        columns={summaryCols}
        rows={[
          ...report.rows.map((r, i) => ({ rank: String(i + 1), mat: r.truck?.matricule ?? "", brand: [r.truck?.brand, r.truck?.model].filter(Boolean).join(" "), n: String(r.repairs), total: formatAmount(r.total) })),
          { rank: "", mat: t("Total"), brand: "", n: String(report.repairs), total: formatAmount(report.total) },
        ]}
      />
      {report.byMonth.length > 1 && (
        <>
          <Text style={styles.section}>{t("Dépenses par mois")}</Text>
          <PdfTable
            columns={[
              { key: "m", label: "Mois", width: 50 },
              { key: "n", label: "Réparations", width: 20, align: "right" },
              { key: "total", label: "Total (DH)", width: 30, align: "right" },
            ]}
            rows={report.byMonth.map((m) => ({ m: formatWorkMonth(m.month, projectStart, locale), n: String(m.repairs), total: formatAmount(m.total) }))}
          />
        </>
      )}
      <Text style={styles.section}>{t("Détail des réparations")}</Text>
      <PdfTable
        columns={detailCols}
        rows={report.rows.flatMap((r) =>
          r.items.map((it) => ({ mat: r.truck?.matricule ?? "", date: formatDateFr(it.date), desc: it.description, status: t(REPAIR_STATUS_LABELS[it.status]), rec: String(it.receipts), cost: formatAmount(it.cost) })),
        )}
      />
      <Text style={[styles.small, { marginTop: 6 }]}>
        {t("Seules les dépenses réelles sont comptées : coût saisi et date de réparation, statut En cours ou Réparé (ou Annulé avec frais engagés). Les réparations en attente ne sont pas comptées. Chaque réparation est comptée une seule fois, dans le mois de sa date de réparation.")}
      </Text>
    </PdfDocument>
  );
}

function RepairBlock({ r }: { r: Repair }) {
  const { t } = usePdf();
  const unit = t("DH");
  const line = (label: string, value: string) => (
    <Text style={{ marginBottom: 3 }}>
      {t(label)} : {value}
    </Text>
  );
  return (
    <View>
      {line("Camion", [r.truck?.matricule, r.truck?.brand, r.truck?.model].filter(Boolean).join(" — "))}
      {line("Date du problème", formatDateFr(r.reported_date))}
      {line("Description du problème", r.problem_description)}
      {r.problem_location ? line("Lieu du problème", r.problem_location) : null}
      {r.notes ? line("Notes", r.notes) : null}
      {line("Statut", t(REPAIR_STATUS_LABELS[r.status]))}
      {line("Date de réparation", r.repair_date ? formatDateFr(r.repair_date) : "—")}
      {line("Réparation / pièces remplacées", r.repair_description || "—")}
      {line("Coût total", r.cost == null ? "—" : `${formatMoney(r.cost, unit)}${r.counted ? "" : ` (${t("non compté dans les dépenses")})`}`)}
      {r.repair_notes ? line("Notes sur la réparation", r.repair_notes) : null}
    </View>
  );
}

/** Fiche complète d'une réparation, avec photos et reçus. */
export function RepairPdf({ company, repair, generatedBy }: { company: string; repair: Repair; generatedBy: string }) {
  const { t, locale } = usePdf();
  const title = t("Dossier de réparation");
  return (
    <Document title={`${title} ${repair.truck?.matricule ?? ""}`} author={company} language={locale}>
      <Page size="A4" style={styles.page}>
        <PdfHeader company={company} title={title} subtitle={`${repair.truck?.matricule ?? ""} — ${formatDateFr(repair.reported_date)}`} />
        <RepairBlock r={repair} />
        <PhotoGrid title="Reçus / factures de réparation" photos={repair.photos.justificatif} />
        <PhotoGrid title="Photo du camion" photos={repair.photos.vehicule} />
        <PhotoGrid title="Photos du problème avant réparation" photos={repair.photos.avant} />
        <PhotoGrid title="Photos après réparation" photos={repair.photos.apres} />
        <PdfFooter company={company} generatedBy={generatedBy} />
      </Page>
    </Document>
  );
}

/** Historique des réparations d'un camion. */
export function TruckRepairHistoryPdf({ company, matricule, repairs, generatedBy }: { company: string; matricule: string; repairs: Repair[]; generatedBy: string }) {
  const { t } = usePdf();
  const title = t("Historique des réparations du camion");
  const total = repairs.filter((r) => r.counted).reduce((s, r) => s + (r.cost ?? 0), 0);
  return (
    <PdfDocument title={`${title} ${matricule}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={title} subtitle={matricule} />
      <Text style={{ marginBottom: 6 }}>
        {t("Problèmes enregistrés")} : {repairs.length} · {t("Dépenses de réparation (total)")} : {formatMoney(total, t("DH"))}
      </Text>
      <PdfTable
        columns={[
          { key: "rep", label: "Signalé le", width: 11 },
          { key: "prob", label: "Problème", width: 27 },
          { key: "done", label: "Réparé le", width: 11 },
          { key: "desc", label: "Réparation / pièces", width: 27 },
          { key: "status", label: "Statut", width: 10 },
          { key: "cost", label: "Coût (DH)", width: 14, align: "right" },
        ]}
        rows={repairs.map((r) => ({
          rep: formatDateFr(r.reported_date),
          prob: r.problem_description,
          done: r.repair_date ? formatDateFr(r.repair_date) : "—",
          desc: r.repair_description,
          status: t(REPAIR_STATUS_LABELS[r.status]),
          cost: r.cost == null ? "—" : `${formatAmount(r.cost)}${r.counted ? "" : " *"}`,
        }))}
      />
      <Text style={[styles.small, { marginTop: 4 }]}>{t("* non compté dans les dépenses (en attente, ou annulé sans frais).")}</Text>
    </PdfDocument>
  );
}
