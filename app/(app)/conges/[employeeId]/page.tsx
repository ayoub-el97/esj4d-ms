import { Suspense } from "react";
import { fmtDays, leaveDashboard } from "@/lib/leave-method";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { employeeName, getEmployee } from "@/lib/data/employees";
import { getLeaveBalances, getLeaveDetail, getLeaveRequests, getRecoveryBalances, getRecoveryDetail, getRecoveryRequests } from "@/lib/data/leaves";
import { formatDateFr, formatDateTimeFr, isISODate, todayISO } from "@/lib/dates";
import { CREDIT_STATE_LABELS, creditLabel } from "@/lib/recovery-credit";
import { getT, pageTitle } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/config";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdjustmentForm } from "../leaves-ui";
import { LeaveRequestsTable, RecoveryRequestsTable } from "../tables";

export const generateMetadata = pageTitle("Congé / Récupération de l'employé");

export default async function EmployeeLeavesPage({ params, searchParams }: { params: Promise<{ employeeId: string }>; searchParams: Promise<{ date?: string }> }) {
  const [user, t] = await Promise.all([requireModule("conges"), getT()]);
  const { employeeId } = await params;
  const sp = await searchParams;
  const asOf = isISODate(sp.date) ? sp.date : todayISO();
  const employee = await getEmployee(employeeId);
  if (!employee) notFound();

  const [leaveBalances, recoveryBalances, leaveDetail, recoveryDetail, leaveRequests, recoveryRequests] = await Promise.all([
    getLeaveBalances(asOf, { includeInactive: true }),
    getRecoveryBalances(null, asOf, { includeInactive: true }),
    getLeaveDetail(employeeId, asOf),
    getRecoveryDetail(employeeId, asOf),
    getLeaveRequests({ employee: employeeId }),
    getRecoveryRequests({ employee: employeeId }),
  ]);
  const lb = leaveBalances.find((b) => b.employee_id === employeeId);
  const rb = recoveryBalances.find((b) => b.employee_id === employeeId);
  const canEdit = user.permissions.conges.can_edit;
  const isAdmin = user.role === "admin";

  return (
    <div>
      <ModuleHeader
        title={t("Congé / Récupération — {name}", { name: employeeName(employee) })}
        subtitle={t("NB {nb} · {matricule} · date d'entrée {date}", { nb: employee.order_number, matricule: employee.matricule, date: employee.hire_date ? formatDateFr(employee.hire_date) : t("non renseignée") })}
        backHref="/conges?section=solde-conges"
      >
        <Suspense>
          <DateField value={asOf} label="Date de référence" />
        </Suspense>
      </ModuleHeader>

      {!employee.hire_date &&
        (employee.in_service_before_start ? (
          <p className="mb-4 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            {t("Date de début non renseignée : employé déjà en poste au début du projet, ses congés sont décomptés depuis la date de début du projet.")}
          </p>
        ) : (
          <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {t("Date de début non renseignée : aucun congé n'est calculé. Renseignez la date réelle dans la fiche employé, ou cochez « Déjà en poste au début du projet ».")}
          </p>
        ))}

      <h2 className="mb-2 text-lg font-semibold">{t("Congés")}</h2>
      <p className="mb-2 text-sm text-muted-foreground">
        {t("Solde congé : 1,5 jour par mois complet de service depuis la date d'entrée en service. Solde pris : congés pris avant le système + congés approuvés déjà pris dans l'application. Solde restant = Solde congé − Solde pris. Calcul au {date}.", { date: formatDateFr(asOf) })}
        {lb && lb.hire_date && <span className="mt-1 block font-medium text-foreground tabular-nums">{t("Calcul : {conge} − {pris} = {restant} j", { conge: fmtDays(leaveDashboard(lb).conge), pris: fmtDays(leaveDashboard(lb).pris), restant: fmtDays(leaveDashboard(lb).restant) })}</span>}
      </p>
      <Stats
        t={t}
        items={[
          ["Congés pris avant le système", lb?.taken_before ?? 0],
          ["Mois complets de service", lb?.months ?? 0],
          ["Congés acquis", lb?.accrued ?? 0],
          ["Congés pris", lb?.taken ?? 0],
          ["Corrections", lb?.adjustments ?? 0],
          ["Solde restant", lb?.balance ?? 0],
          ["Acceptés à venir", lb?.planned ?? 0],
        ]}
      />
      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("Détail des acquisitions")}</CardTitle>
            <CardDescription>{t("Un crédit à chaque mois anniversaire de la date d'entrée.")}</CardDescription>
          </CardHeader>
          <CardContent className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Mois")}</TableHead>
                  <TableHead>{t("Date du crédit")}</TableHead>
                  <TableHead className="text-end">{t("Jours")}</TableHead>
                  <TableHead className="text-end">{t("Cumul")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveDetail.schedule.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      {t("Aucun mois complet de service à cette date.")}
                    </TableCell>
                  </TableRow>
                )}
                {leaveDetail.schedule.map((s) => (
                  <TableRow key={s.month_index}>
                    <TableCell>{s.month_index}</TableCell>
                    <TableCell>{formatDateFr(s.credit_date)}</TableCell>
                    <TableCell className="text-end">+{s.days}</TableCell>
                    <TableCell className="text-end">{s.cumulative}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <DaysCard t={t} title={t("Jours de congé pris")} days={leaveDetail.taken} />
        <AdjustmentsCard t={t} title={t("Corrections du solde de congés")} adjustments={leaveDetail.adjustments} form={isAdmin ? <AdjustmentForm employeeId={employeeId} kind="conge" /> : null} />
      </div>
      <h3 className="mb-2 font-semibold">{t("Demandes de congé")}</h3>
      <LeaveRequestsTable requests={leaveRequests} canEdit={canEdit} showEmployee={false} />

      <h2 className="mb-2 mt-10 text-lg font-semibold">{t("Récupération")}</h2>
      <Stats
        t={t}
        items={[
          ["Repos travaillés validés", rb?.credits_total ?? 0],
          ["Récupération acquise", rb?.credits_total ?? 0],
          ["Récupération prise", rb?.taken_total ?? 0],
          ["Corrections", rb?.adjustments ?? 0],
          ["Solde restant", rb?.balance ?? 0],
          ["En attente", rb?.pending ?? 0],
        ]}
      />
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("Crédits de récupération")}</CardTitle>
            <CardDescription>{t("Un crédit par jour de repos travaillé pointé.")}</CardDescription>
          </CardHeader>
          <CardContent className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Jour travaillé")}</TableHead>
                  <TableHead>{t("Utilisation")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recoveryDetail.credits.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      {t("Aucun crédit.")}
                    </TableCell>
                  </TableRow>
                )}
                {recoveryDetail.credits.map((c) => (
                  <TableRow key={c.worked_rest_date}>
                    <TableCell className="text-sm">{creditLabel({ date: c.worked_rest_date, kind: c.kind, label: c.holiday_label, expires_on: c.expires_on }, t, c.state === "disponible")}</TableCell>
                    <TableCell className={c.state === "a_payer" ? "text-xs font-medium text-orange-700" : "text-xs"}>{t(CREDIT_STATE_LABELS[c.state])}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <DaysCard t={t} title={t("Jours de récupération pris")} days={recoveryDetail.taken} />
        <AdjustmentsCard t={t} title={t("Corrections du solde de récupération")} adjustments={recoveryDetail.adjustments} form={isAdmin ? <AdjustmentForm employeeId={employeeId} kind="recuperation" /> : null} />
      </div>
      <h3 className="mb-2 font-semibold">{t("Demandes de récupération")}</h3>
      <RecoveryRequestsTable requests={recoveryRequests} canEdit={canEdit} showEmployee={false} />

      <ModuleButtons pdfSlot={<PdfExportButton kind="conges-employe" params={{ employee: employeeId, date: asOf }} />} historyHref="/conges/historique" />
    </div>
  );
}

function Stats({ t, items }: { t: TFunction; items: [string, number][] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([label, value]) => (
        <Card key={label}>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">{t(label)}</div>
            <div className="text-2xl font-semibold">{value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DaysCard({ t, title, days }: { t: TFunction; title: string; days: { day: string; source: "pointage" | "demande" }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{t("Source : pointage, ou demande acceptée pour un jour passé non pointé.")}</CardDescription>
      </CardHeader>
      <CardContent className="max-h-80 overflow-y-auto">
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Aucun jour pris.")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {days.map((d) => (
              <li key={d.day} className="flex justify-between">
                <span>{formatDateFr(d.day)}</span>
                <span className="text-xs text-muted-foreground">{d.source === "pointage" ? t("Pointage") : t("Demande acceptée")}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AdjustmentsCard({ t, title, adjustments, form }: { t: TFunction; title: string; adjustments: { id: string; days: number; reason: string; created_at: string; category?: string; created_by_name?: string }[]; form: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{t("Réservé à l'administrateur, motif obligatoire, journalisé.")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {adjustments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Aucune correction.")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {adjustments.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.days > 0 ? `+${a.days}` : a.days}</span>
                {a.category === "solde_initial" && <span className="ms-1 rounded bg-sky-100 px-1.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">{t("Solde initial")}</span>} — {a.reason}
                <div className="text-xs text-muted-foreground">
                  {formatDateTimeFr(a.created_at)}
                  {a.created_by_name ? ` · ${a.created_by_name}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
        {form && <div className="border-t pt-3">{form}</div>}
      </CardContent>
    </Card>
  );
}
