import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { getCombinedReport } from "@/lib/data/combined-report";
import { formatDateLongFr } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { WORK_LOCATIONS_TITLE } from "@/lib/modules";
import { CombinedReportView } from "@/components/combined-report";
import { DayStatusBadge } from "@/components/day-status-badge";
import { ModuleHeader } from "@/components/module-header";
import { PdfExportButton } from "@/components/pdf-export-button";
import { PrintButton } from "@/components/print-button";
import { WorkLocationsEditor } from "./work-locations-editor";

/** Rapport d'une date, commun à la page principale et à l'historique. */
export async function WorkLocationsDay({ user, date, nav, actions }: { user: Awaited<ReturnType<typeof getCurrentUser>>; date: string; nav?: ReactNode; actions: ReactNode }) {
  const [{ t, locale }, data, workDay] = await Promise.all([getI18n(), getCombinedReport(date), getWorkDay(date)]);
  const hasData = data.cleaning !== null || data.trucks !== null;
  const allowed = user.permissions.rapport_journalier.can_edit;
  const closed = workDay?.status === "closed";

  return (
    <div>
      <div className="no-print">
        <ModuleHeader title={WORK_LOCATIONS_TITLE} subtitle={formatDateLongFr(date, locale)}>
          {nav}
          <DayStatusBadge workDay={workDay} />
        </ModuleHeader>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {actions}
          {hasData && (
            <span className="ms-auto flex flex-wrap gap-2">
              <PdfExportButton kind="lieux-de-travail" params={{ date }} label="Exporter PDF" />
              <PrintButton />
            </span>
          )}
        </div>
        {allowed && closed && <p className="mb-3 text-xs text-muted-foreground">{t("Journée clôturée : rouvrez-la pour modifier ce rapport.")}</p>}
      </div>
      <WorkLocationsEditor key={date} date={date} data={data} canEdit={allowed && !closed}>
        <CombinedReportView t={t} data={data} />
      </WorkLocationsEditor>
      <style>{"@media print { @page { size: A4 portrait; margin: 12mm; } }"}</style>
    </div>
  );
}
