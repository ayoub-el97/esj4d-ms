import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RestDaysTable, type RestDayRow } from "./rest-days-table";

export const generateMetadata = pageTitle("Jours de repos et remplaçants");

export default async function JoursReposPage() {
  const [user, t] = await Promise.all([requireModule("pointage"), getT()]);
  const employees = await getEmployees({ onlyActive: true });
  const names = new Map(employees.map((e) => [e.id, employeeName(e)]));
  const canEdit = user.permissions.employes.can_edit;

  const rows: RestDayRow[] = employees.map((e) => {
    const crewChauffeur = e.position === "chauffeur" ? e.id : e.chauffeur_id;
    return {
      id: e.id,
      order_number: e.order_number,
      matricule: e.matricule,
      name: employeeName(e),
      position: e.position,
      team_type: e.team_type,
      crew: crewChauffeur ? (names.get(crewChauffeur) ?? "") : "",
      rest_day: e.rest_day,
      substitute_id: e.substitute_id,
    };
  });
  const substitutes = employees
    .filter((e) => e.position === "chauffeur_remplacant" || e.position === "rippeur_remplacant")
    .map((e) => ({ id: e.id, name: employeeName(e), position: e.position, rest_day: e.rest_day }));

  return (
    <div>
      <ModuleHeader title={t("Jours de repos et remplaçants")} subtitle={t("{count} employé(s) actif(s)", { count: rows.length })} backHref="/pointage" />
      {!canEdit && (
        <Alert className="mb-4">
          <AlertDescription>{t("Consultation seule : la modification demande le droit « Employés » en modification.")}</AlertDescription>
        </Alert>
      )}
      <p className="mb-3 text-sm text-muted-foreground">
        {t("Chaque modification est enregistrée immédiatement et conservée dans l'historique du jour de repos (fiche employé). Le remplaçant attitré est proposé automatiquement sur la feuille de présence les jours de repos du titulaire.")}
      </p>
      <RestDaysTable rows={rows} substitutes={substitutes} canEdit={canEdit} />
      <ModuleButtons historyHref="/pointage/historique" />
    </div>
  );
}
