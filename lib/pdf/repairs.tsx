import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { FleetTruck, Repair, RepairExpenseReport } from "@/lib/data/repairs";
import type { AlertRules, PeriodDowntime } from "@/lib/downtime";
import { ALERT_COLORS, ALERT_LABELS } from "@/lib/downtime";
import type { Truck } from "@/lib/data/employees";
import { formatDateFr, formatWorkMonth } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { REPAIR_STATUS_LABELS } from "@/lib/repair-types";
import { PdfDocument, PdfFooter, PdfHeader, PdfTable, PhotoGrid, styles, type Column } from "./components";
import { usePdf } from "./context";

/** Rapport des dépenses de réparation : par camion, détail des réparations, total flotte. */
export function RepairExpensesPdf({
  company,
  subtitle,
  report,
  downtime,
  generatedBy,
}: {
  company: string;
  subtitle: string;
  report: RepairExpenseReport;
  downtime: (PeriodDowntime & { truck: Truck | null })[];
  generatedBy: string;
}) {
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
      <Text style={styles.section}>{t("Immobilisation par camion")}</Text>
      <PdfTable
        columns={[
          { key: "mat", label: "Matricule", width: 16 },
          { key: "n", label: "Pannes", width: 10, align: "right" },
          { key: "days", label: "Jours d'immobilisation", width: 16, align: "right" },
          { key: "open", label: "Ouvertes en fin de période", width: 16, align: "right" },
          { key: "openDays", label: "dont jours", width: 10, align: "right" },
          { key: "avg", label: "Durée moyenne (j)", width: 14, align: "right" },
          { key: "cost", label: "Dépenses (DH)", width: 18, align: "right" },
        ]}
        rows={
          downtime.length
            ? downtime.map((r) => ({
                mat: r.truck?.matricule ?? "",
                n: String(r.incidents),
                days: String(r.downtimeDays),
                open: String(r.openAtEnd),
                openDays: String(r.openAtEndDays),
                avg: r.avgClosedDays == null ? "—" : String(r.avgClosedDays),
                cost: formatAmount(report.rows.find((x) => x.truck_id === r.truck_id)?.total ?? 0),
              }))
            : [{ mat: t("Aucune immobilisation sur cette période."), n: "", days: "", open: "", openDays: "", avg: "", cost: "" }]
        }
      />
      <Text style={[styles.small, { marginTop: 3 }]}>{t("Jours calendaires, jour d'immobilisation et jour de remise en service inclus ; jours limités à la période, sans double compte.")}</Text>
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
        {t("Seules les dépenses réelles sont comptées : coût saisi et date de réparation, statut En réparation ou Réparé (ou Annulé avec frais engagés). Les dossiers « En panne » ne sont pas comptés. Chaque réparation est comptée une seule fois, dans le mois de sa date de réparation.")}
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
      {line("Hors service depuis", r.out_of_service_since ? formatDateFr(r.out_of_service_since) : t("camion resté en service"))}
      {r.expected_return_date ? line("Remise en service prévue", formatDateFr(r.expected_return_date)) : null}
      {line("Date de réparation / remise en service", r.repair_date ? formatDateFr(r.repair_date) : "—")}
      {r.days != null ? line("Jours hors service", r.status === "repare" ? t("{count} j (durée finale)", { count: r.days }) : t("{count} j (en cours)", { count: r.days })) : null}
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
          { key: "rep", label: "Signalé le", width: 10 },
          { key: "prob", label: "Problème", width: 24 },
          { key: "oos", label: "Hors service", width: 12 },
          { key: "done", label: "Réparé le", width: 10 },
          { key: "desc", label: "Réparation / pièces", width: 20 },
          { key: "status", label: "Statut", width: 10 },
          { key: "cost", label: "Coût (DH)", width: 14, align: "right" },
        ]}
        rows={repairs.map((r) => ({
          rep: formatDateFr(r.reported_date),
          prob: r.problem_description,
          oos: r.days == null ? "—" : r.status === "repare" ? t("{count} j", { count: r.days }) : t("{count} j (en cours)", { count: r.days }),
          done: r.repair_date ? formatDateFr(r.repair_date) : "—",
          desc: r.repair_description,
          status: t(REPAIR_STATUS_LABELS[r.status]),
          cost: r.cost == null ? "—" : `${formatAmount(r.cost)}${r.counted ? "" : " *"}`,
        }))}
      />
      <Text style={[styles.small, { marginTop: 4 }]}>{t("* non compté dans les dépenses (en panne, ou annulé sans frais).")}</Text>
    </PdfDocument>
  );
}

