import { requireModule } from "@/lib/auth";
import { getTrucks } from "@/lib/data/employees";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { TrucksUI } from "./trucks-ui";

export const metadata = { title: "Camions" };

export default async function CamionsPage() {
  const user = await requireModule("employes");
  const trucks = await getTrucks();
  return (
    <div>
      <ModuleHeader title="Camions" subtitle={`${trucks.length} véhicule(s)`} backHref="/employes" />
      <TrucksUI trucks={trucks} canEdit={user.permissions.employes.can_edit} />
      <ModuleButtons />
    </div>
  );
}
