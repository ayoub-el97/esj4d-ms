import { requireModule } from "@/lib/auth";
import { getEmployees, getTrucks } from "@/lib/data/employees";
import { DRIVER_POSITIONS } from "@/lib/types";
import { isISODate, todayISO } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { FuelForm } from "../fuel-form";

export const generateMetadata = pageTitle("Nouveau plein");

export default async function NouveauPleinPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [, t] = await Promise.all([requireModule("rapport_camions", "edit"), getT()]);
  const sp = await searchParams;
  const [trucks, collecte] = await Promise.all([getTrucks(true), getEmployees({ team: "collecte", onlyActive: true })]);
  return (
    <div className="max-w-2xl">
      <ModuleHeader title={t("Nouveau plein")} backHref="/rapport-camions/carburant" />
      <FuelForm entry={null} defaultDate={isISODate(sp.date) ? sp.date : todayISO()} trucks={trucks} drivers={collecte.filter((e) => DRIVER_POSITIONS.includes(e.position))} canEdit />
    </div>
  );
}
