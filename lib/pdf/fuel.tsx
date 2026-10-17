import { Document, Page, Text, View } from "@react-pdf/renderer";
import { fuelTotals, type FuelEntry, type FuelSummaryRow, type FuelTotals } from "@/lib/data/fuel";
import { formatDateFr, formatMonthFr } from "@/lib/dates";
import { PdfDocument, PdfFooter, PdfHeader, PdfTable, PhotoGrid, styles, type Column } from "./components";
import { usePdf } from "./context";

const n = (v: number | null | undefined, digits = 2) => (v == null ? "—" : v.toFixed(digits));

/** Rapport carburant : totaux, liste des pleins, synthèses hebdomadaire et mensuelle. */
export function FuelReportPdf({
  company,
  subtitle,
  entries,
  totals,
  weekly,
  monthly,
  generatedBy,
}: {
  company: string;
  subtitle: string;
  entries: FuelEntry[];
  totals: FuelTotals;
  weekly: FuelSummaryRow[];
  monthly: FuelSummaryRow[];
  generatedBy: string;
}) {
  const { t, locale } = usePdf();
  const title = t("Rapport camions — Carburant");
  const entryCols: Column[] = [
    { key: "date", label: "Date", width: 9 },
    { key: "mat", label: "Matricule", width: 11 },
    { key: "brand", label: "Marque", width: 9 },
    { key: "driver", label: "Chauffeur", width: 16 },
    { key: "liters", label: "Litres", width: 8, align: "right" },
    { key: "cost", label: "Coût", width: 9, align: "right" },
    { key: "price", label: "Prix / L", width: 7, align: "right" },
    { key: "odo", label: "Compteur (km)", width: 10, align: "right" },
    { key: "dist", label: "Km parcourus", width: 9, align: "right" },
    { key: "l100", label: "L/100 km", width: 7, align: "right" },
    { key: "photos", label: "Photos", width: 5, align: "right" },
  ];
  const sumCols = (first: string): Column[] => [
    { key: "period", label: first, width: 20 },
    { key: "mat", label: "Matricule", width: 16 },
    { key: "fills", label: "Pleins", width: 8, align: "right" },
    { key: "liters", label: "Litres", width: 11, align: "right" },
    { key: "cost", label: "Coût", width: 12, align: "right" },
    { key: "dist", label: "Km parcourus", width: 11, align: "right" },
    { key: "l100", label: "L/100 km", width: 10, align: "right" },
    { key: "c100", label: "Coût aux 100 km", width: 12, align: "right" },
  ];
  const sumRows = (rows: FuelSummaryRow[], label: (p: string) => string) =>
    Array.from(new Set(rows.map((r) => r.period_start))).flatMap((p) => {
      const list = rows.filter((r) => r.period_start === p);
      const lines: Record<string, string>[] = list.map((r) => ({
        period: label(p),
        mat: r.truck?.matricule ?? "",
        fills: String(r.fills),
        liters: n(r.liters),
        cost: n(r.cost),
        dist: n(r.distance_km, 0),
        l100: n(r.l_per_100km),
        c100: n(r.cost_per_100km),
      }));
      if (list.length > 1) {
        const tot = fuelTotals(list);
        lines.push({ period: label(p), mat: t("Tous les camions"), fills: String(tot.fills), liters: n(tot.liters), cost: n(tot.cost), dist: n(tot.distance_km, 0), l100: n(tot.l_per_100km), c100: "" });
      }
      return lines;
    });

  return (
    <PdfDocument title={`${title} ${subtitle}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={title} subtitle={subtitle} />
      <View style={styles.metaRow}>
        <View style={styles.metaBox}>
          <Text>
            {t("Pleins")} : {totals.fills} · {t("Litres")} : {n(totals.liters)} L · {t("Coût total")} : {n(totals.cost)}
          </Text>
        </View>
        <View style={styles.metaBox}>
          <Text>
            {t("Km parcourus")} : {n(totals.distance_km, 0)} · {t("Consommation moyenne")} : {totals.l_per_100km == null ? "—" : `${n(totals.l_per_100km)} L/100 km`} · {t("Coût aux 100 km")} : {n(totals.cost_per_100km)}
          </Text>
        </View>
      </View>
      <Text style={styles.section}>{t("Pleins")}</Text>
      <PdfTable
        columns={entryCols}
        rows={entries.map((e) => ({
          date: formatDateFr(e.activity_date),
          mat: e.truck?.matricule ?? "",
          brand: e.truck?.brand ?? "",
          driver: e.driver_name,
          liters: n(e.liters),
          cost: n(e.cost),
          price: n(e.price_per_liter, 3),
          odo: n(e.odometer_km, 0),
          dist: e.distance_km == null ? t("1er plein") : n(e.distance_km, 0),
          l100: n(e.l_per_100km),
          photos: e.photos.length ? String(e.photos.length) : "",
        }))}
      />
      <Text style={styles.section}>{t("Consommation hebdomadaire")}</Text>
      <PdfTable columns={sumCols("Semaine")} rows={sumRows(weekly, (p) => t("Semaine du {date}", { date: formatDateFr(p) }))} />
      <Text style={styles.section}>{t("Consommation mensuelle")}</Text>
      <PdfTable columns={sumCols("Mois")} rows={sumRows(monthly, (p) => formatMonthFr(p.slice(0, 7), locale))} />
      <Text style={[styles.small, { marginTop: 6 }]}>
        {t("Consommation calculée de plein à plein : litres du plein × 100 ÷ km parcourus depuis le plein précédent du même camion. Le premier plein d'un camion sert de référence.")}
      </Text>
    </PdfDocument>
  );
}

/** Fiche d'un plein avec ses photos (archive). */
export function FuelEntryPdf({ company, entry, generatedBy }: { company: string; entry: FuelEntry; generatedBy: string }) {
  const { t, locale } = usePdf();
  const title = t("Plein de carburant");
  const line = (label: string, value: string) => (
    <Text style={{ marginBottom: 3 }}>
      {t(label)} : {value}
    </Text>
  );
  return (
    <Document title={`${title} ${entry.truck?.matricule ?? ""} ${entry.activity_date}`} author={company} language={locale}>
      <Page size="A4" style={styles.page}>
        <PdfHeader company={company} title={title} subtitle={`${entry.truck?.matricule ?? ""} — ${formatDateFr(entry.activity_date)}`} />
        {line("Camion (matricule)", `${entry.truck?.matricule ?? ""}${entry.truck?.brand ? ` — ${entry.truck.brand}` : ""}`)}
        {line("Chauffeur", entry.driver_name || "—")}
        {line("Litres", `${n(entry.liters)} L`)}
        {line("Coût", n(entry.cost))}
        {line("Prix au litre", n(entry.price_per_liter, 3))}
        {line("Kilométrage compteur (km)", n(entry.odometer_km, 0))}
        {line("Km parcourus depuis le plein précédent", entry.distance_km == null ? t("1er plein (référence)") : n(entry.distance_km, 0))}
        {line("Consommation", entry.l_per_100km == null ? "—" : `${n(entry.l_per_100km)} L/100 km`)}
        {entry.station ? line("Station", entry.station) : null}
        {entry.observations ? line("Observations", entry.observations) : null}
        <PhotoGrid title="Photos du plein" photos={entry.photos} />
        <PdfFooter company={company} generatedBy={generatedBy} />
      </Page>
    </Document>
  );
}
