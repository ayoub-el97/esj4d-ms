import { Suspense } from "react";
import { requireModule } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { getCleaningReport, getReportEligibility } from "@/lib/data/reports";
import { syncCleaningReport } from "@/lib/report-sync";
import { createClient } from "@/lib/supabase/server";
import { formatDateLongFr, isISODate, todayISO } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { TEAM_LABELS } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { CleaningReportUI } from "./cleaning-report-ui";
import { DayNav } from "@/components/day-nav";
import { ExcelExportButton } from "@/components/excel-export-button";
import { ChangeLog, type ChangeField } from "@/components/change-log";
import { LastChange } from "@/components/last-change";
import { getDailyReportsSummary, getRecordChanges } from "@/lib/data/history";

export const generateMetadata = pageTitle("Rapport journalier — Nettoiement");

export default async function NettoiementPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("rapport_journalier"), getI18n()]);
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const workDay = await getWorkDay(date);
  const canEdit = user.permissions.rapport_journalier.can_edit && workDay?.status !== "closed";
  // Journée ouverte : le rapport est remis à jour d'après le pointage (lieux, commentaires et photos conservés)
  if (canEdit) {
    try {
      await syncCleaningReport(await createClient(), date);
    } catch {
      // affichage du rapport tel qu'enregistré
    }
  }
  const [{ report, agents }, employees, eligible, allEmployees, [daySummary]] = await Promise.all([getCleaningReport(date), getEmployees({ onlyActive: true }), getReportEligibility(date), getEmployees(), getDailyReportsSummary(date, date)]);
  const [reportChanges, agentChanges] = report ? await Promise.all([getRecordChanges("cleaning_reports", { ids: [report.id] }), getRecordChanges("cleaning_report_agents", { ids: [report.id] })]) : [[], []];
  const names = new Map(allEmployees.map((e) => [e.id, employeeName(e)]));
  const fields: ChangeField[] = [
    { key: "location", label: "Lieu de travail" },
    { key: "comment", label: "Commentaire" },
    { key: "observations", label: "Observations" },
    { key: "excluded", label: "Retiré du rapport", format: (v) => (v ? t("Oui") : t("Non")) },
  ];
  const changes = [...reportChanges, ...agentChanges].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div>
      <ModuleHeader title={t("Rapport journalier — Nettoiement")} subtitle={formatDateLongFr(date, locale)} backHref={`/rapport-journalier?date=${date}`}>
        <Suspense>
          <DateField value={date} />
          <DayNav value={date} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>

      {daySummary && report && <LastChange t={t} at={daySummary.last_at} user={daySummary.last_user} modified={changes.some((c) => c.action !== "INSERT")} className="mb-3" />}
      <CleaningReportUI
        key={date}
        date={date}
        report={report}
        agents={agents}
        canEdit={canEdit}
        employeeOptions={employees.filter((e) => eligible.nettoiement.has(e.id)).map((e) => ({ id: e.id, label: `${employeeName(e)} (${t(TEAM_LABELS[e.team_type])})` }))}
      />

      <ChangeLog
        t={t}
        entries={changes}
        fields={fields}
        describe={(e) => {
          const id = (e.new_data?.employee_id ?? e.old_data?.employee_id) as string | undefined;
          return id ? (names.get(id) ?? "—") : t("Rapport du jour");
        }}
        actionText={(e) => (e.new_data?.employee_id ?? e.old_data?.employee_id ? (e.action === "INSERT" ? t("Agent ajouté au rapport") : t("Agent retiré du rapport")) : undefined)}
      />

      <ModuleButtons
        pdfSlot={
          report ? (
            <>
              <PdfExportButton kind="rapport-nettoiement" params={{ date }} />
              <ExcelExportButton kind="rapport-nettoiement" params={{ date }} />
            </>
          ) : undefined
        }
        historyHref={`/rapport-journalier/historique?date=${date}`}
      />
    </div>
  );
}
