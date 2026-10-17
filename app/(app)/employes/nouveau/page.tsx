import { requireModule } from "@/lib/auth";
import { getEmployees, getTrucks } from "@/lib/data/employees";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { EmployeeForm } from "../employee-form";

export const generateMetadata = pageTitle("Nouvel équipier");

const RETURN_TARGETS = ["/employes", "/profil?onglet=employes"];

export default async function NouvelEquipierPage({ searchParams }: { searchParams: Promise<{ retour?: string }> }) {
  const [, t] = await Promise.all([requireModule("employes", "edit"), getT()]);
  const { retour } = await searchParams;
  const returnTo = retour && RETURN_TARGETS.includes(retour) ? retour : "/employes";
  const [trucks, collecte] = await Promise.all([getTrucks(true), getEmployees({ team: "collecte", onlyActive: true })]);
  return (
    <div>
      <ModuleHeader title={t("Nouvel équipier")} backHref={returnTo} />
      <EmployeeForm employee={null} trucks={trucks} collecte={collecte} returnTo={returnTo} />
    </div>
  );
}
