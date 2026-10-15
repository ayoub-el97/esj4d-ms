import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { MonthlyReport } from "@/lib/data/monthly";
import type { WorkerReport } from "@/lib/data/worker";
import { employeeName } from "@/lib/data/employees";
import { formatDateFr, formatMonthFr } from "@/lib/dates";
import { ATTENDANCE_STATUS_LABELS, POSITION_LABELS, TEAM_LABELS, type AttendanceStatus } from "@/lib/types";
import { LEAVE_STATUS_LABELS, TASK_STATUS_LABELS } from "@/lib/module-types";
import { PdfDocument, PdfFooter, PdfHeader, PdfTable, styles, type Column } from "./components";

export function MonthlyReportPdf({ company, report, category, generatedBy }: { company: string; report: MonthlyReport; category: string; generatedBy: string }) {
  const show = (c: string) => category === "toutes" || category === c;
  const attCols: Column[] = [
    { key: "nb", label: "NB", width: 5, align: "center" },
    { key: "nom", label: "Nom", width: 25 },
    { key: "poste", label: "Poste", width: 10 },
    { key: "trav", label: "Travaillés", width: 10, align: "right" },
    { key: "abs", label: "Absences", width: 10, align: "right" },
    { key: "mal", label: "Maladie", width: 10, align: "right" },
    { key: "conge", label: "Congés", width: 10, align: "right" },
    { key: "double", label: "Doublés", width: 10, align: "right" },
    { key: "hs", label: "HS", width: 10, align: "right" },
  ];
  const truckCols: Column[] = [
    { key: "mat", label: "Matricule", width: 20 },
    { key: "brand", label: "Marque", width: 16 },
    { key: "days", label: "Jours", width: 12, align: "right" },
    { key: "ton", label: "Tonnage (t)", width: 16, align: "right" },
    { key: "dumps", label: "Vidages", width: 12, align: "right" },
    { key: "km", label: "Km", width: 12, align: "right" },
    { key: "fuel", label: "Carburant", width: 12, align: "right" },
  ];
  const countCols: Column[] = [
    { key: "nom", label: "Employé", width: 70 },
    { key: "v", label: "Valeur", width: 30, align: "right" },
  ];
  return (
    <PdfDocument title={`Rapport mensuel ${report.month}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title="Rapport mensuel" subtitle={formatMonthFr(report.month)} />
      {show("pointage") && (
        <>
          <Text style={styles.section}>Pointage</Text>
          <PdfTable columns={attCols} rows={report.attendance.map((r) => ({ nb: String(r.order_number), nom: r.name, poste: r.position ? POSITION_LABELS[r.position] : "", trav: String(r.worked_days), abs: String(r.absences), mal: String(r.sick_days), conge: String(r.leave_days), double: String(r.double_days), hs: String(r.overtime_total) }))} />
        </>
      )}
      {show("camions") && (
        <>
          <Text style={styles.section}>Camions</Text>
          <PdfTable columns={truckCols} rows={report.trucks.map((t) => ({ mat: t.truck?.matricule ?? "", brand: t.truck?.brand ?? "", days: String(t.days), ton: t.tonnage.toFixed(2), dumps: String(t.dumps), km: t.km.toFixed(1), fuel: t.fuel.toFixed(2) }))} />
        </>
      )}
      {show("conges") && (
        <>
          <Text style={styles.section}>Congés acceptés (jours dans le mois)</Text>
          <PdfTable columns={countCols} rows={report.leaves.map((r) => ({ nom: r.name, v: `${r.value} j` }))} />
        </>
      )}
      {show("avertissements") && (
        <>
          <Text style={styles.section}>Avertissements</Text>
          <PdfTable columns={countCols} rows={report.warnings.map((r) => ({ nom: r.name, v: String(r.value) }))} />
        </>
      )}
      {show("interventions") && (
        <>
          <Text style={styles.section}>Interventions</Text>
          <Text style={{ marginBottom: 4 }}>
            Déchet vert : {report.greenWasteCount} · Tâches réalisées : {report.tasksDone} · Tâches planifiées : {report.tasksPlanned}
          </Text>
          <PdfTable columns={countCols} rows={report.cleaningDays.map((r) => ({ nom: r.name, v: `${r.value} j de nettoiement` }))} />
        </>
      )}
    </PdfDocument>
  );
}

export function WorkerReportPdf({ company, report, generatedBy }: { company: string; report: WorkerReport; generatedBy: string }) {
  const e = report.employee;
  const attCols: Column[] = [
    { key: "date", label: "Date", width: 14 },
    { key: "st", label: "Statut", width: 16 },
    { key: "in", label: "Entrée", width: 10 },
    { key: "out", label: "Sortie", width: 10 },
    { key: "hs", label: "HS", width: 8, align: "right" },
    { key: "obs", label: "Observation", width: 42 },
  ];
  return (
    <Document title={`Rapport travailleur ${employeeName(e)}`} author={company} language="fr">
      <Page size="A4" style={styles.page}>
        <PdfHeader company={company} title={`Rapport travailleur — ${employeeName(e)}`} subtitle={`du ${formatDateFr(report.from)} au ${formatDateFr(report.to)}`} />
        <Text style={{ marginBottom: 4 }}>
          NB {e.order_number} · Matricule {e.matricule} · {POSITION_LABELS[e.position]} · {TEAM_LABELS[e.team_type]}
        </Text>
        <Text style={{ marginBottom: 6 }}>
          Jours travaillés : {report.summary.worked} · Absences : {report.summary.absent} · Maladie : {report.summary.sick} · Congé : {report.summary.leave} · Repos : {report.summary.rest} · Heures sup. : {report.summary.overtime}
        </Text>
        <Text style={styles.section}>Pointages</Text>
        <PdfTable columns={attCols} rows={report.attendance.map((a) => ({ date: formatDateFr(a.activity_date) + (a.shift > 1 ? ` (s${a.shift})` : ""), st: ATTENDANCE_STATUS_LABELS[a.status as AttendanceStatus], in: a.time_in?.slice(0, 5) ?? "", out: a.time_out?.slice(0, 5) ?? "", hs: Number(a.overtime_hours) ? String(a.overtime_hours) : "", obs: a.observation }))} />
        <Text style={styles.section}>Congés</Text>
        {report.leaves.length === 0 ? <Text style={styles.small}>Aucune demande.</Text> : report.leaves.map((l) => <Text key={l.id}>• {formatDateFr(l.start_date)} → {formatDateFr(l.end_date)} ({l.days} j) — {LEAVE_STATUS_LABELS[l.status]}</Text>)}
        <Text style={styles.section}>Lieux de travail</Text>
        {report.cleaningPlaces.length + report.collections.length === 0 && <Text style={styles.small}>Aucun rapport journalier.</Text>}
        {report.cleaningPlaces.map((c) => (
          <Text key={c.id}>• {formatDateFr(c.activity_date)} — Nettoiement : {c.location || "—"} {c.comment ? `(${c.comment})` : ""}</Text>
        ))}
        {report.collections.map((c) => (
          <Text key={c.id}>• {formatDateFr(c.activity_date)} — Collecte camion {c.truck?.matricule} : {c.sectors || "—"}</Text>
        ))}
        <Text style={styles.section}>Interventions</Text>
        {report.tasks.length === 0 ? <Text style={styles.small}>Aucune tâche.</Text> : report.tasks.map((t) => <Text key={t.id}>• {formatDateFr(t.planned_date)} — {t.location || t.description} — {TASK_STATUS_LABELS[t.status]}</Text>)}
        {report.warnings.length > 0 && (
          <>
            <Text style={styles.section}>Avertissements</Text>
            {report.warnings.map((w) => (
              <Text key={w.id}>• {formatDateFr(w.incident_date)} — {w.description}</Text>
            ))}
          </>
        )}
        <PdfFooter company={company} generatedBy={generatedBy} />
      </Page>
      {report.photos.length > 0 && (
        <Page size="A4" style={styles.page}>
          <PdfHeader company={company} title={`Photos — ${employeeName(e)}`} subtitle={`du ${formatDateFr(report.from)} au ${formatDateFr(report.to)}`} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {report.photos.map((p) => (
              <View key={p.id} style={{ width: 160 }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={p.url} style={{ width: 160, height: 120, objectFit: "cover", borderWidth: 1, borderColor: "#999" }} />
                <Text style={styles.small}>
                  {formatDateFr(p.activity_date)} · {p.phase.toUpperCase()} {p.location ? `· ${p.location}` : ""}
                </Text>
              </View>
            ))}
          </View>
          <PdfFooter company={company} generatedBy={generatedBy} />
        </Page>
      )}
    </Document>
  );
}
