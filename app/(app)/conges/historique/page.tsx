import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { getLeaveRequests, LEAVE_STATUS_LABELS } from "@/lib/data/leaves";
import { formatDateFr, formatMonthFr, monthRange } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RequestActions, StatusBadge } from "../leaves-ui";

export const metadata = { title: "Historique des congés" };

type SP = { employee?: string; status?: string; from?: string; to?: string; mois?: string };

export default async function CongesHistoriquePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireModule("conges");
  const sp = await searchParams;
  const range = /^\d{4}-\d{2}$/.test(sp.mois ?? "") ? monthRange(sp.mois!) : { from: sp.from, to: sp.to };
  const filters = { employee: sp.employee, status: sp.status, from: range.from, to: range.to };
  const [requests, employees] = await Promise.all([getLeaveRequests(filters), getEmployees()]);
  const totalDays = requests.filter((r) => r.status === "acceptee").reduce((s, r) => s + r.days, 0);
  const pdfParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) if (v) pdfParams[k] = v;

  return (
    <div>
      <ModuleHeader title="Historique des congés" subtitle={sp.mois ? formatMonthFr(sp.mois) : `${requests.length} demande(s)`} backHref="/conges" />
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="employee">Employé</Label>
          <NativeSelect id="employee" name="employee" defaultValue={sp.employee ?? ""}>
            <option value="">Tous</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {employeeName(e)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">Statut</Label>
          <NativeSelect id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">Tous</option>
            {Object.entries(LEAVE_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">Du</Label>
          <Input id="from" name="from" type="date" defaultValue={range.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Au</Label>
          <Input id="to" name="to" type="date" defaultValue={range.to} />
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> Filtrer
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employé</TableHead>
              <TableHead>Du</TableHead>
              <TableHead>Au</TableHead>
              <TableHead className="text-right">Jours</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Motif</TableHead>
              <TableHead>Décision</TableHead>
              {user.permissions.conges.can_edit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Aucune demande.
                </TableCell>
              </TableRow>
            )}
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{formatDateFr(r.start_date)}</TableCell>
                <TableCell>{formatDateFr(r.end_date)}</TableCell>
                <TableCell className="text-right">{r.days}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="max-w-48 truncate">{r.reason}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.decided_at ? formatDateFr(r.decided_at.slice(0, 10)) : ""} {r.decision_note}
                </TableCell>
                {user.permissions.conges.can_edit && (
                  <TableCell>
                    <RequestActions request={r} canEdit />
                  </TableCell>
                )}
              </TableRow>
            ))}
            {requests.length > 0 && (
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={3}>Total congés acceptés</TableCell>
                <TableCell className="text-right">{totalDays}</TableCell>
                <TableCell colSpan={4} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <ModuleButtons pdfSlot={<PdfExportButton kind="conges-historique" params={pdfParams} />} />
    </div>
  );
}
