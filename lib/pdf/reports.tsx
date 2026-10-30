import { Document, Page, Text, View } from "@react-pdf/renderer";
import { dayFunctionLabel } from "@/lib/day-function";
import type { CleaningAgent, CleaningSummaryRow, CollectionReportFull, TruckReportRow } from "@/lib/data/reports";
import { employeeName } from "@/lib/data/employees";
import { formatDateFr, formatWorkMonth } from "@/lib/dates";
import { PdfDocument, PdfFooter, PdfHeader, PdfTable, PhotoGrid, styles, type Column } from "./components";
import { usePdf } from "./context";
import { COLLECTION_STATUS_LABELS } from "@/lib/collection-status";

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
            {t("Statut")} : {t(COLLECTION_STATUS_LABELS[r.status])}
            {r.missing.length && !r.day_closed ? ` — ${t("à compléter : {items}", { items: r.missing.map((m) => t(m)).join(", ") })}` : ""}
          </Text>
          <Text style={{ marginBottom: 3 }}>
            {t("Équipe")} : {r.rippers.length ? r.rippers.map((e) => (e.day_position && e.day_position !== e.position ? `${employeeName(e)} (${dayFunctionLabel(t, e.day_position, e.position)})` : employeeName(e))).join(", ") : "—"}
          </Text>
          <Text style={{ marginBottom: 3 }}>
            {t("Lieux / secteurs")} : {r.sectors || "—"}
          </Text>
          {r.observations ? (
            <Text style={{ marginBottom: 3 }}>
              {t("Observations")} : {r.observations}
            </Text>
          ) : null}
          <PhotoGrid title="Photos Avant" photos={r.photosAvant} />
          <PhotoGrid title="Photos Après" photos={r.photosApres} />
          <PdfFooter company={company} generatedBy={generatedBy} />
        </Page>
      ))}
    </Document>
  );
}

const TRUCK_COLUMNS: Column[] = [
  { key: "mat", label: "Matricule", width: 9 },
  { key: "brand", label: "Marque", width: 6 },
  { key: "poste", label: "Poste", width: 6 },
  { key: "chauffeur", label: "Chauffeur", width: 11 },
  { key: "vid", label: "N Ticket", width: 20 },
  { key: "tont", label: "Tonnage total", width: 7, align: "right" },
  { key: "dumps", label: "Vidages", width: 5, align: "right" },
  { key: "rip", label: "Équipe (rippeurs)", width: 11 },
  { key: "kmd", label: "Km départ", width: 6, align: "right" },
  { key: "kmf", label: "Km fin", width: 6, align: "right" },
  { key: "km", label: "Km parcourus", width: 6, align: "right" },
  { key: "obs", label: "Observations", width: 7 },
];

const truckRow = (tr: TruckReportRow, t: (k: string, v?: Record<string, string | number>) => string) => ({
  mat: tr.truck?.matricule ?? "",
  brand: tr.truck?.brand ?? "",
  poste: tr.shift === "soir" ? t("Soir") : t("Matin"),
  chauffeur: tr.chauffeur_name,
  vid: tr.loads.length ? tr.loads.map((l, i) => `${i + 1}. ${l.ticket || "—"} — ${l.tonnage != null ? `${l.tonnage} t` : "—"}`).join("\n") : "—",
  tont: tr.tonnage_total.toFixed(2),
  dumps: `${tr.dumps_count}${tr.dumps_override ? ` (${t("manuel")})` : ""}`,
  rip: tr.crew.length ? tr.crew.join("\n") : tr.rippers_count ? String(tr.rippers_count) : "",
  kmd: tr.km_start == null ? "" : String(tr.km_start),
  kmf: tr.km_end == null ? "" : String(tr.km_end),
  km: tr.km == null ? "" : String(tr.km),
  obs: `${tr.observations}${tr.photos.length ? ` (${t("{count} photo(s)", { count: tr.photos.length })})` : ""}`,
});

