import { Plus, Truck } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployeeRows } from "@/lib/data/employees";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { LinkButton } from "@/components/link-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmployeesTable } from "./employees-table";

export const generateMetadata = pageTitle("Employés");

export default async function EmployesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; equipe?: string; poste?: string; statut?: string; q?: string }>;
}) {
  const [user, t] = await Promise.all([requireModule("employes"), getT()]);
  const sp = await searchParams;
  const { rows, total, active } = await getEmployeeRows(sp);

  return (
    <div>
      <ModuleHeader title={t("Employés")} subtitle={t("{active} actifs · {total} au total", { active, total })}>
        {user.permissions.employes.can_edit && (
          <LinkButton href="/employes/nouveau">
            <Plus /> {t("Nouvel équipier")}
          </LinkButton>
        )}
        <LinkButton href="/employes/camions" variant="outline">
          <Truck /> {t("Camions")}
        </LinkButton>
      </ModuleHeader>

      {sp.ok && (
        <Alert className="mb-4">
          <AlertDescription>{sp.ok === "cree" ? t("Employé créé.") : t("Employé modifié.")}</AlertDescription>
        </Alert>
      )}

      <EmployeesTable rows={rows} canEdit={user.permissions.employes.can_edit} filters={sp} />
      <ModuleButtons />
    </div>
  );
}
