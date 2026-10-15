import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getEmployee, getEmployees, getTrucks } from "@/lib/data/employees";
import { ModuleHeader } from "@/components/module-header";
import { EmployeeForm } from "../employee-form";

export const metadata = { title: "Fiche employé" };

export default async function EmployePage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("employes", "edit");
  const { id } = await params;
  const [employee, trucks, collecte] = await Promise.all([
    getEmployee(id),
    getTrucks(true),
    getEmployees({ team: "collecte", onlyActive: true }),
  ]);
  if (!employee) notFound();

  return (
    <div>
      <ModuleHeader title="Fiche employé" subtitle={`NB ${employee.order_number} · ${employee.matricule}`} backHref="/employes" />
      <EmployeeForm
        employee={employee}
        trucks={trucks}
        chauffeurs={collecte.filter((e) => e.position === "chauffeur" && e.id !== employee.id)}
      />
    </div>
  );
}
