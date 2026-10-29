import { requireModule } from "@/lib/auth";
import { employeeName, getEmployees, getTrucks } from "@/lib/data/employees";
import { DRIVER_POSITIONS } from "@/lib/types";
import { isISODate, todayISO } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { TruckReportForm } from "../truck-report-form";

export const generateMetadata = pageTitle("Nouvelle ligne camion");

export default async function NouveauCamionPage({ searchParams }: { searchParams: Promise<{ date?: string; camion?: string; poste?: string }> }) {
  const [user, t] = await Promise.all([requireModule("rapport_camions", "edit"), getT()]);
  const sp = await searchParams;
  const [trucks, active] = await Promise.all([getTrucks(true), getEmployees({ onlyActive: true })]);
  const collecte = active.filter((e) => e.team_type === "collecte");
  // Nouvelle ligne (Matin ou Soir) : aucune équipe reprise de l'autre poste, choix dans la base des employés
  const crewOptions = active.map((e) => ({ id: e.id, name: employeeName(e), position: e.position, team_type: e.team_type }));
  return (
    <div>
      <ModuleHeader title={t("Nouvelle ligne camion")} backHref="/rapport-camions" />
      <TruckReportForm
        report={null}
        isAdmin={user.role === "admin"}
        defaultTruck={sp.camion}
        defaultShift={sp.poste === "soir" ? "soir" : "matin"}
        defaultDate={isISODate(sp.date) ? sp.date : todayISO()} trucks={trucks} chauffeurs={collecte.filter((e) => DRIVER_POSITIONS.includes(e.position))} canEdit crewOptions={crewOptions} />
    </div>
  );
}
