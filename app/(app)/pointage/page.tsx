import { Suspense } from "react";
import { Brush, CalendarClock, Truck, UserPlus } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getSheetCounts, getWorkDay } from "@/lib/data/attendance";
import { isISODate, todayISO, formatDateLongFr } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { ActionTile, TileGrid } from "@/components/action-tile";
import { DateField } from "@/components/date-field";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";

export const generateMetadata = pageTitle("Pointage");

export default async function PointagePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("pointage"), getI18n()]);
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const [workDay, counts] = await Promise.all([getWorkDay(date), getSheetCounts(date)]);
  const status = (n: number) => (n ? t("{count} ligne(s) pointée(s)", { count: n }) : t("Non pointée"));

  return (
    <div>
      <ModuleHeader title={t("Pointage")} subtitle={formatDateLongFr(date, locale)}>
        <Suspense>
          <DateField value={date} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>

      <TileGrid>
        <ActionTile href={`/pointage/nettoiement?date=${date}`} label={t("Feuille de présence des équipes de nettoiement")} description={status(counts.nettoiement)} icon={<Brush />} />
        <ActionTile href={`/pointage/collecte?date=${date}`} label={t("Feuille de présence des équipes de collecte")} description={status(counts.collecte)} icon={<Truck />} />
        {user.permissions.employes.can_edit && <ActionTile href="/employes/nouveau" label={t("Nouvel équipier")} description={t("Ajouter un employé")} icon={<UserPlus />} className="border-dashed" />}
        <ActionTile href="/pointage/repos" label={t("Jours de repos et remplaçants")} description={t("Modifier le jour de repos et le remplaçant de chaque employé")} icon={<CalendarClock />} />
      </TileGrid>

      <ModuleButtons
        pdfSlot={
          <PdfExportButton
            kind="pointage"
            params={{ date, equipe: "collecte" }}
            choices={[
              { label: "Feuille nettoiement", params: { date, equipe: "nettoiement" } },
              { label: "Feuille collecte", params: { date, equipe: "collecte" } },
            ]}
          />
        }
        historyHref="/pointage/historique"
        monthlyHref="/pointage/mensuel"
      />
    </div>
  );
}
