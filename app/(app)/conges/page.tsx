import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { getLeaveBalances, getLeaveRequests } from "@/lib/data/leaves";
import { formatDateFr, todayISO } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LeaveRequestForm, PendingRequests } from "./leaves-ui";

export const metadata = { title: "Congés" };

export default async function CongesPage() {
  const user = await requireModule("conges");
  const today = todayISO();
  const [employees, pending, balances] = await Promise.all([getEmployees({ onlyActive: true }), getLeaveRequests({ status: "en_attente" }), getLeaveBalances(today)]);
  const canEdit = user.permissions.conges.can_edit;
  const activeBalances = balances.filter((b) => b.is_active);

  return (
    <div>
      <ModuleHeader title="Congés" subtitle={`Soldes au ${formatDateFr(today)}`} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <PendingRequests requests={pending} canEdit={canEdit} />

          <Card>
            <CardHeader>
              <CardTitle>Soldes de congés</CardTitle>
              <CardDescription>Acquis = mois d&apos;ancienneté × taux (Paramètres › Réglages). Pris = demandes acceptées. Cliquez sur un nom pour l&apos;historique.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NB</TableHead>
                    <TableHead>Nom et prénom</TableHead>
                    <TableHead className="text-right">Mois</TableHead>
                    <TableHead className="text-right">Acquis</TableHead>
                    <TableHead className="text-right">Pris</TableHead>
                    <TableHead className="text-right">Ajustements</TableHead>
                    <TableHead className="text-right">Solde</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeBalances.map((b) => (
                    <TableRow key={b.employee_id}>
                      <TableCell>{b.order_number}</TableCell>
                      <TableCell>
                        <Link href={`/conges/${b.employee_id}`} className="font-medium hover:underline">
                          {b.name}
                        </Link>
                        {!b.hire_date && <span className="ml-2 text-xs text-muted-foreground">(date d&apos;embauche manquante)</span>}
                      </TableCell>
                      <TableCell className="text-right">{b.months}</TableCell>
                      <TableCell className="text-right">{b.accrued}</TableCell>
                      <TableCell className="text-right">{b.taken}</TableCell>
                      <TableCell className="text-right">{b.adjustments || ""}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={b.balance < 0 ? "destructive" : "secondary"}>{b.balance}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {canEdit && <LeaveRequestForm employees={employees.map((e) => ({ id: e.id, label: employeeName(e) }))} />}
      </div>

      <ModuleButtons pdfSlot={<PdfExportButton kind="conges-soldes" params={{ date: today }} />} historyHref="/conges/historique" monthlyHref={`/conges/historique?mois=${today.slice(0, 7)}`} />
    </div>
  );
}
