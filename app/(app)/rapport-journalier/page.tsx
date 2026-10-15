import { Suspense } from "react";
import { Brush, ClipboardList, Truck } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { formatDateLongFr, isISODate, todayISO } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { ActionTile, TileGrid } from "@/components/action-tile";
import { DateField } from "@/components/date-field";
import { DayStatusBadge } from "@/components/day-status-badge";

export const metadata = { title: "Rapport journalier" };

export default async function RapportJournalierPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireModule("rapport_journalier");
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const workDay = await getWorkDay(date);

  return (
    <div>
      <ModuleHeader title="Rapport journalier" subtitle={formatDateLongFr(date)}>
        <Suspense>
          <DateField value={date} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>
      <TileGrid>
        <ActionTile href={`/rapport-journalier/nettoiement?date=${date}`} label="Rapport journalier — Nettoiement" description="Lieux de travail, photos avant / après par agent" icon={<Brush />} />
        <ActionTile href={`/rapport-journalier/collecte?date=${date}`} label="Rapport journalier — Collecte" description="Camion, équipe, secteurs, tonnages, photos" icon={<Truck />} />
        <ActionTile href={`/rapport-journalier/global?date=${date}`} label="Rapport journalier global" description="Récapitulatif camions et nettoiement" icon={<ClipboardList />} />
      </TileGrid>
      <ModuleButtons monthlyHref="/rapport-mensuel" />
    </div>
  );
}
