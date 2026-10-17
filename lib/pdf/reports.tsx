import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { CleaningAgent, CleaningSummaryRow, CollectionReportFull, TruckReportRow } from "@/lib/data/reports";
import { employeeName } from "@/lib/data/employees";
import { formatDateFr, formatWorkMonth } from "@/lib/dates";
import { PdfDocument, PdfFooter, PdfHeader, PdfTable, PhotoGrid, styles, type Column } from "./components";
import { usePdf } from "./context";

/** Rapport nettoiement : une page par agent (date, nom, lieu, photos AVANT / APRÈS). */
export function CleaningReportPdf({ company, date, agents, observations, generatedBy }: { company: string; date: string; agents: CleaningAgent[]; observations: string; generatedBy: string }) {
  const { t, locale } = usePdf();
  const title = t("Rapport journalier — Nettoiement");
  return (
    <Document title={`${title} ${date}`} author={company} language={locale}>
      {agents.length === 0 && (
        <Page size="A4" style={styles.page}>
          <PdfHeader company={company} title={title} subtitle={formatDateFr(date)} />
          <Text>{t("Aucun agent dans ce rapport.")}</Text>
          <PdfFooter company={company} generatedBy={generatedBy} />
        </Page>
      )}
      {agents.map((a) => (
        <Page key={a.id} size="A4" style={styles.page}>
          <PdfHeader company={company} title={title} subtitle={formatDateFr(date)} />
          <View style={styles.metaRow}>
            <View style={styles.metaBox}>
              <Text>
                {t("Date")} : {formatDateFr(date)}
              </Text>
            </View>
            <View style={styles.metaBox}>
              <Text>
                {t("Agent")} : {a.name} ({t("NB")} {a.order_number})
              </Text>
            </View>
            <View style={styles.metaBox}>
              <Text>
                {t("Lieu")} : {a.location || "—"}
              </Text>
            </View>
          </View>
          {a.comment ? (
            <Text style={{ marginBottom: 4 }}>
              {t("Commentaire")} : {a.comment}
            </Text>
          ) : null}
          <PhotoGrid title="Photos AVANT" photos={a.photosAvant} />
          <PhotoGrid title="Photos APRÈS" photos={a.photosApres} />
          {observations ? (
            <Text style={[styles.small, { marginTop: 10 }]}>
              {t("Observations générales")} : {observations}
            </Text>
          ) : null}
          <PdfFooter company={company} generatedBy={generatedBy} />
        </Page>
      ))}
    </Document>
  );
}

/** Rapport collecte : une page par camion. */
export function CollectionReportPdf({ company, date, reports, generatedBy }: { company: string; date: string; reports: CollectionReportFull[]; generatedBy: string }) {
  const { t, locale } = usePdf();
  const title = t("Rapport journalier — Collecte");
  return (
    <Document title={`${title} ${date}`} author={company} language={locale}>
      {reports.map((r) => (
        <Page key={r.id} size="A4" style={styles.page}>
          <PdfHeader company={company} title={title} subtitle={formatDateFr(date)} />
          <View style={styles.metaRow}>
            <View style={styles.metaBox}>
              <Text>
                {t("Camion")} : {r.truck?.matricule ?? "?"} {r.truck?.brand ? `(${r.truck.brand})` : ""}
              </Text>
            </View>
            <View style={styles.metaBox}>
              <Text>
                {t("Chauffeur")} : {r.chauffeur ? employeeName(r.chauffeur) : "—"}
              </Text>
            </View>
            <View style={styles.metaBox}>
              <Text>
                {t("Date")} : {formatDateFr(date)}
              </Text>
            </View>
          </View>
          <Text style={{ marginBottom: 3 }}>
            {t("Rippeurs")} : {r.rippers.length ? r.rippers.map(employeeName).join(", ") : "—"}
          </Text>
          <Text style={{ marginBottom: 3 }}>
            {t("Lieux / secteurs")} : {r.sectors || "—"}
          </Text>
          {r.truckReport && (
            <Text style={{ marginBottom: 3 }}>
              {t("N° ticket")} {r.truckReport.ticket1 || "—"} : {r.truckReport.tonnage1 ?? "—"} t · {t("2e ticket")} {r.truckReport.ticket2 || "—"} : {r.truckReport.tonnage2 ?? "—"} t · {t("Vidages")} : {r.truckReport.dumps_count}
              {r.truckReport.km != null ? ` · ${t("Km")} : ${r.truckReport.km}` : ""}
              {r.truckReport.fuel != null ? ` · ${t("Carburant")} : ${r.truckReport.fuel} L` : ""}
            </Text>
          )}
          {r.observations ? (
            <Text style={{ marginBottom: 3 }}>
              {t("Observations")} : {r.observations}
            </Text>
          ) : null}
          <PhotoGrid title="Photos AVANT" photos={r.photosAvant} />
          <PhotoGrid title="Photos APRÈS" photos={r.photosApres} />
          <PdfFooter company={company} generatedBy={generatedBy} />
        </Page>
      ))}
    </Document>
  );
}

const TRUCK_COLUMNS: Column[] = [
  { key: "brand", label: "Marque", width: 8 },
  { key: "mat", label: "Matricule", width: 10 },
  { key: "chauffeur", label: "Chauffeur", width: 13 },
  { key: "t1", label: "N° ticket", width: 8 },
  { key: "ton1", label: "Tonnage", width: 7, align: "right" },
  { key: "t2", label: "2e ticket", width: 8 },
  { key: "ton2", label: "2e tonnage", width: 7, align: "right" },
  { key: "dumps", label: "Vidages", width: 6, align: "right" },
  { key: "rip", label: "Équipe (rippeurs)", width: 16 },
  { key: "km", label: "Km", width: 6, align: "right" },
  { key: "obs", label: "Observations", width: 11 },
];