/** Lignes du tableau PDF : par date et camion, Matin puis Soir, sous-totaux par poste et total de la journée. */
function truckPdfRows(rows: TruckReportRow[], t: (k: string, v?: Record<string, string | number>) => string, withDate: boolean) {
  const sum = (list: TruckReportRow[]) => ({
    tont: list.reduce((s, r) => s + r.tonnage_total, 0).toFixed(2),
    dumps: String(list.reduce((s, r) => s + r.dumps_count, 0)),
    km: list.reduce((s, r) => s + Number(r.km ?? 0), 0).toFixed(1),
  });
  const out: Record<string, string>[] = [];
  let i = 0;
  while (i < rows.length) {
    const key = `${rows[i].activity_date}:${rows[i].truck_id}`;
    const group: TruckReportRow[] = [];
    while (i < rows.length && `${rows[i].activity_date}:${rows[i].truck_id}` === key) group.push(rows[i++]);
    group.forEach((r, k) => out.push({ ...(withDate ? { date: k === 0 ? formatDateFr(r.activity_date) : "" } : {}), ...truckRow(r, t), ...(k > 0 ? { mat: "", brand: "" } : {}) }));
    const matin = group.filter((r) => r.shift === "matin");
    const soir = group.filter((r) => r.shift === "soir");
    if (matin.length && (matin.length > 1 || soir.length)) out.push({ vid: t("Total Matin"), ...sum(matin) });
    if (soir.length && (soir.length > 1 || matin.length)) out.push({ vid: t("Total Soir"), ...sum(soir) });
    if (group.length > 1) out.push({ vid: t("Total journée — {matricule}", { matricule: group[0].truck?.matricule ?? "" }), ...sum(group) });
  }
  if (rows.length) out.push({ ...(withDate ? { date: t("Total") } : { mat: t("Total") }), ...sum(rows) });
  return out;
}

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
  const totalTon = trucks.reduce((s, tr) => s + tr.tonnage_total, 0);
  const title = t("Rapport journalier global");
  return (
    <PdfDocument title={`${title} ${date}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={title} subtitle={formatDateFr(date)} />
      <Text style={styles.section}>{t("Collecte — tableau des camions")}</Text>
      <PdfTable columns={TRUCK_COLUMNS} rows={truckPdfRows(trucks, t, false)} />
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
      <PdfTable columns={columns} rows={truckPdfRows(rows, t, true)} />
      {rows
        .filter((r) => r.photos.length)
        .map((r) => (
          <PhotoGrid key={r.id} title={`${t("Photos")} — ${r.truck?.matricule ?? ""} — ${formatDateFr(r.activity_date)} — ${r.shift === "soir" ? t("Soir") : t("Matin")}`} photos={r.photos} />
        ))}
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
  rows: { truck: { matricule: string; brand: string } | null; days: number; tickets: number; tonnage: number; tonnage_matin: number; tonnage_soir: number; dumps: number; km: number; fuel: number }[];
  generatedBy: string;
}) {
  const { t, locale, projectStart } = usePdf();
  const columns: Column[] = [
    { key: "mat", label: "Matricule", width: 13 },
    { key: "brand", label: "Marque", width: 11 },
    { key: "days", label: "Jours", width: 7, align: "right" },
    { key: "tickets", label: "Tickets", width: 8, align: "right" },
    { key: "tm", label: "Tonnage matin (t)", width: 12, align: "right" },
    { key: "ts", label: "Tonnage soir (t)", width: 12, align: "right" },
    { key: "ton", label: "Tonnage total (t)", width: 12, align: "right" },
    { key: "dumps", label: "Vidages", width: 8, align: "right" },
    { key: "km", label: "Km", width: 8, align: "right" },
    { key: "fuel", label: "Carburant (L)", width: 9, align: "right" },
  ];
  return (
    <PdfDocument title={`${t("Rapport mensuel camions")} ${month}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={t("Rapport mensuel camions")} subtitle={formatWorkMonth(month, projectStart, locale)} />
      <PdfTable
        columns={columns}
        rows={rows.map((r) => ({ mat: r.truck?.matricule ?? "", brand: r.truck?.brand ?? "", days: String(r.days), tickets: String(r.tickets), tm: r.tonnage_matin.toFixed(2), ts: r.tonnage_soir.toFixed(2), ton: r.tonnage.toFixed(2), dumps: String(r.dumps), km: r.km.toFixed(1), fuel: r.fuel.toFixed(2) }))}
      />
    </PdfDocument>
  );
}
