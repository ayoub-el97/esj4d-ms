import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { getEmployees } from "@/lib/data/employees";
import { getCollectionReport } from "@/lib/data/reports";
import { formatDateLongFr } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { CollectionForm } from "./collection-form";

export const metadata = { title: "Rapport de collecte" };

export default async function CollectionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("rapport_journalier");
  const { id } = await params;
  const report = await getCollectionReport(id);
  if (!report) notFound();
  const [workDay, collecte] = await Promise.all([getWorkDay(report.activity_date), getEmployees({ team: "collecte", onlyActive: true })]);
  const canEdit = user.permissions.rapport_journalier.can_edit && workDay?.status !== "closed";

  return (
    <div>
      <ModuleHeader
        title={`Rapport de collecte — camion ${report.truck?.matricule ?? ""}`}
        subtitle={formatDateLongFr(report.activity_date)}
        backHref={`/rapport-journalier/collecte?date=${report.activity_date}`}
      >
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>

      <CollectionForm report={report} employees={collecte} canEdit={canEdit} />

      <ModuleButtons
        pdfSlot={<PdfExportButton kind="rapport-collecte" params={{ date: report.activity_date, id: report.id }} />}
        historyHref="/rapport-journalier/collecte/historique"
      />
    </div>
  );
}
