import { Suspense } from "react";
import { Brush, Truck, UserPlus } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getSheetCounts, getWorkDay } from "@/lib/data/attendance";
import { isISODate, todayISO, formatDateLongFr } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { ActionTile, TileGrid } from "@/components/action-tile";
import { DateField } from "@/components/date-field";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";

export const metadata = { title: "Pointage" };

export default async function PointagePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireModule("pointage");
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const [workDay, counts] = await Promise.all([getWorkDay(date), getSheetCounts(date)]);

  return (
    <div>
      <ModuleHeader title="Pointage" subtitle={formatDateLongFr(date)}>
        <Suspense>
          <DateField value={date} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>

      <TileGrid>
        <ActionTile
          href={`/pointage/nettoiement?date=${date}`}
          label="Feuille de présence des équipes de nettoiement"
          description={counts.nettoiement ? `${counts.nettoiement} ligne(s) pointée(s)` : "Non pointée"}
          icon={<Brush />}
        />
        <ActionTile
          href={`/pointage/collecte?date=${date}`}
          label="Feuille de présence des équipes de collecte"
          description={counts.collecte ? `${counts.collecte} ligne(s) pointée(s)` : "Non pointée"}
          icon={<Truck />}
        />
        {user.permissions.employes.can_edit && (
          <ActionTile href="/employes/nouveau" label="Nouvel équipier" description="Ajouter un employé" icon={<UserPlus />} className="border-dashed" />
        )}
      </TileGrid>

      <ModuleButtons
        pdfSlot={
          <PdfExportButton
            kind="pointage"
            params={{ date, equipe: "collecte" }}
            label="Export PDF"
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
