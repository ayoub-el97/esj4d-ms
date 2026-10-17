import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { buildSheet, getWorkDay } from "@/lib/data/attendance";
import { getSettings, getTeamLeads, logoUrl } from "@/lib/data/settings";
import { isISODate, todayISO, formatDateLongFr } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { TEAM_LABELS, TEAM_SLUGS } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LinkButton } from "@/components/link-button";
import { CalendarClock } from "lucide-react";
import { SheetForm } from "./sheet-form";

export const generateMetadata = pageTitle("Feuille de présence");

export default async function SheetPage({ params, searchParams }: { params: Promise<{ equipe: string }>; searchParams: Promise<{ date?: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("pointage"), getI18n()]);
  const { equipe } = await params;
  const team = TEAM_SLUGS[equipe];
  if (!team) notFound();

  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const [workDay, sheet, settings, leads] = await Promise.all([getWorkDay(date), buildSheet(date, team), getSettings(), getTeamLeads(true)]);
  const closed = workDay?.status === "closed";
  const canEdit = user.permissions.pointage.can_edit && !closed;

  return (
    <div>
      <ModuleHeader title={t("Feuille de présence — {team}", { team: t(TEAM_LABELS[team]) })} subtitle={formatDateLongFr(date, locale)} backHref={`/pointage?date=${date}`}>
        <Suspense>
          <DateField value={date} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
        <LinkButton href="/pointage/repos" variant="outline" size="sm" className="ms-auto">
          <CalendarClock /> {t("Jours de repos et remplaçants")}
        </LinkButton>
      </ModuleHeader>

      {closed && (
        <Alert className="mb-4">
          <AlertDescription>{t("Journée clôturée : la feuille est en consultation seule. Un administrateur peut la rouvrir depuis le module Clôturer la journée.")}</AlertDescription>
        </Alert>
      )}
      {sheet.holidayLabel && (
        <Alert className="mb-4">
          <AlertDescription>{t("Jour férié : {label}. Le statut « Jour férié » est proposé par défaut.", { label: sheet.holidayLabel })}</AlertDescription>
        </Alert>
      )}

      <SheetForm
        key={`${team}-${date}`}
        date={date}
        team={team}
        initialRows={sheet.rows}
        initialTeamLead={sheet.teamLead || Array.from(new Set(sheet.rows.filter((r) => r.position === "chef_equipe").map((r) => r.name))).join(", ")}
        teamLeadOptions={leads.filter((l) => !l.team_type || l.team_type === team).map((l) => l.full_name)}
        options={sheet.options}
        canEdit={canEdit}
        agency={settings.agency_name}
        company={settings.company_name}
        logo={logoUrl(settings.company_logo_path)}
        trucks={sheet.trucks}
      />

      <ModuleButtons
        pdfSlot={<PdfExportButton kind="pointage" params={{ date, equipe: team }} />}
        historyHref={`/pointage/historique?team=${team}`}
        monthlyHref={`/pointage/mensuel?equipe=${team}`}
      />
    </div>
  );
}
