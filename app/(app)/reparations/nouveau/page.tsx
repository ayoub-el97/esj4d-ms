import { requireModule } from "@/lib/auth";
import { getTrucks } from "@/lib/data/employees";
import { todayISO } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { RepairForm } from "../repair-form";

export const generateMetadata = pageTitle("Nouveau problème de camion");

export default async function NouveauProblemePage({ searchParams }: { searchParams: Promise<{ camion?: string }> }) {
  const [, t] = await Promise.all([requireModule("rapport_camions", "edit"), getT()]);
  const { camion } = await searchParams;
  const trucks = await getTrucks();
  // Camions actifs d'abord ; un camion inactif reste sélectionnable pour compléter son historique
  const sorted = [...trucks].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.matricule.localeCompare(b.matricule));
  return (
    <div className="mx-auto max-w-3xl">
      <ModuleHeader title={t("Nouveau problème de camion")} subtitle={t("Photos : prenez-les directement avec le téléphone ou importez-les ; elles sont envoyées à l'enregistrement.")} backHref="/reparations" />
      <RepairForm repair={null} trucks={sorted} defaultTruck={sorted.some((tr) => tr.id === camion) ? camion : undefined} defaultDate={todayISO()} canEdit />
    </div>
  );
}
