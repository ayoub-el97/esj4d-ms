import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getEmployee, getEmployees, getRestDayHistory, getTrucks } from "@/lib/data/employees";
import { formatDateTimeFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { WEEKDAY_LABELS } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmployeeForm } from "../employee-form";
import { LeaveSummary } from "../leave-summary";
import { getLeaveBalances } from "@/lib/data/leaves";
import { todayISO } from "@/lib/dates";

export const generateMetadata = pageTitle("Fiche employé");

const RETURN_TARGETS = ["/employes", "/profil?onglet=employes"];

export default async function EmployePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ retour?: string }> }) {
  const [user, t] = await Promise.all([requireModule("employes", "edit"), getT()]);
  const { id } = await params;
  const { retour } = await searchParams;
  const returnTo = retour && RETURN_TARGETS.includes(retour) ? retour : "/employes";
  const [employee, trucks, collecte, restHistory] = await Promise.all([getEmployee(id), getTrucks(true), getEmployees({ team: "collecte", onlyActive: true }), getRestDayHistory(id)]);
  if (!employee) notFound();
  // Congés payés : visibles si l'utilisateur peut consulter le module Congé / Récupération
  const balance = user.permissions.conges.can_view ? ((await getLeaveBalances(todayISO(), { includeInactive: true }).catch(() => [])).find((b) => b.employee_id === id) ?? null) : null;
  const day = (d: number | null) => (d == null ? t("— Non défini —") : t(WEEKDAY_LABELS[d]));

  return (
    <div className="space-y-6">
      <ModuleHeader title={t("Fiche employé")} subtitle={t("NB {nb} · {matricule}", { nb: employee.order_number, matricule: employee.matricule })} backHref={returnTo} />
      {user.permissions.conges.can_view && <LeaveSummary t={t} employeeId={employee.id} hireDate={employee.hire_date} balance={balance} />}
      <EmployeeForm employee={employee} trucks={trucks} collecte={collecte} returnTo={returnTo} canEditLeave={user.role === "admin"} initialBalance={balance?.initial_balance ?? 0} />

      <Card>
        <CardHeader>
          <CardTitle>{t("Historique du jour de repos")}</CardTitle>
          <CardDescription>{t("Chaque changement du jour de repos habituel est conservé avec l'utilisateur et la date.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date de modification")}</TableHead>
                <TableHead>{t("Ancien jour")}</TableHead>
                <TableHead>{t("Nouveau jour")}</TableHead>
                <TableHead>{t("Modifié par")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {restHistory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t("Aucun changement enregistré.")}
                  </TableCell>
                </TableRow>
              )}
              {restHistory.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{formatDateTimeFr(h.changed_at)}</TableCell>
                  <TableCell>{h.old_rest_day == null && h.new_rest_day != null && restHistory[restHistory.length - 1]?.id === h.id ? t("(création)") : day(h.old_rest_day)}</TableCell>
                  <TableCell className="font-medium">{day(h.new_rest_day)}</TableCell>
                  <TableCell dir="ltr">{h.changed_by_email ?? t("système")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
