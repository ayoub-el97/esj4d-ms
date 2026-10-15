import { Text, View } from "@react-pdf/renderer";
import type { SheetRow } from "@/lib/attendance-types";
import { formatDateFr, formatMonthFr } from "@/lib/dates";
import { ATTENDANCE_STATUS_LABELS, POSITION_LABELS, TEAM_LABELS, WEEKDAY_SHORT, type TeamType } from "@/lib/types";
import { PdfDocument, PdfHeader, PdfTable, styles, type Column } from "./components";

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
  generatedBy,
}: {
  company: string;
  agency: string;
  teamLead: string;
  date: string;
  team: TeamType;
  rows: SheetRow[];
  generatedBy: string;
}) {
  const title = `Feuille de présence des équipes de ${TEAM_LABELS[team].toLowerCase()}`;
  const tableRows: (Record<string, string> & { _group?: string })[] = [];

  const toRow = (r: SheetRow) => ({
    nb: String(r.order_number || ""),
    poste: POSITION_LABELS[r.position],
    nom: r.name + (r.shift > 1 ? ` (service ${r.shift})` : "") + (r.replacing_employee_id ? " (remplaçant)" : r.is_extra ? " (renfort)" : ""),
    repos: r.rest_day == null ? "" : WEEKDAY_SHORT[r.rest_day],
    entree: r.status === "present" ? r.time_in : "",
    sortie: r.status === "present" ? r.time_out : "",
    hs: r.status === "present" && r.overtime_hours ? String(r.overtime_hours) : "",
    statut: ATTENDANCE_STATUS_LABELS[r.status],
    obs: r.observation,
  });

  if (team === "collecte") {
    const chauffeurs = rows.filter((r) => r.position === "chauffeur" && r.shift === 1);
    const used = new Set<string>();
    for (const c of chauffeurs) {
      tableRows.push({ _group: `Équipe ${c.name}` });
      for (const r of rows) {
        if (r.employee_id === c.employee_id || r.chauffeur_id === c.employee_id) {
          tableRows.push(toRow(r));
          used.add(`${r.employee_id}:${r.shift}`);
        }
      }
    }
    const rest = rows.filter((r) => !used.has(`${r.employee_id}:${r.shift}`));
    if (rest.length) {
      tableRows.push({ _group: "Sans équipe affectée" });
      rest.forEach((r) => tableRows.push(toRow(r)));
    }
  } else {
    rows.forEach((r) => tableRows.push(toRow(r)));
  }

  return (
    <PdfDocument title={`${title} — ${formatDateFr(date)}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={title} />
      <View style={styles.metaRow}>
        <View style={styles.metaBox}>
          <Text>Agence : {agency}</Text>
        </View>
        <View style={styles.metaBox}>
          <Text>Chef d&apos;équipe : {teamLead || "—"}</Text>
        </View>
        <View style={styles.metaBox}>
          <Text>Date : {formatDateFr(date)}</Text>
        </View>
      </View>
      <PdfTable columns={COLUMNS} rows={tableRows} />
      <View style={{ marginTop: 18, flexDirection: "row", justifyContent: "space-between" }}>
        <Text>Signature du chef d&apos;équipe : ______________________</Text>
        <Text>Visa de la direction : ______________________</Text>
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
  rows: { order_number: number; name: string; position: string | null; worked_days: number; absences: number; sick_days: number; leave_days: number; holidays_worked: number; double_days: number; overtime_total: number }[];
  generatedBy: string;
}) {
  const columns: Column[] = [
    { key: "nb", label: "NB", width: 5, align: "center" },
    { key: "nom", label: "Nom et prénom", width: 25 },
    { key: "poste", label: "Poste", width: 10 },
    { key: "trav", label: "Jours travaillés", width: 10, align: "center" },
    { key: "abs", label: "Absences", width: 9, align: "center" },
    { key: "mal", label: "Maladie", width: 8, align: "center" },
    { key: "conge", label: "Congés", width: 8, align: "center" },
    { key: "ferie", label: "Fériés travaillés", width: 9, align: "center" },
    { key: "double", label: "Jours doublés", width: 8, align: "center" },
    { key: "hs", label: "Total HS", width: 8, align: "center" },
  ];
  const title = `Rapport mensuel de pointage${team ? ` — ${TEAM_LABELS[team]}` : ""}`;
  return (
    <PdfDocument title={`${title} — ${formatMonthFr(month)}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={title} subtitle={formatMonthFr(month)} />
      <PdfTable
        columns={columns}
        rows={rows.map((r) => ({
          nb: String(r.order_number),
          nom: r.name,
          poste: r.position ? POSITION_LABELS[r.position as keyof typeof POSITION_LABELS] : "",
          trav: String(r.worked_days),
          abs: String(r.absences),
          mal: String(r.sick_days),
          conge: String(r.leave_days),
          ferie: String(r.holidays_worked),
          double: String(r.double_days),
          hs: String(r.overtime_total),
        }))}
      />
      <Text style={[styles.small, { marginTop: 6 }]}>
        Jour doublé : jour travaillé le jour de repos habituel ou deux services le même jour.
      </Text>
    </PdfDocument>
  );
}