const truckRow = (tr: TruckReportRow) => ({
  brand: tr.truck?.brand ?? "",
  mat: tr.truck?.matricule ?? "",
  chauffeur: tr.chauffeur_name,
  t1: tr.ticket1,
  ton1: tr.tonnage1 == null ? "" : String(tr.tonnage1),
  t2: tr.ticket2,
  ton2: tr.tonnage2 == null ? "" : String(tr.tonnage2),
  dumps: String(tr.dumps_count),
  rip: tr.crew.length ? tr.crew.join(", ") : tr.rippers_count ? String(tr.rippers_count) : "",
  km: tr.km == null ? "" : String(tr.km),
  obs: tr.observations,
});

/** Rapport journalier global : tableau camions + récapitulatif nettoiement. */
export function GlobalDailyPdf({ company, date, trucks, summary, generatedBy }: { company: string; date: string; trucks: TruckReportRow[]; summary: CleaningSummaryRow[]; generatedBy: string }) {
  const { t } = usePdf();
  const summaryColumns: Column[] = [
    { key: "zone", label: "Effectif / zone", width: 16 },
    { key: "dur", label: "Durée", width: 10 },
    { key: "planned", label: "Prévu", width: 9, align: "right" },
    { key: "active", label: "Actifs", width: 9, align: "right" },
    { key: "sick", label: "Malades", width: 9, align: "right" },
    { key: "leave", label: "Congés payés", width: 11, align: "right" },
    { key: "absent", label: "Absents", width: 9, align: "right" },
    { key: "holiday", label: "Fériés", width: 9, align: "right" },
    { key: "rest", label: "Repos", width: 9, align: "right" },
    { key: "total", label: "Total", width: 9, align: "right" },
  ];
  const totalTon = trucks.reduce((s, tr) => s + Number(tr.tonnage1 ?? 0) + Number(tr.tonnage2 ?? 0), 0);
  const title = t("Rapport journalier global");
  return (
    <PdfDocument title={`${title} ${date}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={title} subtitle={formatDateFr(date)} />
      <Text style={styles.section}>{t("Collecte — tableau des camions")}</Text>
      <PdfTable columns={TRUCK_COLUMNS} rows={trucks.map(truckRow)} />
      <Text style={[styles.small, { marginTop: 3 }]}>
        {t("Total tonnage : {ton} t · Vidages : {dumps} · Rippeurs : {rippers}", {
          ton: totalTon.toFixed(2),
          dumps: trucks.reduce((s, tr) => s + tr.dumps_count, 0),
          rippers: trucks.reduce((s, tr) => s + tr.rippers_count, 0),
        })}
      </Text>
      <Text style={styles.section}>{t("Nettoiement — tableau récapitulatif")}</Text>
      <PdfTable
        columns={summaryColumns}
        rows={summary.map((s) => ({
          zone: s.zone === "Total pointage" ? t("Total pointage") : s.zone,
          dur: s.work_duration,
          planned: String(s.planned_headcount),
          active: String(s.active_count),
          sick: String(s.sick_count),
          leave: String(s.paid_leave_count),
          absent: String(s.absent_count),
          holiday: String(s.holiday_count),
          rest: String(s.rest_count),
          total: String(s.total_count),
        }))}
      />
    </PdfDocument>
  );
}

/** Rapport camions : liste (journalière ou période). */
export function TruckReportsPdf({ company, subtitle, rows, generatedBy }: { company: string; subtitle: string; rows: TruckReportRow[]; generatedBy: string }) {
  const { t } = usePdf();
  const columns: Column[] = [{ key: "date", label: "Date", width: 9 }, ...TRUCK_COLUMNS.map((c) => ({ ...c, width: c.width * 0.91 }))];
  return (
    <PdfDocument title={`${t("Rapport camions")} ${subtitle}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={t("Rapport camions")} subtitle={subtitle} />
      <PdfTable columns={columns} rows={rows.map((tr) => ({ date: formatDateFr(tr.activity_date), ...truckRow(tr) }))} />
    </PdfDocument>
  );
}

export function TruckMonthlyPdf({
  company,
  month,
  rows,
  generatedBy,
}: {
  company: string;
  month: string;
  rows: { truck: { matricule: string; brand: string } | null; days: number; tickets: number; tonnage: number; dumps: number; km: number; fuel: number }[];
  generatedBy: string;
}) {
  const { t, locale, projectStart } = usePdf();
  const columns: Column[] = [
    { key: "mat", label: "Matricule", width: 16 },
    { key: "brand", label: "Marque", width: 14 },
    { key: "days", label: "Jours", width: 10, align: "right" },
    { key: "tickets", label: "Tickets", width: 10, align: "right" },
    { key: "ton", label: "Tonnage total (t)", width: 16, align: "right" },
    { key: "dumps", label: "Vidages", width: 10, align: "right" },
    { key: "km", label: "Km", width: 12, align: "right" },
    { key: "fuel", label: "Carburant (L)", width: 12, align: "right" },
  ];
  return (
    <PdfDocument title={`${t("Rapport mensuel camions")} ${month}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={t("Rapport mensuel camions")} subtitle={formatWorkMonth(month, projectStart, locale)} />
      <PdfTable
        columns={columns}
        rows={rows.map((r) => ({ mat: r.truck?.matricule ?? "", brand: r.truck?.brand ?? "", days: String(r.days), tickets: String(r.tickets), ton: r.tonnage.toFixed(2), dumps: String(r.dumps), km: r.km.toFixed(1), fuel: r.fuel.toFixed(2) }))}
      />
    </PdfDocument>
  );
}
