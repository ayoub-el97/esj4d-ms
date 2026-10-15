import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { CleaningAgent, CleaningSummaryRow, CollectionReportFull, TruckReportRow } from "@/lib/data/reports";
import { employeeName } from "@/lib/data/employees";
import { formatDateFr, formatMonthFr } from "@/lib/dates";
import type { PhotoItem } from "@/lib/photo-types";
import { PdfDocument, PdfFooter, PdfHeader, PdfTable, styles, type Column } from "./components";

function PhotoGrid({ title, photos }: { title: string; photos: PhotoItem[] }) {
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.section}>{title}</Text>
      {photos.length === 0 ? (
        <Text style={styles.small}>Aucune photo</Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {photos.map((p) => (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image key={p.id} src={p.url} style={{ width: 160, height: 120, objectFit: "cover", borderWidth: 1, borderColor: "#999" }} />
          ))}
        </View>
      )}
    </View>
  );
}

/** Rapport nettoiement : une page par agent (date, nom, lieu, photos AVANT / APRÈS). */
export function CleaningReportPdf({ company, date, agents, observations, generatedBy }: { company: string; date: string; agents: CleaningAgent[]; observations: string; generatedBy: string }) {
  return (
    <Document title={`Rapport journalier nettoiement ${date}`} author={company} language="fr">
      {agents.length === 0 && (
        <Page size="A4" style={styles.page}>
          <PdfHeader company={company} title="Rapport journalier — Nettoiement" subtitle={formatDateFr(date)} />
          <Text>Aucun agent dans ce rapport.</Text>
          <PdfFooter company={company} generatedBy={generatedBy} />
        </Page>
      )}
      {agents.map((a) => (
        <Page key={a.id} size="A4" style={styles.page}>
          <PdfHeader company={company} title="Rapport journalier — Nettoiement" subtitle={formatDateFr(date)} />
          <View style={styles.metaRow}>
            <View style={styles.metaBox}>
              <Text>Date : {formatDateFr(date)}</Text>
            </View>
            <View style={styles.metaBox}>
              <Text>Agent : {a.name} (NB {a.order_number})</Text>
            </View>
            <View style={styles.metaBox}>
              <Text>Lieu : {a.location || "—"}</Text>
            </View>
          </View>
          {a.comment ? <Text style={{ marginBottom: 4 }}>Commentaire : {a.comment}</Text> : null}
          <PhotoGrid title="Photos AVANT" photos={a.photosAvant} />
          <PhotoGrid title="Photos APRÈS" photos={a.photosApres} />
          {observations ? <Text style={[styles.small, { marginTop: 10 }]}>Observations générales : {observations}</Text> : null}
          <PdfFooter company={company} generatedBy={generatedBy} />
        </Page>
      ))}
    </Document>
  );
}

/** Rapport collecte : une page par camion. */
export function CollectionReportPdf({ company, date, reports, generatedBy }: { company: string; date: string; reports: CollectionReportFull[]; generatedBy: string }) {
  return (
    <Document title={`Rapport journalier collecte ${date}`} author={company} language="fr">
      {reports.map((r) => (
        <Page key={r.id} size="A4" style={styles.page}>
          <PdfHeader company={company} title="Rapport journalier — Collecte" subtitle={formatDateFr(date)} />
          <View style={styles.metaRow}>
            <View style={styles.metaBox}>
              <Text>Camion : {r.truck?.matricule ?? "?"} {r.truck?.brand ? `(${r.truck.brand})` : ""}</Text>
            </View>
            <View style={styles.metaBox}>
              <Text>Chauffeur : {r.chauffeur ? employeeName(r.chauffeur) : "—"}</Text>
            </View>
            <View style={styles.metaBox}>
              <Text>Date : {formatDateFr(date)}</Text>
            </View>
          </View>
          <Text style={{ marginBottom: 3 }}>Rippeurs : {r.rippers.length ? r.rippers.map(employeeName).join(", ") : "—"}</Text>
          <Text style={{ marginBottom: 3 }}>Lieux / secteurs : {r.sectors || "—"}</Text>
          {r.truckReport && (
            <Text style={{ marginBottom: 3 }}>
              Ticket {r.truckReport.ticket1 || "—"} : {r.truckReport.tonnage1 ?? "—"} t · 2e ticket {r.truckReport.ticket2 || "—"} : {r.truckReport.tonnage2 ?? "—"} t · Vidages : {r.truckReport.dumps_count}
              {r.truckReport.km != null ? ` · Km : ${r.truckReport.km}` : ""}
              {r.truckReport.fuel != null ? ` · Carburant : ${r.truckReport.fuel} L` : ""}
            </Text>
          )}
          {r.observations ? <Text style={{ marginBottom: 3 }}>Observations : {r.observations}</Text> : null}
          <PhotoGrid title="Photos AVANT" photos={r.photosAvant} />
          <PhotoGrid title="Photos APRÈS" photos={r.photosApres} />
          <PdfFooter company={company} generatedBy={generatedBy} />
        </Page>
      ))}
    </Document>
  );
}

