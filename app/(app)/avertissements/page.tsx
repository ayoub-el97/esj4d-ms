import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { getWarnings } from "@/lib/data/warnings";
import { WARNING_STATUS_LABELS } from "@/lib/module-types";
import { formatDateFr, formatWorkMonth, isMonth, todayISO, workMonthRange } from "@/lib/dates";
import { getProjectStart } from "@/lib/data/settings";
import { getI18n, pageTitle } from "@/lib/i18n/server";
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
import { PhotoGallery } from "@/components/photo-gallery";

export const generateMetadata = pageTitle("Avertissements");

type SP = { employee?: string; from?: string; to?: string; status?: string; mois?: string };

export default async function AvertissementsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("avertissements"), getI18n()]);
  const sp = await searchParams;
  const projectStart = await getProjectStart();
  const range = isMonth(sp.mois) ? workMonthRange(sp.mois, projectStart) : { from: sp.from, to: sp.to };
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
      <ModuleHeader title={t("Avertissements")} subtitle={isMonth(sp.mois) ? formatWorkMonth(sp.mois, projectStart, locale) : t("Date : {date}", { date: formatDateFr(todayISO()) })}>
        {canEdit && (
          <LinkButton href="/avertissements/nouveau" variant="destructive">
            <Plus /> {t("Nouvelle demande")}
          </LinkButton>
        )}
      </ModuleHeader>

      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="employee">{t("Employé")}</Label>
          <NativeSelect id="employee" name="employee" defaultValue={sp.employee ?? ""}>
            <option value="">{t("Tous")}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {employeeName(e)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={range.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={range.to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">{t("Statut")}</Label>
          <NativeSelect id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">{t("Tous")}</option>
            {Object.entries(WARNING_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {t(v)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">
            <Search /> {t("Rechercher")}
          </Button>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date incident")}</TableHead>
                <TableHead>{t("Employé")}</TableHead>
                <TableHead>{t("Description")}</TableHead>
                <TableHead>{t("Statut")}</TableHead>
                <TableHead>{t("Photos")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warnings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t("Aucun avertissement.")}
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
                    <Badge variant={w.status === "clos" ? "secondary" : "destructive"}>{t(WARNING_STATUS_LABELS[w.status])}</Badge>
                  </TableCell>
                  <TableCell>
                    <PhotoGallery photos={w.photos} compact />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("Nombre par employé")}</CardTitle>
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
