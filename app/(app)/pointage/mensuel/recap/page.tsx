import { ClipboardList } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getPeriodStartDay } from "@/lib/data/attendance-grid";
import { attendancePeriod, periodMonthOf } from "@/lib/attendance-grid";
import { formatDateFr, formatMonthFr, isMonth, todayISO } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { MonthlyTabs } from "../tabs";

export const generateMetadata = pageTitle("Récap");

/** Section « Récap » : contenu à définir par l'entreprise (aucun calcul inventé). */
export default async function RecapPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const [, { t, locale }] = await Promise.all([requireModule("pointage"), getI18n()]);
  const sp = await searchParams;
  const startDay = await getPeriodStartDay();
  const month = isMonth(sp.mois) ? sp.mois : periodMonthOf(todayISO(), startDay);
  const { from, to } = attendancePeriod(month, startDay);
  const monthName = formatMonthFr(month, locale).replace(/^./, (c) => c.toUpperCase());
  return (
    <div>
      <ModuleHeader title={t("Récap")} subtitle={t("{month} — du {from} au {to}", { month: monthName, from: formatDateFr(from), to: formatDateFr(to) })} backHref="/pointage" />
      <MonthlyTabs active="recap" month={month} t={t} />
      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <ClipboardList className="mx-auto mb-3 size-8 text-muted-foreground" />
        <p className="font-medium">{t("Section en préparation")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("Le contenu du récapitulatif sera défini avec vous. Aucune donnée n'est calculée ici pour le moment.")}</p>
      </div>
      <ModuleButtons historyHref="/pointage/historique" />
    </div>
  );
}
