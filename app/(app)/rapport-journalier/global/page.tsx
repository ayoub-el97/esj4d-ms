import { Suspense } from "react";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { getCleaningSummary, getTruckReports } from "@/lib/data/reports";
import { formatDateLongFr, isISODate, todayISO } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { LinkButton } from "@/components/link-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CleaningSummaryUI } from "./cleaning-summary-ui";

export const metadata = { title: "Rapport journalier global" };

export default async function GlobalPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireModule("rapport_journalier");
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const [workDay, trucks, summary] = await Promise.all([getWorkDay(date), getTruckReports({ date }), getCleaningSummary(date)]);
  const canEdit = user.permissions.rapport_journalier.can_edit && workDay?.status !== "closed";
  const totalTonnage = trucks.reduce((s, t) => s + Number(t.tonnage1 ?? 0) + Number(t.tonnage2 ?? 0), 0);

  return (
    <div>
      <ModuleHeader title="Rapport journalier global" subtitle={formatDateLongFr(date)} backHref={`/rapport-journalier?date=${date}`}>
        <Suspense>
          <DateField value={date} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Collecte — tableau des camions</CardTitle>
          {canEdit && (
            <LinkButton href={`/rapport-camions/nouveau?date=${date}`} size="sm" variant="outline">
              <Plus /> Ajouter une ligne
            </LinkButton>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marque</TableHead>
                <TableHead>Matricule</TableHead>
                <TableHead>Chauffeur</TableHead>
                <TableHead>N° ticket</TableHead>
                <TableHead className="text-right">Tonnage</TableHead>
                <TableHead>2e ticket</TableHead>
                <TableHead className="text-right">2e tonnage</TableHead>
                <TableHead className="text-right">Nb vidages</TableHead>
                <TableHead className="text-right">Nb rippeurs</TableHead>
                {canEdit && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {trucks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    Aucun camion saisi pour cette date (créez un rapport de collecte ou ajoutez une ligne).
                  </TableCell>
                </TableRow>
              )}
              {trucks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.truck?.brand}</TableCell>
                  <TableCell className="font-mono">{t.truck?.matricule}</TableCell>
                  <TableCell>{t.chauffeur_name || "—"}</TableCell>
                  <TableCell>{t.ticket1}</TableCell>
                  <TableCell className="text-right">{t.tonnage1 ?? ""}</TableCell>
                  <TableCell>{t.ticket2}</TableCell>
                  <TableCell className="text-right">{t.tonnage2 ?? ""}</TableCell>
                  <TableCell className="text-right">{t.dumps_count}</TableCell>
                  <TableCell className="text-right">{t.rippers_count}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <Link href={t.report_id ? `/rapport-journalier/collecte/${t.report_id}` : `/rapport-camions/${t.id}`} aria-label="Modifier">
                        <Pencil className="size-4 text-muted-foreground" />
                      </Link>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {trucks.length > 0 && (
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={4}>Total</TableCell>
                  <TableCell className="text-right" colSpan={3}>
                    {totalTonnage.toFixed(2)} t
                  </TableCell>
                  <TableCell className="text-right">{trucks.reduce((s, t) => s + t.dumps_count, 0)}</TableCell>
                  <TableCell className="text-right">{trucks.reduce((s, t) => s + t.rippers_count, 0)}</TableCell>
                  {canEdit && <TableCell />}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CleaningSummaryUI date={date} rows={summary} canEdit={canEdit} />

      <ModuleButtons pdfSlot={<PdfExportButton kind="rapport-global" params={{ date }} />} historyHref="/rapport-camions" monthlyHref="/rapport-mensuel" />
    </div>
  );
}