const STATE_LABELS: Record<FleetTruck["state"], string> = { en_service: "En service", en_panne: "En panne", en_reparation: "En réparation" };

/** État de la flotte : statut, alerte (texte + couleur), jours hors service, statistiques de la période. */
export function FleetPdf({ company, subtitle, trucks, rules, generatedBy }: { company: string; subtitle: string; trucks: FleetTruck[]; rules: AlertRules; generatedBy: string }) {
  const { t } = usePdf();
  const title = t("État de la flotte");
  const out = trucks.filter((tr) => tr.state !== "en_service");
  const cell = (tr: FleetTruck) => ({ backgroundColor: ALERT_COLORS[tr.alert].bg, color: ALERT_COLORS[tr.alert].fg });
  return (
    <PdfDocument title={`${title} ${subtitle}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={title} subtitle={subtitle} />
      <View style={styles.metaRow}>
        <View style={styles.metaBox}>
          <Text>
            {t("Camions hors service")} : {out.length} · {t("En réparation")} : {trucks.filter((tr) => tr.state === "en_reparation").length}
          </Text>
        </View>
        <View style={styles.metaBox}>
          <Text>
            {t("Jours d'immobilisation en cours (total)")} : {out.reduce((s, tr) => s + tr.currentDays, 0)}
          </Text>
        </View>
        <View style={styles.metaBox}>
          <Text>
            {t("Alertes rouges / orange")} : {trucks.filter((tr) => tr.alert === "rouge").length} / {trucks.filter((tr) => tr.alert === "orange").length}
          </Text>
        </View>
      </View>
      <View style={styles.table}>
        <View style={[styles.tr, styles.th]} fixed>
          {[
            ["Matricule", 12],
            ["Statut", 11],
            ["Alerte", 11],
            ["Hors service depuis", 11],
            ["Jours hors service", 9],
            ["Pannes (fenêtre)", 9],
            ["Remise prévue", 11],
            ["Jours (période)", 9],
            ["Dépenses (période, DH)", 17],
          ].map(([l, w], i, a) => (
            <View key={String(l)} style={[styles.td, { width: `${w}%` }, i === a.length - 1 ? styles.tdLast : {}]}>
              <Text>{t(String(l))}</Text>
            </View>
          ))}
        </View>
        {trucks.map((tr) => {
          const expected = tr.open.map((r) => r.expected_return_date).filter(Boolean).sort()[0] ?? null;
          const vals: [string, number, { backgroundColor: string; color: string }?][] = [
            [tr.truck.matricule, 12],
            [t(STATE_LABELS[tr.state]), 11],
            [t(ALERT_LABELS[tr.alert]), 11, cell(tr)],
            [tr.since ? formatDateFr(tr.since) : "—", 11],
            [tr.state === "en_service" ? "—" : t("{count} j", { count: tr.currentDays }), 9],
            [String(tr.recentCount), 9],
            [expected ? `${formatDateFr(expected)}${tr.overdue ? ` (${t("en retard")})` : ""}` : "—", 11],
            [String(tr.period?.downtimeDays ?? 0), 9],
            [tr.expenses ? formatAmount(tr.expenses) : "—", 17],
          ];
          return (
            <View key={tr.truck_id} style={styles.tr} wrap={false}>
              {vals.map(([v, w, st], i) => (
                <View key={i} style={[styles.td, { width: `${w}%` }, st ?? {}, i === vals.length - 1 ? styles.tdLast : {}]}>
                  <Text>{v}</Text>
                </View>
              ))}
            </View>
          );
        })}
      </View>
      <Text style={[styles.small, { marginTop: 6 }]}>
        {t("Alerte orange : panne en cours depuis {od} j ou plus, ou {oc} pannes ou plus en {w} j. Alerte rouge : {rd} j ou plus, ou {rc} pannes ou plus. Jours calendaires, jour de la panne inclus.", { od: rules.orangeDays, oc: rules.orangeCount, w: rules.windowDays, rd: rules.redDays, rc: rules.redCount })}
      </Text>
    </PdfDocument>
  );
}
