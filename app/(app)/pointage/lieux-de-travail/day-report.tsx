import type { ReactNode } from "react";
import { History } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { getCombinedReport } from "@/lib/data/combined-report";
import { formatDateLongFr } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { CombinedReportView } from "@/components/combined-report";
import { DayStatusBadge } from "@/components/day-status-badge";
import { LinkButton } from "@/components/link-button";
import { ModuleHeader } from "@/components/module-header";
import { PdfExportButton } from "@/components/pdf-export-button";
import { PrintButton } from "@/components/print-button";
import { WorkLocationsEditor } from "./work-locations-editor";

type User = Awaited<ReturnType<typeof getCurrentUser>>;

/** Boutons et rapport d'une date, communs à la page Pointage et à l'historique. */
async function WorkLocationsBody({ user, date, actions, printable, heading }: { user: User; date: string; actions: ReactNode; printable: boolean; heading: boolean }) {
  const [{ t }, data, workDay] = await Promise.all([getI18n(), getCombinedReport(date), getWorkDay(date)]);
  const hasData = data.cleaning !== null || data.trucks !== null;
  const allowed = user.permissions.rapport_journalier.can_edit;
  const closed = workDay?.status === "closed";

  return (
    <>
      <div className="no-print">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {actions}
          {hasData && (
            <span className="ms-auto flex flex-wrap gap-2">
              <PdfExportButton kind="lieux-de-travail" params={{ date }} label="Exporter PDF" />
              {printable && <PrintButton />}
            </span>
          )}
        </div>
        {allowed && closed && <p className="mb-3 text-xs text-muted-foreground">{t("Journée clôturée : rouvrez-la pour modifier ce rapport.")}</p>}
      </div>
      <WorkLocationsEditor key={date} date={date} data={data} canEdit={allowed && !closed}>
        <CombinedReportView t={t} data={data} heading={heading} />
      </WorkLocationsEditor>
    </>
  );
}

/** Section de la page Pointage, pour la date affichée. L'impression se fait depuis la page de la date, sans le reste du Pointage. */
export async function WorkLocationsSection({ user, date }: { user: User; date: string }) {
  const { t, locale } = await getI18n();
  return (
    <section id="lieux-de-travail" className="mt-8 scroll-mt-20">
      <h2 className="text-lg font-semibold">{t("Lieux de travail des agents")}</h2>
      <p className="mb-3 text-sm text-muted-foreground first-letter:uppercase">{formatDateLongFr(date, locale)}</p>
      <WorkLocationsBody
        user={user}
        date={date}
        printable={false}
        heading={false}
        actions={
          <LinkButton href="/pointage/lieux-de-travail/historique" variant="outline">
            <History /> {t("Historique")}
          </LinkButton>
        }
      />
    </section>
  );
}

/** Page d'une date de l'historique. */
export async function WorkLocationsDay({ user, date, actions }: { user: User; date: string; actions: ReactNode }) {
  const [{ t, locale }, workDay] = await Promise.all([getI18n(), getWorkDay(date)]);
  return (
    <div>
      <div className="no-print">
        <ModuleHeader title={t("Lieux de travail des agents")} subtitle={formatDateLongFr(date, locale)}>
          <DayStatusBadge workDay={workDay} />
        </ModuleHeader>
      </div>
      <WorkLocationsBody user={user} date={date} actions={actions} printable heading />
      <style>{"@media print { @page { size: A4 portrait; margin: 12mm; } }"}</style>
    </div>
  );
}
