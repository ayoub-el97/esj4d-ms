import { requireModule } from "@/lib/auth";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { BulkEmployeesForm } from "./bulk-employees-form";

export const generateMetadata = pageTitle("Ajouter plusieurs employés");

const RETURN_TARGETS = ["/employes", "/profil?onglet=employes"];

export default async function ImportEmployesPage({ searchParams }: { searchParams: Promise<{ retour?: string }> }) {
  const [, t] = await Promise.all([requireModule("employes", "edit"), getT()]);
  const { retour } = await searchParams;
  const returnTo = retour && RETURN_TARGETS.includes(retour) ? retour : "/employes";
  return (
    <div>
      <ModuleHeader
        title={t("Ajouter plusieurs employés")}
        subtitle={t("Saisissez une ligne par employé, ou collez votre liste depuis Excel. Le numéro d'ordre (NB) est attribué automatiquement ; camion, équipe et remplaçant se règlent ensuite sur la fiche de l'employé.")}
        backHref={returnTo}
      />
      <BulkEmployeesForm returnTo={returnTo} />
    </div>
  );
}
