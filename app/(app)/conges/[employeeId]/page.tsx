import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { employeeName, getEmployee } from "@/lib/data/employees";
import { getLeaveAdjustments, getLeaveBalances, getLeaveRequests } from "@/lib/data/leaves";
import { formatDateFr, formatDateTimeFr, todayISO } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdjustmentForm, LeaveRequestForm, RequestActions, StatusBadge } from "../leaves-ui";

export const metadata = { title: "Congés de l'employé" };

export default async function EmployeeLeavesPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const user = await requireModule("conges");
  const { employeeId } = await params;
  const today = todayISO();
  const [employee, requests, balances, adjustments] = await Promise.all([
    getEmployee(employeeId),
    getLeaveRequests({ employee: employeeId }),
    getLeaveBalances(today),
    getLeaveAdjustments(employeeId),
  ]);
  if (!employee) notFound();
  const balance = balances.find((b) => b.employee_id === employeeId);
  const canEdit = user.permissions.conges.can_edit;

  return (
    <div>
      <ModuleHeader title={`Congés — ${employeeName(employee)}`} subtitle={`NB ${employee.order_number} · embauche ${employee.hire_date ? formatDateFr(employee.hire_date) : "non renseignée"}`} backHref="/conges" />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Congés acquis", balance?.accrued ?? 0],
          ["Congés pris", balance?.taken ?? 0],
          ["Ajustements", balance?.adjustments ?? 0],
          ["Solde restant", balance?.balance ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dates des congés</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Du</TableHead>
                    <TableHead>Au</TableHead>
                    <TableHead className="text-right">Jours</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Motif</TableHead>
                    {canEdit && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Aucune demande.
                      </TableCell>
                    </TableRow>
                  )}
                  {requests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDateFr(r.start_date)}</TableCell>
                      <TableCell>{formatDateFr(r.end_date)}</TableCell>
                      <TableCell className="text-right">{r.days}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="max-w-48 truncate">{r.reason}</TableCell>
                      {canEdit && (
                        <TableCell>
                          <RequestActions request={r} canEdit />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ajustements du solde</CardTitle>
              <CardDescription>Chaque ajustement est daté, motivé et journalisé.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Jours</TableHead>
                    <TableHead>Motif</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Aucun ajustement.
                      </TableCell>
                    </TableRow>
                  )}
                  {adjustments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{formatDateTimeFr(a.created_at)}</TableCell>
                      <TableCell className="text-right">{a.days > 0 ? `+${a.days}` : a.days}</TableCell>
                      <TableCell>{a.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {user.role === "admin" && (
                <div className="mt-4 border-t pt-4">
                  <AdjustmentForm employeeId={employeeId} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {canEdit && <LeaveRequestForm employees={[{ id: employee.id, label: employeeName(employee) }]} defaultEmployee={employee.id} />}
      </div>

      <ModuleButtons pdfSlot={<PdfExportButton kind="conges-historique" params={{ employee: employeeId }} />} historyHref="/conges/historique" />
    </div>
  );
}
