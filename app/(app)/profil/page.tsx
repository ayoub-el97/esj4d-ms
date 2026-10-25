import { redirect } from "next/navigation";
import { Building2, ListPlus, Plus, Truck, UserCog, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getEmployeeRows, getEmployees, getTrucks, employeeName } from "@/lib/data/employees";
import { getSettings, getTeamLeads, logoUrl } from "@/lib/data/settings";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { LinkButton } from "@/components/link-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { EmployeesTable } from "../employes/employees-table";
import { TrucksUI } from "../employes/camions/trucks-ui";
import { CompanyForm } from "./company-form";
import { TeamLeadsUI } from "./team-leads-ui";

export const generateMetadata = pageTitle("Profil de l'entreprise");

type Tab = "entreprise" | "chefs" | "employes" | "vehicules";
type SP = { onglet?: string; ok?: string; equipe?: string; poste?: string; statut?: string; q?: string };

export default async function ProfilPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, t] = await Promise.all([getCurrentUser(), getT()]);
  const canCompany = user.permissions.parametres.can_view;
  const canEmployees = user.permissions.employes.can_view;
  if (!canCompany && !canEmployees) redirect("/?error=acces_refuse");

  const sp = await searchParams;
  const requested = (["entreprise", "chefs", "employes", "vehicules"] as Tab[]).find((x) => x === sp.onglet);
  const tab: Tab = requested ?? (canCompany ? "entreprise" : "employes");

  const tabs: { key: Tab; label: string; icon: React.ReactNode; visible: boolean }[] = [
    { key: "entreprise", label: t("Entreprise"), icon: <Building2 />, visible: canCompany },
    { key: "chefs", label: t("Chefs d'équipe"), icon: <UserCog />, visible: canCompany },
    { key: "employes", label: t("Employés"), icon: <Users />, visible: canEmployees },
    { key: "vehicules", label: t("Véhicules"), icon: <Truck />, visible: canEmployees },
  ];

  return (
    <div>
      <ModuleHeader title={t("Profil de l'entreprise")} subtitle={t("Logo, nom, chefs d'équipe, employés et véhicules")} />

      <nav className="-mx-4 mb-6 flex gap-2 overflow-x-auto border-b px-4 pb-3 sm:mx-0 sm:flex-wrap sm:px-0" aria-label={t("Sections")}>
        {tabs
          .filter((x) => x.visible)
          .map((x) => (
            <LinkButton key={x.key} href={`/profil?onglet=${x.key}`} variant={tab === x.key ? "default" : "outline"} className={cn("shrink-0", tab === x.key && "pointer-events-none")}>
              {x.icon} {x.label}
            </LinkButton>
          ))}
      </nav>

      {tab === "entreprise" && canCompany && <CompanyTab canEdit={user.permissions.parametres.can_edit} />}
      {tab === "chefs" && canCompany && <TeamLeadsTab canEdit={user.permissions.parametres.can_edit} />}
      {tab === "employes" && canEmployees && (
        <EmployeesTab
          canEdit={user.permissions.employes.can_edit}
          canDelete={user.role === "admin" && user.permissions.employes.can_edit}
          filters={sp}
          okMessage={sp.ok ? (sp.ok === "cree" ? t("Employé créé.") : t("Employé modifié.")) : undefined}
          addLabel={t("Nouvel équipier")}
          bulkLabel={t("Ajouter plusieurs employés")}
        />
      )}
      {tab === "vehicules" && canEmployees && <VehiclesTab canEdit={user.permissions.employes.can_edit} />}

      <ModuleButtons />
    </div>
  );
}

async function CompanyTab({ canEdit }: { canEdit: boolean }) {
  const settings = await getSettings();
  return (
    <CompanyForm
      companyName={settings.company_name}
      agencyName={settings.agency_name}
      details={{ address: settings.company_address, phone: settings.company_phone, email: settings.company_email, legal: settings.company_legal }}
      logoUrl={logoUrl(settings.company_logo_path)}
      canEdit={canEdit}
    />
  );
}

async function TeamLeadsTab({ canEdit }: { canEdit: boolean }) {
  const [leads, employees] = await Promise.all([getTeamLeads(), getEmployees({ onlyActive: true })]);
  return <TeamLeadsUI leads={leads} employees={employees.map((e) => ({ id: e.id, label: employeeName(e) }))} canEdit={canEdit} />;
}

async function VehiclesTab({ canEdit }: { canEdit: boolean }) {
  const trucks = await getTrucks();
  return <TrucksUI trucks={trucks} canEdit={canEdit} />;
}

async function EmployeesTab({ canEdit, canDelete, filters, okMessage, addLabel, bulkLabel }: { canEdit: boolean; canDelete: boolean; filters: SP; okMessage?: string; addLabel: string; bulkLabel: string }) {
  const { rows } = await getEmployeeRows(filters);
  return (
    <div className="space-y-3">
      {okMessage && (
        <Alert>
          <AlertDescription>{okMessage}</AlertDescription>
        </Alert>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/employes/nouveau?retour=${encodeURIComponent("/profil?onglet=employes")}`}>
            <Plus /> {addLabel}
          </LinkButton>
          <LinkButton href={`/employes/import?retour=${encodeURIComponent("/profil?onglet=employes")}`} variant="outline">
            <ListPlus /> {bulkLabel}
          </LinkButton>
        </div>
      )}
      <EmployeesTable rows={rows} canEdit={canEdit} canDelete={canDelete} filters={filters} returnTo="/profil?onglet=employes" />
    </div>
  );
}