const TRUCK_COLUMNS: Column[] = [
  { key: "brand", label: "Marque", width: 9 },
  { key: "mat", label: "Matricule", width: 12 },
  { key: "chauffeur", label: "Chauffeur", width: 18 },
  { key: "t1", label: "N° ticket", width: 10 },
  { key: "ton1", label: "Tonnage", width: 9, align: "right" },
  { key: "t2", label: "2e ticket", width: 10 },
  { key: "ton2", label: "2e tonnage", width: 9, align: "right" },
  { key: "dumps", label: "Vidages", width: 8, align: "right" },
  { key: "rip", label: "Rippeurs", width: 8, align: "right" },
  { key: "obs", label: "Observations", width: 7 },
];

const truckRow = (t: TruckReportRow) => ({
  brand: t.truck?.brand ?? "",
  mat: t.truck?.matricule ?? "",
  chauffeur: t.chauffeur_name,
  t1: t.ticket1,
  ton1: t.tonnage1 == null ? "" : String(t.tonnage1),
  t2: t.ticket2,
  ton2: t.tonnage2 == null ? "" : String(t.tonnage2),
  dumps: String(t.dumps_count),
  rip: String(t.rippers_count),
  obs: t.observations,
});

/** Rapport journalier global : tableau camions + récapitulatif nettoiement. */
export function GlobalDailyPdf({ company, date, trucks, summary, generatedBy }: { company: string; date: string; trucks: TruckReportRow[]; summary: CleaningSummaryRow[]; generatedBy: string }) {
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
  const totalTon = trucks.reduce((s, t) => s + Number(t.tonnage1 ?? 0) + Number(t.tonnage2 ?? 0), 0);
  return (
    <PdfDocument title={`Rapport journalier global ${date}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title="Rapport journalier global" subtitle={formatDateFr(date)} />
      <Text style={styles.section}>Collecte — tableau des camions</Text>
      <PdfTable columns={TRUCK_COLUMNS} rows={trucks.map(truckRow)} />
      <Text style={[styles.small, { marginTop: 3 }]}>
        Total tonnage : {totalTon.toFixed(2)} t · Vidages : {trucks.reduce((s, t) => s + t.dumps_count, 0)} · Rippeurs : {trucks.reduce((s, t) => s + t.rippers_count, 0)}
      </Text>
      <Text style={styles.section}>Nettoiement — tableau récapitulatif</Text>
      <PdfTable
        columns={summaryColumns}
        rows={summary.map((s) => ({
          zone: s.zone,
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
  const columns: Column[] = [{ key: "date", label: "Date", width: 9 }, ...TRUCK_COLUMNS.map((c) => ({ ...c, width: c.width * 0.91 }))];
  return (
    <PdfDocument title={`Rapport camions ${subtitle}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title="Rapport camions" subtitle={subtitle} />
      <PdfTable columns={columns} rows={rows.map((t) => ({ date: formatDateFr(t.activity_date), ...truckRow(t) }))} />
    </PdfDocument>
  );
}

export function TruckMonthlyPdf({ company, month, rows, generatedBy }: { company: string; month: string; rows: { truck: { matricule: string; brand: string } | null; days: number; tickets: number; tonnage: number; dumps: number; km: number; fuel: number }[]; generatedBy: string }) {
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
    <PdfDocument title={`Rapport mensuel camions ${month}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title="Rapport mensuel camions" subtitle={formatMonthFr(month)} />
      <PdfTable
        columns={columns}
        rows={rows.map((r) => ({ mat: r.truck?.matricule ?? "", brand: r.truck?.brand ?? "", days: String(r.days), tickets: String(r.tickets), ton: r.tonnage.toFixed(2), dumps: String(r.dumps), km: r.km.toFixed(1), fuel: r.fuel.toFixed(2) }))}
      />
    </PdfDocument>
  );
}
