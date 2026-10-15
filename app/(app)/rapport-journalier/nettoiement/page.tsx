import { Suspense } from "react";
import { requireModule } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { getCleaningReport } from "@/lib/data/reports";
import { formatDateLongFr, isISODate, todayISO } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { CleaningReportUI } from "./cleaning-report-ui";

export const metadata = { title: "Rapport journalier — Nettoiement" };

export default async function NettoiementPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireModule("rapport_journalier");
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const [workDay, { report, agents }, employees] = await Promise.all([getWorkDay(date), getCleaningReport(date), getEmployees({ onlyActive: true })]);
  const canEdit = user.permissions.rapport_journalier.can_edit && workDay?.status !== "closed";

  return (
    <div>
      <ModuleHeader title="Rapport journalier — Nettoiement" subtitle={formatDateLongFr(date)} backHref={`/rapport-journalier?date=${date}`}>
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
        employeeOptions={employees.map((e) => ({ id: e.id, label: `${employeeName(e)} (${e.team_type})` }))}
      />

      <ModuleButtons
        pdfSlot={report ? <PdfExportButton kind="rapport-nettoiement" params={{ date }} /> : undefined}
        historyHref="/rapport-journalier/nettoiement/historique"
      />
    </div>
  );
}
