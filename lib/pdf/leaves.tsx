import { Text, View } from "@react-pdf/renderer";
import type { AccrualLine, Adjustment, LeaveBalance, LeaveRequest, RecoveryBalance, RecoveryCredit, RecoveryRequest, TakenDay } from "@/lib/data/leaves";
import type { Employee } from "@/lib/data/employees";
import { employeeName } from "@/lib/data/employees";
import type { WorkerPeriodRow } from "@/lib/data/worker";
import { LEAVE_STATUS_LABELS } from "@/lib/module-types";
import { formatDateFr } from "@/lib/dates";
import { POSITION_LABELS, TEAM_LABELS } from "@/lib/types";
import { PdfDocument, PdfHeader, PdfTable, styles, type Column } from "./components";
import { usePdf } from "./context";
import { CREDIT_STATE_LABELS, creditLabel } from "@/lib/recovery-credit";

export function LeaveBalancesPdf({ company, asOf, filterLabel, rows, generatedBy }: { company: string; asOf: string; filterLabel: string; rows: LeaveBalance[]; generatedBy: string }) {
  const { t } = usePdf();
  const columns: Column[] = [
    { key: "nb", label: "NB", width: 5, align: "center" },
    { key: "mat", label: "Matricule", width: 9 },
    { key: "nom", label: "Nom et prénom", width: 21 },
    { key: "eq", label: "Équipe", width: 9 },
    { key: "poste", label: "Poste", width: 9 },
    { key: "entree", label: "Date d'entrée", width: 10 },
    { key: "acq", label: "Acquis", width: 8, align: "right" },
    { key: "pris", label: "Pris", width: 7, align: "right" },
    { key: "adj", label: "Corrections", width: 9, align: "right" },
    { key: "solde", label: "Solde restant", width: 12, align: "right" },
  ];
  return (
    <PdfDocument title={`${t("Solde de congés")} ${asOf}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={t("Solde de congés")} subtitle={`${t("au {date}", { date: formatDateFr(asOf) })}${filterLabel ? ` — ${filterLabel}` : ""}`} />
      <PdfTable
        columns={columns}
        rows={rows.map((r) => ({
          nb: String(r.order_number),
          mat: r.matricule,
          nom: r.name,
          eq: r.team_type ? t(TEAM_LABELS[r.team_type]) : "",
          poste: r.position ? t(POSITION_LABELS[r.position]) : "",
          entree: r.hire_date ? formatDateFr(r.hire_date) : t("non renseignée"),
          acq: String(r.accrued),
          pris: String(r.taken),
          adj: r.adjustments ? String(r.adjustments) : "",
          solde: String(r.balance),
        }))}
      />
      <Text style={[styles.small, { marginTop: 6 }]}>{t("Solde = congés acquis − congés effectivement pris + corrections. Acquisition : 1,5 jour par mois complet de service.")}</Text>
    </PdfDocument>
  );
}

export function RecoveryBalancesPdf({ company, subtitle, rows, generatedBy }: { company: string; subtitle: string; rows: RecoveryBalance[]; generatedBy: string }) {
  const { t } = usePdf();
  const columns: Column[] = [
    { key: "nb", label: "NB", width: 5, align: "center" },
    { key: "mat", label: "Matricule", width: 9 },
    { key: "nom", label: "Nom et prénom", width: 22 },
    { key: "eq", label: "Équipe", width: 9 },
    { key: "poste", label: "Poste", width: 9 },
    { key: "rt", label: "Repos travaillés", width: 10, align: "right" },
    { key: "acq", label: "Récup. acquise", width: 10, align: "right" },
    { key: "pris", label: "Récup. prise", width: 9, align: "right" },
    { key: "pend", label: "En attente", width: 7, align: "right" },
    { key: "solde", label: "Solde restant", width: 9, align: "right" },
  ];
  return (
    <PdfDocument title={`${t("Solde de récupération")} ${subtitle}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={t("Solde de récupération")} subtitle={subtitle} />
      <PdfTable
        columns={columns}
        rows={rows.map((r) => ({
          nb: String(r.order_number),
          mat: r.matricule,
          nom: r.name,
          eq: r.team_type ? t(TEAM_LABELS[r.team_type]) : "",
          poste: r.position ? t(POSITION_LABELS[r.position]) : "",
          rt: String(r.credits_period),
          acq: String(r.credits_period),
          pris: String(r.taken_period),
          pend: r.pending ? String(r.pending) : "",
          solde: String(r.balance),
        }))}
      />
      <Text style={[styles.small, { marginTop: 6 }]}>{t("Solde = jours de récupération acquis − jours effectivement pris + corrections, à la fin de la période.")}</Text>
    </PdfDocument>
  );
}

export function LeaveHistoryPdf({ company, subtitle, rows, generatedBy }: { company: string; subtitle: string; rows: LeaveRequest[]; generatedBy: string }) {
  const { t } = usePdf();
  const columns: Column[] = [
    { key: "nom", label: "Employé", width: 20 },
    { key: "dem", label: "Demande du", width: 10 },
    { key: "du", label: "Du", width: 10 },
    { key: "au", label: "Au", width: 10 },
    { key: "j", label: "Jours demandés", width: 9, align: "right" },
    { key: "st", label: "Statut", width: 10 },
    { key: "motif", label: "Commentaire", width: 16 },
    { key: "dec", label: "Décision", width: 15 },
  ];
  return (
    <PdfDocument title={`${t("Historique des congés")} ${subtitle}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={t("Historique des congés")} subtitle={subtitle} />
      <PdfTable
        columns={columns}
        rows={rows.map((r) => ({
          nom: `${r.name} (${r.matricule})`,
          dem: formatDateFr(r.request_date),
          du: formatDateFr(r.start_date),
          au: formatDateFr(r.end_date),
          j: String(r.requested_days),
          st: t(LEAVE_STATUS_LABELS[r.status]),
          motif: r.reason,
          dec: r.decided_at ? `${formatDateFr(r.decided_at.slice(0, 10))} ${r.decided_by_name}${r.decision_note ? ` — ${r.decision_note}` : ""}` : "",
        }))}
      />
    </PdfDocument>
  );
}

export function RecoveryHistoryPdf({ company, subtitle, rows, generatedBy }: { company: string; subtitle: string; rows: RecoveryRequest[]; generatedBy: string }) {
  const { t } = usePdf();
  const columns: Column[] = [
    { key: "nom", label: "Employé", width: 20 },
    { key: "dem", label: "Demande du", width: 10 },
    { key: "rt", label: "Repos travaillé le", width: 11 },
    { key: "rec", label: "Récupération le", width: 11 },
    { key: "j", label: "Jours", width: 6, align: "right" },
    { key: "st", label: "Statut", width: 10 },
    { key: "com", label: "Commentaire", width: 16 },
    { key: "dec", label: "Décision", width: 16 },
  ];
  return (
    <PdfDocument title={`${t("Historique des récupérations")} ${subtitle}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={t("Historique des récupérations")} subtitle={subtitle} />
      <PdfTable
        columns={columns}
        rows={rows.map((r) => ({
          nom: `${r.name} (${r.matricule})`,
          dem: formatDateFr(r.request_date),
          rt: formatDateFr(r.worked_rest_date),
          rec: formatDateFr(r.recovery_date),
          j: String(r.requested_days),
          st: t(LEAVE_STATUS_LABELS[r.status]),
          com: r.comment,
          dec: r.decided_at ? `${formatDateFr(r.decided_at.slice(0, 10))} ${r.decided_by_name}${r.decision_note ? ` — ${r.decision_note}` : ""}` : "",
        }))}
      />
    </PdfDocument>
  );
}

/** Détail congé + récupération d'un employé. */
export function EmployeeLeavePdf({
  company,
  employee,
  asOf,
  leave,
  recovery,
  schedule,
  leaveTaken,
  recoveryTaken,
  credits,
  adjustments,
  generatedBy,
}: {
  company: string;
  employee: Employee;
  asOf: string;
  leave: LeaveBalance | undefined;
  recovery: RecoveryBalance | undefined;
  schedule: AccrualLine[];
  leaveTaken: TakenDay[];
  recoveryTaken: TakenDay[];
  credits: RecoveryCredit[];
  adjustments: Adjustment[];
  generatedBy: string;
}) {
  const { t } = usePdf();
  const list = (days: TakenDay[]) => (days.length ? days.map((d) => `${formatDateFr(d.day)} (${d.source === "pointage" ? t("Pointage") : t("Demande acceptée")})`).join(" · ") : t("Aucun jour pris."));
  return (
    <PdfDocument title={`${t("Congé / Récupération")} ${employeeName(employee)}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={t("Congé / Récupération — {name}", { name: employeeName(employee) })} subtitle={t("au {date}", { date: formatDateFr(asOf) })} />
      <Text style={{ marginBottom: 6 }}>
        {t("NB {nb} · {matricule} · date d'entrée {date}", { nb: employee.order_number, matricule: employee.matricule, date: employee.hire_date ? formatDateFr(employee.hire_date) : t("non renseignée") })}
      </Text>
      <Text style={styles.section}>{t("Congés")}</Text>
      <Text>
        {t("Acquis")} : {leave?.accrued ?? 0} · {t("Pris")} : {leave?.taken ?? 0} · {t("Corrections")} : {leave?.adjustments ?? 0} · {t("Solde restant")} : {leave?.balance ?? 0} · {t("Acceptés à venir")} : {leave?.planned ?? 0}
      </Text>
      <Text style={[styles.section, { fontSize: 9 }]}>{t("Détail des acquisitions")}</Text>
      <PdfTable
        columns={[
          { key: "m", label: "Mois", width: 15, align: "center" },
          { key: "d", label: "Date du crédit", width: 35 },
          { key: "j", label: "Jours", width: 25, align: "right" },
          { key: "c", label: "Cumul", width: 25, align: "right" },
        ]}
        rows={schedule.map((s) => ({ m: String(s.month_index), d: formatDateFr(s.credit_date), j: `+${s.days}`, c: String(s.cumulative) }))}
      />
      <Text style={[styles.section, { fontSize: 9 }]}>{t("Jours de congé pris")}</Text>
      <Text style={styles.small}>{list(leaveTaken)}</Text>

      <Text style={styles.section}>{t("Récupération")}</Text>
      <Text>
        {t("Acquise")} : {recovery?.credits_total ?? 0} · {t("Prise")} : {recovery?.taken_total ?? 0} · {t("Corrections")} : {recovery?.adjustments ?? 0} · {t("Solde restant")} : {recovery?.balance ?? 0}
      </Text>
      <Text style={[styles.section, { fontSize: 9 }]}>{t("Crédits de récupération")}</Text>
      <Text style={styles.small}>
        {credits.length
          ? credits.map((c) => `${creditLabel({ date: c.worked_rest_date, kind: c.kind, label: c.holiday_label, expires_on: c.expires_on }, t, false)} (${t(CREDIT_STATE_LABELS[c.state])})`).join(" · ")
          : t("Aucun crédit.")}
      </Text>
      <Text style={[styles.section, { fontSize: 9 }]}>{t("Jours de récupération pris")}</Text>
      <Text style={styles.small}>{list(recoveryTaken)}</Text>

      {adjustments.length > 0 && (
        <View>
          <Text style={[styles.section, { fontSize: 9 }]}>{t("Corrections")}</Text>
          {adjustments.map((a) => (
            <Text key={a.id} style={styles.small}>
              • {formatDateFr(a.created_at.slice(0, 10))} — {a.kind === "conge" ? t("Congés") : t("Récupération")} : {a.days > 0 ? `+${a.days}` : a.days} — {a.reason}
            </Text>
          ))}
        </View>
      )}
    </PdfDocument>
  );
}

export function WorkersPeriodPdf({ company, subtitle, rows, generatedBy }: { company: string; subtitle: string; rows: WorkerPeriodRow[]; generatedBy: string }) {
  const { t } = usePdf();
  const columns: Column[] = [
    { key: "nb", label: "NB", width: 5, align: "center" },
    { key: "mat", label: "Matricule", width: 9 },
    { key: "nom", label: "Nom et prénom", width: 13 },
    { key: "eq", label: "Équipe", width: 9 },
    { key: "poste", label: "Poste", width: 7 },
    { key: "trav", label: "Jours travaillés", width: 7, align: "right" },
    { key: "rt", label: "Repos travaillés", width: 7, align: "right" },
    { key: "hs", label: "Total HS", width: 5, align: "right" },
    { key: "abs", label: "Absences", width: 6, align: "right" },
    { key: "fe", label: "Fériés trav.", width: 5, align: "right" },
    { key: "fp", label: "Fériés à payer", width: 3, align: "right" },
    { key: "ta", label: "Total congés", width: 6, align: "right" },
    { key: "cg", label: "Congés pris", width: 5, align: "right" },
    { key: "cr", label: "Congé restant", width: 6, align: "right" },
    { key: "rp", label: "Récupérations prises", width: 6, align: "right" },
    { key: "rr", label: "Récupération restante", width: 5, align: "right" },
  ];
  const sum = (k: keyof WorkerPeriodRow) => rows.reduce((s, r) => s + Number(r[k]), 0);
  return (
    <PdfDocument title={`${t("Rapports travailleurs")} ${subtitle}`} company={company} generatedBy={generatedBy} orientation="landscape">
      <PdfHeader company={company} title={t("Rapports travailleurs")} subtitle={t("Période : {period}", { period: subtitle })} />
      <PdfTable
        columns={columns}
        rows={[
          ...rows.map((r) => ({
            nb: String(r.order_number),
            mat: r.matricule,
            nom: r.name,
            eq: `${t(TEAM_LABELS[r.team_type])}${r.crew ? ` — ${r.crew}` : ""}`,
            poste: t(POSITION_LABELS[r.position]),
            trav: String(r.worked_days),
            rt: String(r.rest_days_worked),
            hs: String(r.overtime_total),
            abs: String(r.absences + r.sick_days),
            ta: String(r.leave_accrued),
            cg: String(r.leave_days),
            cr: String(r.leave_balance),
            rp: String(r.recovery_days),
            rr: String(r.recovery_balance),
            fe: String(r.holidays_worked),
            fp: String(r.holiday_pay_days),
          })),
          {
            nb: "",
            mat: "",
            nom: t("Total ({count} employés)", { count: rows.length }),
            eq: "",
            poste: "",
            trav: String(sum("worked_days")),
            rt: String(sum("rest_days_worked")),
            hs: String(sum("overtime_total")),
            abs: String(sum("absences") + sum("sick_days")),
            ta: String(sum("leave_accrued")),
            cg: String(sum("leave_days")),
            cr: String(sum("leave_balance")),
            rp: String(sum("recovery_days")),
            rr: String(sum("recovery_balance")),
            fe: String(sum("holidays_worked")),
            fp: String(sum("holiday_pay_days")),
          },
        ]}
      />
      <Text style={[styles.small, { marginTop: 6 }]}>{t("Calculé depuis les pointages : une même journée n'est jamais comptée deux fois, même avec plusieurs services. Jours travaillés = Présent + Jour de repos travaillé + Férié non travaillé.")} {t("Férié travaillé : compte double, 1 jour à récupérer demandé avant la fin du mois, sinon à payer.")} {t("Congés pris et récupérations prises : jours pointés, ou demande acceptée pour un jour passé non pointé. Récupération restante : repos travaillés pas encore récupérés.")}</Text>
    </PdfDocument>
  );
}
