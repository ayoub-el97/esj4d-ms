import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { buildSheet, getWorkDay } from "@/lib/data/attendance";
import { getSettings } from "@/lib/data/settings";
import { isISODate, todayISO, formatDateLongFr } from "@/lib/dates";
import { TEAM_LABELS, TEAM_SLUGS } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SheetForm } from "./sheet-form";

export default async function SheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ equipe: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireModule("pointage");
  const { equipe } = await params;
  const team = TEAM_SLUGS[equipe];
  if (!team) notFound();

  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const [workDay, sheet, settings] = await Promise.all([getWorkDay(date), buildSheet(date, team), getSettings()]);
  const closed = workDay?.status === "closed";
  const canEdit = user.permissions.pointage.can_edit && !closed;

  return (
    <div>
      <ModuleHeader title={`Feuille de présence — ${TEAM_LABELS[team]}`} subtitle={formatDateLongFr(date)} backHref={`/pointage?date=${date}`}>
        <Suspense>
          <DateField value={date} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>

      {closed && (
        <Alert className="mb-4">
          <AlertDescription>Journée clôturée : la feuille est en consultation seule. Un administrateur peut la rouvrir depuis le module Clôturer la journée.</AlertDescription>
        </Alert>
      )}
      {sheet.holidayLabel && (
        <Alert className="mb-4">
          <AlertDescription>Jour férié : {sheet.holidayLabel}. Le statut « Jour férié » est proposé par défaut.</AlertDescription>
        </Alert>
      )}

      <SheetForm
        key={`${team}-${date}`}
        date={date}
        team={team}
        initialRows={sheet.rows}
        initialTeamLead={sheet.teamLead}
        options={sheet.options}
        canEdit={canEdit}
        agency={settings.agency_name}
        company={settings.company_name}
      />

      <ModuleButtons
        pdfSlot={<PdfExportButton kind="pointage" params={{ date, equipe: team }} />}
        historyHref={`/pointage/historique?team=${team}`}
        monthlyHref={`/pointage/mensuel?equipe=${team}`}
      />
    </div>
  );
}
