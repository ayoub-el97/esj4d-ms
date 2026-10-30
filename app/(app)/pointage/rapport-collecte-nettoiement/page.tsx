import { Suspense } from "react";
import { requireModule } from "@/lib/auth";
import { getCombinedReport } from "@/lib/data/combined-report";
import { isISODate, todayISO } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { DayNav } from "@/components/day-nav";
import { PdfExportButton } from "@/components/pdf-export-button";
import { PrintButton } from "@/components/print-button";
import { CombinedReportView } from "@/components/combined-report";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const generateMetadata = pageTitle("Rapport Collecte / Nettoiement");

export default async function CombinedReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [user, t] = await Promise.all([requireModule("pointage"), getT()]);
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const allowed = user.permissions.rapport_journalier.can_view;

  return (
    <div>
      <div className="no-print">
        <ModuleHeader title={t("Rapport Collecte / Nettoiement")} backHref={`/pointage?date=${date}`}>
          <Suspense>
            <DateField value={date} />
            <DayNav value={date} />
          </Suspense>
        </ModuleHeader>
      </div>
      {allowed ? (
        <CombinedReportView t={t} data={await getCombinedReport(date)} />
      ) : (
        <Alert>
          <AlertDescription>{t("Ce rapport reprend les rapports journaliers : l'accès au module Rapport journalier est nécessaire.")}</AlertDescription>
        </Alert>
      )}
      <style>{"@media print { @page { size: A4; margin: 10mm; } }"}</style>
      <div className="no-print">
        <ModuleButtons
          pdfSlot={
            allowed ? (
              <>
                <PdfExportButton kind="rapport-collecte-nettoiement" params={{ date }} />
                <PrintButton />
              </>
            ) : undefined
          }
          historyHref={`/rapport-journalier/historique?date=${date}`}
        />
      </div>
    </div>
  );
}
