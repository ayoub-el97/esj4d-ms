import { Suspense } from "react";
import { Brush, ClipboardList, History, Truck } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { formatDateLongFr, isISODate, todayISO } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { ActionTile, TileGrid } from "@/components/action-tile";
import { DateField } from "@/components/date-field";
import { DayStatusBadge } from "@/components/day-status-badge";

export const generateMetadata = pageTitle("Rapport journalier");

export default async function RapportJournalierPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [, { t, locale }] = await Promise.all([requireModule("rapport_journalier"), getI18n()]);
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const workDay = await getWorkDay(date);

  return (
    <div>
      <ModuleHeader title={t("Rapport journalier")} subtitle={formatDateLongFr(date, locale)}>
        <Suspense>
          <DateField value={date} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>
      <TileGrid>
        <ActionTile href={`/rapport-journalier/nettoiement?date=${date}`} label={t("Rapport journalier — Nettoiement")} description={t("Lieux de travail, photos avant / après par agent")} icon={<Brush />} />
        <ActionTile href={`/rapport-journalier/collecte?date=${date}`} label={t("Rapport journalier — Collecte")} description={t("Camion, équipe, secteurs, tonnages, photos")} icon={<Truck />} />
        <ActionTile href={`/rapport-journalier/global?date=${date}`} label={t("Rapport journalier global")} description={t("Récapitulatif camions et nettoiement")} icon={<ClipboardList />} />
        <ActionTile href={`/rapport-journalier/historique?date=${date}`} label={t("Historique des rapports journaliers")} description={t("Ouvrir et corriger les rapports d'une date passée, PDF, Excel")} icon={<History />} />
      </TileGrid>
      <ModuleButtons historyHref={`/rapport-journalier/historique?date=${date}`} monthlyHref="/rapport-mensuel" />
    </div>
  );
}
