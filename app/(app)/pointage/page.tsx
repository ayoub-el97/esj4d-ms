import { Suspense } from "react";
import { getEmployees } from "@/lib/data/employees";
import { WorkLocationsSection } from "./lieux-de-travail/day-report";
import { categoryOf } from "@/lib/sheet-order";
import { Brush, Truck, UserPlus, UserX, History } from "lucide-react";
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
  const [workDay, counts, active] = await Promise.all([getWorkDay(date), getSheetCounts(date), getEmployees({ onlyActive: true })]);
  const byCat = { collecte: 0, balayeurs: 0, autres: 0 };
  for (const e of active) byCat[categoryOf(e.position)]++;
  const status = (n: number) => (n ? t("{count} ligne(s) pointée(s)", { count: n }) : t("Non pointée"));

  return (
    <div>
      <ModuleHeader title={t("Pointage")} subtitle={formatDateLongFr(date, locale)}>
        <Suspense>
          <DateField value={date} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <span className="rounded-lg border bg-card px-3 py-1.5 font-semibold">{t("Employés actifs : {count}", { count: active.length })}</span>
        <span className="rounded-lg border bg-card px-3 py-1.5">{t("Collecte : {count}", { count: byCat.collecte })}</span>
        <span className="rounded-lg border bg-card px-3 py-1.5">{t("Balayeurs : {count}", { count: byCat.balayeurs })}</span>
        <span className="rounded-lg border bg-card px-3 py-1.5" title={t("Mécaniciens, gardiens, direction, autres fonctions")}>{t("Autres fonctions : {count}", { count: byCat.autres })}</span>
      </div>

      <TileGrid>
        <ActionTile href={`/pointage/collecte?date=${date}`} label={t("Feuille de présence des équipes de collecte")} description={status(counts.collecte)} icon={<Truck />} />
        <ActionTile href={`/pointage/nettoiement?date=${date}`} label={t("Feuille de présence des équipes de nettoiement")} description={status(counts.nettoiement)} icon={<Brush />} />
        {user.permissions.employes.can_edit && <ActionTile href="/employes/nouveau" label={t("Nouvel équipier")} description={t("Ajouter un employé")} icon={<UserPlus />} className="border-dashed" />}
        <ActionTile href="/pointage/historique" label={t("Historique du pointage")} description={t("Toutes les journées passées : recherche, modification, PDF")} icon={<History />} />
        <ActionTile href="/pointage/absences" label={t("Rapport des absents")} description={t("Absences par employé, certificats médicaux, alertes")} icon={<UserX />} />
      </TileGrid>

      {user.permissions.rapport_journalier.can_view && <WorkLocationsSection user={user} date={date} />}

      <ModuleButtons
        pdfSlot={
          <PdfExportButton
            kind="pointage"
            params={{ date, equipe: "collecte" }}
            choices={[
              { label: "Feuille collecte", params: { date, equipe: "collecte" } },
              { label: "Feuille nettoiement", params: { date, equipe: "nettoiement" } },
            ]}
          />
        }
        historyHref="/pointage/historique"
        monthlyHref="/pointage/mensuel"
      />
    </div>
  );
}
