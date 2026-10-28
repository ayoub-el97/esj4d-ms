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
  const [{ report, agents }, employees, eligible] = await Promise.all([getCleaningReport(date), getEmployees({ onlyActive: true }), getReportEligibility(date)]);

  return (
    <div>
      <ModuleHeader title={t("Rapport journalier — Nettoiement")} subtitle={formatDateLongFr(date, locale)} backHref={`/rapport-journalier?date=${date}`}>
        <Suspense>
          <DateField value={date} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>

      <CleaningReportUI
        key={date}
        date={date}
        report={report}
        agents={agents}
        canEdit={canEdit}
        employeeOptions={employees.filter((e) => eligible.nettoiement.has(e.id)).map((e) => ({ id: e.id, label: `${employeeName(e)} (${t(TEAM_LABELS[e.team_type])})` }))}
      />

      <ModuleButtons pdfSlot={report ? <PdfExportButton kind="rapport-nettoiement" params={{ date }} /> : undefined} historyHref="/rapport-journalier/nettoiement/historique" />
    </div>
  );
}
