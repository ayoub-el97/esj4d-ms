import { requireModule } from "@/lib/auth";
import { getEmployees, getTrucks } from "@/lib/data/employees";
import { ModuleHeader } from "@/components/module-header";
import { EmployeeForm } from "../employee-form";

export const metadata = { title: "Nouvel équipier" };

export default async function NouvelEquipierPage() {
  await requireModule("employes", "edit");
  const [trucks, collecte] = await Promise.all([getTrucks(true), getEmployees({ team: "collecte", onlyActive: true })]);
  return (
    <div>
      <ModuleHeader title="Nouvel équipier" backHref="/employes" />
      <EmployeeForm employee={null} trucks={trucks} chauffeurs={collecte.filter((e) => e.position === "chauffeur")} />
    </div>
  );
}
