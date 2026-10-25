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
import { getEmployees, getTrucks } from "@/lib/data/employees";
import { getRecordAuditInfo } from "@/lib/data/audit-info";
import { DRIVER_POSITIONS } from "@/lib/types";
import { AuditLine } from "@/components/audit-line";

export const generateMetadata = pageTitle("Rapport de collecte");

export default async function CollectionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("rapport_journalier"), getI18n()]);
  const { id } = await params;
  const report = await getCollectionReport(id);
  if (!report) notFound();
  const [workDay, trucks, collecte, audit] = await Promise.all([
    getWorkDay(report.activity_date),
    getTrucks(true),
    getEmployees({ onlyActive: true }),
    getRecordAuditInfo("collection_reports", [report.id]),
  ]);
  const info = audit.get(report.id);
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

      <CollectionForm
        report={report}
        canEdit={canEdit}
        trucks={trucks}
        drivers={collecte.filter((e) => DRIVER_POSITIONS.includes(e.position))}
        crewOptions={collecte.filter((e) => ["rippeur", "rippeur_remplacant"].includes(e.position))}
      />
      {info && <AuditLine info={info} t={t} />}

      <ModuleButtons pdfSlot={<PdfExportButton kind="rapport-collecte" params={{ date: report.activity_date, id: report.id }} />} historyHref="/rapport-journalier/collecte/historique" />
    </div>
  );
}
