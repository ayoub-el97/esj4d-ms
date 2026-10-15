import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { getWarnings, WARNING_STATUS_LABELS } from "@/lib/data/warnings";
import { formatDateFr, formatMonthFr, monthRange, todayISO } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Avertissements" };

type SP = { employee?: string; from?: string; to?: string; status?: string; mois?: string };

export default async function AvertissementsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireModule("avertissements");
  const sp = await searchParams;
  const range = /^\d{4}-\d{2}$/.test(sp.mois ?? "") ? monthRange(sp.mois!) : { from: sp.from, to: sp.to };
  const filters = { employee: sp.employee, status: sp.status, from: range.from, to: range.to };
  const [warnings, employees] = await Promise.all([getWarnings(filters), getEmployees()]);
  const canEdit = user.permissions.avertissements.can_edit;

  const counts = new Map<string, { name: string; count: number }>();
  for (const w of warnings) {
    const c = counts.get(w.employee_id) ?? { name: w.name, count: 0 };
    c.count++;
    counts.set(w.employee_id, c);
  }
  const pdfParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) if (v) pdfParams[k] = v;

  return (
    <div>
      <ModuleHeader title="Avertissements" subtitle={sp.mois ? formatMonthFr(sp.mois) : `Date : ${formatDateFr(todayISO())}`}>
        {canEdit && (
          <LinkButton href="/avertissements/nouveau" variant="destructive">
            <Plus /> Nouvelle demande
          </LinkButton>
        )}
      </ModuleHeader>

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
          <Label htmlFor="from">Du</Label>
          <Input id="from" name="from" type="date" defaultValue={range.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Au</Label>
          <Input id="to" name="to" type="date" defaultValue={range.to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">Statut</Label>
          <NativeSelect id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">Tous</option>
            {Object.entries(WARNING_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">
            <Search /> Rechercher
          </Button>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date incident</TableHead>
                <TableHead>Employé</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Photos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warnings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Aucun avertissement.
                  </TableCell>
                </TableRow>
              )}
              {warnings.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <Link href={`/avertissements/${w.id}`} className="font-medium hover:underline">
                      {formatDateFr(w.incident_date)}
                    </Link>
                  </TableCell>
                  <TableCell>{w.name}</TableCell>
                  <TableCell className="max-w-72 truncate">{w.description}</TableCell>
                  <TableCell>
                    <Badge variant={w.status === "clos" ? "secondary" : "destructive"}>{WARNING_STATUS_LABELS[w.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{w.photos.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Nombre par employé</CardTitle>
          </CardHeader>
          <CardContent>
            {counts.size === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {Array.from(counts.entries())
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([id, c]) => (
                    <li key={id} className="flex justify-between">
                      <Link href={`/avertissements?employee=${id}`} className="hover:underline">
                        {c.name}
                      </Link>
                      <Badge variant="outline">{c.count}</Badge>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <ModuleButtons pdfSlot={<PdfExportButton kind="avertissements" params={pdfParams} />} historyHref="/avertissements" monthlyHref={`/avertissements?mois=${todayISO().slice(0, 7)}`} />
    </div>
  );
}
