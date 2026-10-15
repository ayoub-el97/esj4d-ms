import { Plus, Truck } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployees, getTrucks } from "@/lib/data/employees";
import type { Position, TeamType } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { LinkButton } from "@/components/link-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmployeesTable } from "./employees-table";

export const metadata = { title: "Employés" };

export default async function EmployesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; equipe?: string; poste?: string; statut?: string; q?: string }>;
}) {
  const user = await requireModule("employes");
  const sp = await searchParams;

  const [employees, trucks] = await Promise.all([getEmployees(), getTrucks()]);
  const trucksById = new Map(trucks.map((t) => [t.id, t.matricule]));
  const namesById = new Map(employees.map((e) => [e.id, `${e.last_name} ${e.first_name}`]));

  const q = (sp.q ?? "").toLowerCase();
  const rows = employees
    .filter((e) => !sp.equipe || e.team_type === (sp.equipe as TeamType))
    .filter((e) => !sp.poste || e.position === (sp.poste as Position))
    .filter((e) => (sp.statut === "inactif" ? !e.is_active : sp.statut === "tous" ? true : e.is_active))
    .filter((e) => !q || `${e.last_name} ${e.first_name} ${e.matricule}`.toLowerCase().includes(q))
    .map((e) => ({
      ...e,
      truck_label: e.truck_id ? (trucksById.get(e.truck_id) ?? "") : "",
      chauffeur_label: e.chauffeur_id ? (namesById.get(e.chauffeur_id) ?? "") : "",
    }));

  return (
    <div>
      <ModuleHeader title="Employés" subtitle={`${employees.filter((e) => e.is_active).length} actifs · ${employees.length} au total`}>
        {user.permissions.employes.can_edit && (
          <LinkButton href="/employes/nouveau">
            <Plus /> Nouvel équipier
          </LinkButton>
        )}
        <LinkButton href="/employes/camions" variant="outline">
          <Truck /> Camions
        </LinkButton>
      </ModuleHeader>

      {sp.ok && (
        <Alert className="mb-4">
          <AlertDescription>{sp.ok === "cree" ? "Employé créé." : "Employé modifié."}</AlertDescription>
        </Alert>
      )}

      <EmployeesTable rows={rows} canEdit={user.permissions.employes.can_edit} filters={sp} />
      <ModuleButtons />
    </div>
  );
}
