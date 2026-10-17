import { redirect } from "next/navigation";
import { Building2, Plus, UserCog, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getEmployeeRows, getEmployees, employeeName } from "@/lib/data/employees";
import { getSettings, getTeamLeads, logoUrl } from "@/lib/data/settings";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { LinkButton } from "@/components/link-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { EmployeesTable } from "../employes/employees-table";
import { CompanyForm } from "./company-form";
import { TeamLeadsUI } from "./team-leads-ui";

export const generateMetadata = pageTitle("Profil de l'entreprise");

type Tab = "entreprise" | "chefs" | "employes";
type SP = { onglet?: string; ok?: string; equipe?: string; poste?: string; statut?: string; q?: string };

export default async function ProfilPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, t] = await Promise.all([getCurrentUser(), getT()]);
  const canCompany = user.permissions.parametres.can_view;
  const canEmployees = user.permissions.employes.can_view;
  if (!canCompany && !canEmployees) redirect("/?error=acces_refuse");

  const sp = await searchParams;
  const requested = (["entreprise", "chefs", "employes"] as Tab[]).find((x) => x === sp.onglet);
  const tab: Tab = requested ?? (canCompany ? "entreprise" : "employes");

  const tabs: { key: Tab; label: string; icon: React.ReactNode; visible: boolean }[] = [
    { key: "entreprise", label: t("Entreprise"), icon: <Building2 />, visible: canCompany },
    { key: "chefs", label: t("Chefs d'équipe"), icon: <UserCog />, visible: canCompany },
    { key: "employes", label: t("Employés"), icon: <Users />, visible: canEmployees },
  ];

  return (
    <div>
      <ModuleHeader title={t("Profil de l'entreprise")} subtitle={t("Logo, nom, chefs d'équipe et employés")} />

      <nav className="mb-6 flex flex-wrap gap-2 border-b pb-3" aria-label={t("Sections")}>
        {tabs
          .filter((x) => x.visible)
          .map((x) => (
            <LinkButton key={x.key} href={`/profil?onglet=${x.key}`} variant={tab === x.key ? "default" : "outline"} className={cn(tab === x.key && "pointer-events-none")}>
              {x.icon} {x.label}
            </LinkButton>
          ))}
      </nav>

      {tab === "entreprise" && canCompany && <CompanyTab canEdit={user.permissions.parametres.can_edit} />}
      {tab === "chefs" && canCompany && <TeamLeadsTab canEdit={user.permissions.parametres.can_edit} />}
      {tab === "employes" && canEmployees && (
        <EmployeesTab
          canEdit={user.permissions.employes.can_edit}
          filters={sp}
          okMessage={sp.ok ? (sp.ok === "cree" ? t("Employé créé.") : t("Employé modifié.")) : undefined}
          addLabel={t("Nouvel équipier")}
        />
      )}

      <ModuleButtons />
    </div>
  );
}

async function CompanyTab({ canEdit }: { canEdit: boolean }) {
  const settings = await getSettings();
  return <CompanyForm companyName={settings.company_name} agencyName={settings.agency_name} logoUrl={logoUrl(settings.company_logo_path)} canEdit={canEdit} />;
}

async function TeamLeadsTab({ canEdit }: { canEdit: boolean }) {
  const [leads, employees] = await Promise.all([getTeamLeads(), getEmployees({ onlyActive: true })]);
  return <TeamLeadsUI leads={leads} employees={employees.map((e) => ({ id: e.id, label: employeeName(e) }))} canEdit={canEdit} />;
}

async function EmployeesTab({ canEdit, filters, okMessage, addLabel }: { canEdit: boolean; filters: SP; okMessage?: string; addLabel: string }) {
  const { rows } = await getEmployeeRows(filters);
  return (
    <div className="space-y-3">
      {okMessage && (
        <Alert>
          <AlertDescription>{okMessage}</AlertDescription>
        </Alert>
      )}
      {canEdit && (
        <LinkButton href={`/employes/nouveau?retour=${encodeURIComponent("/profil?onglet=employes")}`}>
          <Plus /> {addLabel}
        </LinkButton>
      )}
      <EmployeesTable rows={rows} canEdit={canEdit} filters={filters} returnTo="/profil?onglet=employes" />
    </div>
  );
}
