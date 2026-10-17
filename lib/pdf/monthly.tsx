import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { MonthlyReport } from "@/lib/data/monthly";
import type { WorkerReport } from "@/lib/data/worker";
import { employeeName } from "@/lib/data/employees";
import { formatDateFr, formatMonthFr } from "@/lib/dates";
import { ATTENDANCE_STATUS_LABELS, POSITION_LABELS, TEAM_LABELS, type AttendanceStatus } from "@/lib/types";
import { LEAVE_STATUS_LABELS, TASK_STATUS_LABELS } from "@/lib/module-types";
import { PHOTO_PHASE_LABELS } from "@/lib/photo-types";
import { PdfDocument, PdfFooter, PdfHeader, PdfTable, styles, type Column } from "./components";
import { usePdf } from "./context";

export function MonthlyReportPdf({ company, report, category, generatedBy }: { company: string; report: MonthlyReport; category: string; generatedBy: string }) {
  const { t, locale } = usePdf();
  const show = (c: string) => category === "toutes" || category === c;
  const attCols: Column[] = [
    { key: "nb", label: "NB", width: 5, align: "center" },
    { key: "nom", label: "Nom", width: 22 },
    { key: "poste", label: "Poste", width: 9 },
    { key: "trav", label: "Travaillés", width: 9, align: "right" },
    { key: "rt", label: "Repos travaillés", width: 9, align: "right" },
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
    <PdfDocument title={`${t("Rapport mensuel")} ${report.month}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={t("Rapport mensuel")} subtitle={formatMonthFr(report.month, locale)} />
      {show("pointage") && (
        <>
          <Text style={styles.section}>{t("Pointage")}</Text>
          <PdfTable
            columns={attCols}
            rows={report.attendance.map((r) => ({ nb: String(r.order_number), nom: r.name, poste: r.position ? t(POSITION_LABELS[r.position]) : "", trav: String(r.worked_days), rt: String(r.rest_days_worked), abs: String(r.absences), mal: String(r.sick_days), conge: String(r.leave_days), double: String(r.double_days), hs: String(r.overtime_total) }))}
          />
        </>
      )}
      {show("camions") && (
        <>
          <Text style={styles.section}>{t("Camions")}</Text>
          <PdfTable columns={truckCols} rows={report.trucks.map((tr) => ({ mat: tr.truck?.matricule ?? "", brand: tr.truck?.brand ?? "", days: String(tr.days), ton: tr.tonnage.toFixed(2), dumps: String(tr.dumps), km: tr.km.toFixed(1), fuel: tr.fuel.toFixed(2) }))} />
        </>
      )}
      {show("conges") && (
        <>
          <Text style={styles.section}>{t("Congés acceptés (jours dans le mois)")}</Text>
          <PdfTable columns={countCols} rows={report.leaves.map((r) => ({ nom: r.name, v: `${r.value} ${t("j")}` }))} />
        </>
      )}
      {show("avertissements") && (
        <>
          <Text style={styles.section}>{t("Avertissements")}</Text>
          <PdfTable columns={countCols} rows={report.warnings.map((r) => ({ nom: r.name, v: String(r.value) }))} />
        </>
      )}
      {show("interventions") && (
        <>
          <Text style={styles.section}>{t("Interventions")}</Text>
          <Text style={{ marginBottom: 4 }}>
            {t("Déchet vert : {green} · Tâches réalisées : {done} · Tâches planifiées : {planned}", { green: report.greenWasteCount, done: report.tasksDone, planned: report.tasksPlanned })}
          </Text>
          <PdfTable columns={countCols} rows={report.cleaningDays.map((r) => ({ nom: r.name, v: t("{count} j de nettoiement", { count: r.value }) }))} />
        </>
      )}
    </PdfDocument>
  );
}

export function WorkerReportPdf({ company, report, generatedBy }: { company: string; report: WorkerReport; generatedBy: string }) {
  const { t, locale } = usePdf();
  const e = report.employee;
  const period = t("du {from} au {to}", { from: formatDateFr(report.from), to: formatDateFr(report.to) });
  const attCols: Column[] = [
    { key: "date", label: "Date", width: 14 },
    { key: "st", label: "Statut", width: 16 },
    { key: "in", label: "Entrée", width: 10 },
    { key: "out", label: "Sortie", width: 10 },
    { key: "hs", label: "HS", width: 8, align: "right" },
    { key: "obs", label: "Observation", width: 42 },
  ];
  const s = report.summary;
  return (
    <Document title={`${t("Rapport travailleur")} ${employeeName(e)}`} author={company} language={locale}>
      <Page size="A4" style={styles.page}>
        <PdfHeader company={company} title={t("Rapport travailleur — {name}", { name: employeeName(e) })} subtitle={period} />
        <Text style={{ marginBottom: 4 }}>
          {t("NB")} {e.order_number} · {t("Matricule")} {e.matricule} · {t(POSITION_LABELS[e.position])} · {t(TEAM_LABELS[e.team_type])}
        </Text>
        <Text style={{ marginBottom: 6 }}>
          {t("Jours travaillés")} : {s.worked} · {t("Repos travaillés")} : {s.restWorked} · {t("Absences")} : {s.absent} · {t("Maladie")} : {s.sick} · {t("Congés pris")} : {s.leave} · {t("Récupérations prises")} : {s.recovery} · {t("Récupération restante")} : {s.recoveryBalance} · {t("Heures sup.")} : {s.overtime}
        </Text>
        <Text style={styles.section}>{t("Pointages")}</Text>
        <PdfTable
          columns={attCols}
          rows={report.attendance.map((a) => ({
            date: formatDateFr(a.activity_date) + (a.shift > 1 ? ` (s${a.shift})` : ""),
            st: t(ATTENDANCE_STATUS_LABELS[a.status as AttendanceStatus]),
            in: a.time_in?.slice(0, 5) ?? "",
            out: a.time_out?.slice(0, 5) ?? "",
            hs: Number(a.overtime_hours) ? String(a.overtime_hours) : "",
            obs: a.observation,
          }))}
        />
        <Text style={styles.section}>{t("Congés")}</Text>
        {report.leaves.length === 0 ? (
          <Text style={styles.small}>{t("Aucune demande.")}</Text>
        ) : (
          report.leaves.map((l) => (
            <Text key={l.id}>
              • {formatDateFr(l.start_date)} → {formatDateFr(l.end_date)} ({l.days} {t("j")}) — {t(LEAVE_STATUS_LABELS[l.status])}
            </Text>
          ))
        )}
        <Text style={styles.section}>{t("Lieux de travail")}</Text>
        {report.cleaningPlaces.length + report.collections.length === 0 && <Text style={styles.small}>{t("Aucun rapport journalier.")}</Text>}
        {report.cleaningPlaces.map((c) => (
          <Text key={c.id}>
            • {formatDateFr(c.activity_date)} — {t("Nettoiement")} : {c.location || "—"} {c.comment ? `(${c.comment})` : ""}
          </Text>
        ))}
        {report.collections.map((c) => (
          <Text key={c.id}>
            • {formatDateFr(c.activity_date)} — {t("Collecte camion {matricule}", { matricule: c.truck?.matricule ?? "" })} : {c.sectors || "—"}
          </Text>
        ))}
        <Text style={styles.section}>{t("Interventions")}</Text>
        {report.tasks.length === 0 ? (
          <Text style={styles.small}>{t("Aucune tâche.")}</Text>
        ) : (
          report.tasks.map((task) => (
            <Text key={task.id}>
              • {formatDateFr(task.planned_date)} — {task.location || task.description} — {t(TASK_STATUS_LABELS[task.status])}
            </Text>
          ))
        )}
        {report.warnings.length > 0 && (
          <>
            <Text style={styles.section}>{t("Avertissements")}</Text>
            {report.warnings.map((w) => (
              <Text key={w.id}>
                • {formatDateFr(w.incident_date)} — {w.description}
              </Text>
            ))}
          </>
        )}
        <PdfFooter company={company} generatedBy={generatedBy} />
      </Page>
      {report.photos.length > 0 && (
        <Page size="A4" style={styles.page}>
          <PdfHeader company={company} title={t("Photos — {name}", { name: employeeName(e) })} subtitle={period} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {report.photos.map((p) => (
              <View key={p.id} style={{ width: 160 }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={p.url} style={{ width: 160, height: 120, objectFit: "cover", borderWidth: 1, borderColor: "#999" }} />
                <Text style={styles.small}>
                  {formatDateFr(p.activity_date)} · {t(PHOTO_PHASE_LABELS[p.phase as keyof typeof PHOTO_PHASE_LABELS] ?? p.phase)} {p.location ? `· ${p.location}` : ""}
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
