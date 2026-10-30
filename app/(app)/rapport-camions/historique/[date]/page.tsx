import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { getChangeSummary } from "@/lib/data/history";
import { getTruckReports } from "@/lib/data/reports";
import { formatDateFr, formatDateLongFr, isISODate } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { LinkButton } from "@/components/link-button";
import { TruckTabs } from "../../truck-tabs";
import { TruckDayTable } from "../../truck-day-table";

export const generateMetadata = pageTitle("Historique des rapports camions");

/**
 * Rapport camions d'une date : tous les camions de ce jour et uniquement ceux-là (Matin et Soir,
 * chacun avec son équipe). Une ligne se corrige dans son écran habituel, sur le même enregistrement.
 */
export default async function TruckDayReportPage({ params }: { params: Promise<{ date: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("rapport_camions"), getI18n()]);
  const { date } = await params;
  if (!isISODate(date)) notFound();
  const [rows, workDay] = await Promise.all([getTruckReports({ date }, 500), getWorkDay(date)]);
  const canEdit = user.permissions.rapport_camions.can_edit;
  const changes = await getChangeSummary("truck_daily_reports", rows.map((r) => r.id));
  const modified = new Set([...changes].filter(([, c]) => c.modified).map(([id]) => id));
  const trucks = new Set(rows.map((r) => r.truck_id)).size;

  return (
    <div>
      <ModuleHeader title={t("Rapport camions du {date}", { date: formatDateFr(date) })} subtitle={`${formatDateLongFr(date, locale)} — ${t("{count} camion(s)", { count: trucks })}`}>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>
      <TruckTabs active="historique" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LinkButton href="/rapport-camions/historique" variant="outline">
          <ArrowLeft className="rtl:rotate-180" /> {t("Retour à l'historique")}
        </LinkButton>
        {rows.length > 0 && (
          <span className="ms-auto flex flex-wrap gap-2">
            <PdfExportButton kind="camions" params={{ date }} label="Exporter PDF" />
            <ExcelExportButton kind="camions" params={{ date }} />
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("Aucun rapport camion pour cette date.")}</p>
      ) : (
        <TruckDayTable rows={rows} canEdit={canEdit} t={t} modified={modified} />
      )}
    </div>
  );
}
