import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { getCollectionReport } from "@/lib/data/reports";
import { formatDateLongFr } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { CollectionForm } from "./collection-form";

export const generateMetadata = pageTitle("Rapport de collecte");

export default async function CollectionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("rapport_journalier"), getI18n()]);
  const { id } = await params;
  const report = await getCollectionReport(id);
  if (!report) notFound();
  const workDay = await getWorkDay(report.activity_date);
  const canEdit = user.permissions.rapport_journalier.can_edit && workDay?.status !== "closed";

  return (
    <div>
      <ModuleHeader
        title={t("Rapport de collecte — camion {matricule}", { matricule: report.truck?.matricule ?? "" })}
        subtitle={formatDateLongFr(report.activity_date, locale)}
        backHref={`/rapport-journalier/collecte?date=${report.activity_date}`}
      >
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>

      <CollectionForm report={report} canEdit={canEdit} />

      <ModuleButtons pdfSlot={<PdfExportButton kind="rapport-collecte" params={{ date: report.activity_date, id: report.id }} />} historyHref="/rapport-journalier/collecte/historique" />
    </div>
  );
}
