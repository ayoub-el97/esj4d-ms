import { requireModule } from "@/lib/auth";
import { getEmployees, getTrucks } from "@/lib/data/employees";
import { isISODate, todayISO } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { TruckReportForm } from "../truck-report-form";

export const metadata = { title: "Nouvelle ligne camion" };

export default async function NouveauCamionPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireModule("rapport_camions", "edit");
  const sp = await searchParams;
  const [trucks, collecte] = await Promise.all([getTrucks(true), getEmployees({ team: "collecte", onlyActive: true })]);
  return (
    <div>
      <ModuleHeader title="Nouvelle ligne camion" backHref="/rapport-camions" />
      <TruckReportForm report={null} defaultDate={isISODate(sp.date) ? sp.date : todayISO()} trucks={trucks} chauffeurs={collecte.filter((e) => e.position === "chauffeur")} canEdit />
    </div>
  );
}
