import { requireModule } from "@/lib/auth";
import { getTrucks } from "@/lib/data/employees";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { TrucksUI } from "./trucks-ui";

export const generateMetadata = pageTitle("Camions");

export default async function CamionsPage() {
  const [user, t, trucks] = await Promise.all([requireModule("employes"), getT(), getTrucks()]);
  return (
    <div>
      <ModuleHeader title={t("Camions")} subtitle={t("{count} véhicule(s)", { count: trucks.length })} backHref="/employes" />
      <TrucksUI trucks={trucks} canEdit={user.permissions.employes.can_edit} />
      <ModuleButtons />
    </div>
  );
}
