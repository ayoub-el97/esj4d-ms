import { Text, View } from "@react-pdf/renderer";
import type { SheetRow } from "@/lib/attendance-types";
import { formatDateFr, formatWorkMonth } from "@/lib/dates";
import { COLLECTE_STAFF_GROUPS, ATTENDANCE_STATUS_LABELS, POSITION_LABELS, TEAM_LABELS, WEEKDAY_SHORT, WORKED_STATUSES, isSubstitutePosition, type TeamType } from "@/lib/types";
import { PdfDocument, PdfHeader, PdfTable, styles, type Column } from "./components";
import { usePdf } from "./context";

const COLUMNS: Column[] = [
  { key: "nb", label: "NB", width: 5, align: "center" },
  { key: "poste", label: "Poste", width: 10 },
  { key: "nom", label: "Nom et prénom", width: 24 },
  { key: "repos", label: "Repos", width: 7, align: "center" },
  { key: "entree", label: "H. entrée", width: 9, align: "center" },
  { key: "sortie", label: "H. sortie", width: 9, align: "center" },
  { key: "hs", label: "HS", width: 6, align: "center" },
  { key: "statut", label: "Statut / motif", width: 12 },
  { key: "obs", label: "Observation", width: 18 },
];

export function AttendanceSheetPdf({
  company,
  agency,
  teamLead,
  date,
  team,
  rows,
  trucks = [],
  generatedBy,
}: {
  company: string;
  agency: string;
  teamLead: string;
  date: string;
  team: TeamType;
  rows: SheetRow[];
  trucks?: { id: string; matricule: string }[];
  generatedBy: string;
}) {
  const { t } = usePdf();
  const title = team === "collecte" ? t("Feuille de présence des équipes de collecte") : t("Feuille de présence des équipes de nettoiement");
  const tableRows: (Record<string, string> & { _group?: string })[] = [];

  const toRow = (r: SheetRow) => ({
    nb: String(r.order_number || ""),
    poste: t(POSITION_LABELS[r.position]),
    nom: r.name + (r.shift > 1 ? ` (${t("service {n}", { n: r.shift })})` : "") + (r.replacing_employee_id ? ` (${t("remplaçant")})` : r.is_extra ? ` (${t("renfort")})` : ""),
    repos: r.rest_day == null ? "" : t(WEEKDAY_SHORT[r.rest_day]),
    entree: WORKED_STATUSES.includes(r.status) ? r.time_in : "",
    sortie: WORKED_STATUSES.includes(r.status) ? r.time_out : "",
    hs: WORKED_STATUSES.includes(r.status) && r.overtime_hours ? String(r.overtime_hours) : "",
    statut: t(ATTENDANCE_STATUS_LABELS[r.status]),
    obs: r.observation,
  });

  const supervisors = rows.filter((r) => r.position === "superviseur");
  if (team === "collecte") {
    const chauffeurs = rows.filter((r) => r.position === "chauffeur" && r.shift === 1);
    const used = new Set<string>();
    const staffGroup = (g: (typeof COLLECTE_STAFF_GROUPS)[number]) => {
      const list = rows.filter((r) => r.position === g.position);
      if (!list.length) return;
      tableRows.push({ _group: t(g.title) });
      for (const r of list) {
        tableRows.push(toRow(r));
        used.add(`${r.employee_id}:${r.shift}`);
      }
    };
    COLLECTE_STAFF_GROUPS.filter((g) => g.placement === "top").forEach(staffGroup);
    for (const c of chauffeurs) {
      const teamRows = rows.filter((r) => r.employee_id === c.employee_id || r.chauffeur_id === c.employee_id);
      const driver = teamRows.find((r) => (r.employee_id === c.employee_id || r.position === "chauffeur_remplacant") && WORKED_STATUSES.includes(r.status) && r.truck_id) ?? c;
      const plate = trucks.find((tr) => tr.id === driver.truck_id)?.matricule;
      tableRows.push({ _group: plate ? t("Équipe {name} — camion {plate}", { name: c.name, plate }) : t("Équipe {name}", { name: c.name }) });
      for (const r of rows) {
        if (r.employee_id === c.employee_id || r.chauffeur_id === c.employee_id) {
          tableRows.push(toRow(r));
          used.add(`${r.employee_id}:${r.shift}`);
        }
      }
    }
    COLLECTE_STAFF_GROUPS.filter((g) => g.placement === "after").forEach(staffGroup);
    const rest = rows.filter((r) => !used.has(`${r.employee_id}:${r.shift}`));
    const freeSubs = rest.filter((r) => isSubstitutePosition(r.position));
    const others = rest.filter((r) => !isSubstitutePosition(r.position));
    if (freeSubs.length) {
      tableRows.push({ _group: t("Remplaçants sans remplacement ce jour") });
      freeSubs.forEach((r) => tableRows.push(toRow(r)));
    }
    if (others.length) {
      tableRows.push({ _group: t("Sans équipe affectée") });
      others.forEach((r) => tableRows.push(toRow(r)));
    }
  } else {
    rows.forEach((r) => tableRows.push(toRow(r)));
  }

  return (
    <PdfDocument title={`${title} — ${formatDateFr(date)}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={title} />
      <View style={styles.metaRow}>
        <View style={styles.metaBox}>
          <Text>
            {t("Agence")} : {agency}
          </Text>
        </View>
        <View style={styles.metaBox}>
          <Text>
            {t("Chef d'équipe")} : {teamLead || "—"}
            {team === "collecte" ? ` · ${t("Superviseur")} : ${Array.from(new Set(supervisors.map((r) => r.name))).join(", ") || "—"}` : ""}
          </Text>
        </View>
        <View style={styles.metaBox}>
          <Text>
            {t("Date")} : {formatDateFr(date)}
          </Text>
        </View>
      </View>
      <PdfTable columns={COLUMNS} rows={tableRows} />
      <View style={{ marginTop: 18, flexDirection: "row", justifyContent: "space-between" }}>
        <Text>{t("Signature du chef d'équipe")} : ______________________</Text>
        <Text>{t("Visa de la direction")} : ______________________</Text>
      </View>
    </PdfDocument>
  );
}

export function MonthlyAttendancePdf({
  company,
  month,
  team,
  rows,
  generatedBy,
}: {
  company: string;
  month: string;
  team?: TeamType;
  rows: { order_number: number; name: string; position: string | null; worked_days: number; rest_days_worked: number; absences: number; sick_days: number; leave_days: number; holidays_worked: number; double_days: number; overtime_total: number }[];
  generatedBy: string;
}) {
  const { t, locale, projectStart } = usePdf();
  const columns: Column[] = [
    { key: "nb", label: "NB", width: 5, align: "center" },
    { key: "nom", label: "Nom et prénom", width: 22 },
    { key: "poste", label: "Poste", width: 9 },
    { key: "trav", label: "Jours travaillés", width: 9, align: "center" },
    { key: "rt", label: "Repos travaillés", width: 8, align: "center" },
    { key: "abs", label: "Absences", width: 9, align: "center" },
    { key: "mal", label: "Maladie", width: 8, align: "center" },
    { key: "conge", label: "Congés", width: 8, align: "center" },
    { key: "ferie", label: "Fériés travaillés", width: 9, align: "center" },
    { key: "double", label: "Jours doublés", width: 8, align: "center" },
    { key: "hs", label: "Total HS", width: 8, align: "center" },
  ];
  const title = team ? `${t("Rapport mensuel de pointage")} — ${t(TEAM_LABELS[team])}` : t("Rapport mensuel de pointage");
  return (
    <PdfDocument title={`${title} — ${formatWorkMonth(month, projectStart, locale)}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={title} subtitle={formatWorkMonth(month, projectStart, locale)} />
      <PdfTable
        columns={columns}
        rows={rows.map((r) => ({
          nb: String(r.order_number),
          nom: r.name,
          poste: r.position ? t(POSITION_LABELS[r.position as keyof typeof POSITION_LABELS]) : "",
          trav: String(r.worked_days),
          rt: String(r.rest_days_worked),
          abs: String(r.absences),
          mal: String(r.sick_days),
          conge: String(r.leave_days),
          ferie: String(r.holidays_worked),
          double: String(r.double_days),
          hs: String(r.overtime_total),
        }))}
      />
      <Text style={[styles.small, { marginTop: 6 }]}>{t("Jours travaillés = Présent + Jour de repos travaillé. Jour doublé : jour de repos travaillé ou deux services le même jour.")}</Text>
    </PdfDocument>
  );
}
