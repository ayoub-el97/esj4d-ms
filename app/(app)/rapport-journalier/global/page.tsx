import { Suspense } from "react";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { getCleaningSummary, getTruckReports } from "@/lib/data/reports";
import { formatDateLongFr, isISODate, todayISO } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { LinkButton } from "@/components/link-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CleaningSummaryUI } from "./cleaning-summary-ui";

export const generateMetadata = pageTitle("Rapport journalier global");

export default async function GlobalPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("rapport_journalier"), getI18n()]);
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const [workDay, trucks, summary] = await Promise.all([getWorkDay(date), getTruckReports({ date }), getCleaningSummary(date)]);
  const canEdit = user.permissions.rapport_journalier.can_edit && workDay?.status !== "closed";
  const totalTonnage = trucks.reduce((s, tr) => s + Number(tr.tonnage1 ?? 0) + Number(tr.tonnage2 ?? 0), 0);

  return (
    <div>
      <ModuleHeader title={t("Rapport journalier global")} subtitle={formatDateLongFr(date, locale)} backHref={`/rapport-journalier?date=${date}`}>
        <Suspense>
          <DateField value={date} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("Collecte — tableau des camions")}</CardTitle>
          {canEdit && (
            <LinkButton href={`/rapport-camions/nouveau?date=${date}`} size="sm" variant="outline">
              <Plus /> {t("Ajouter une ligne")}
            </LinkButton>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Marque")}</TableHead>
                <TableHead>{t("Matricule")}</TableHead>
                <TableHead>{t("Chauffeur")}</TableHead>
                <TableHead>{t("N° ticket")}</TableHead>
                <TableHead className="text-end">{t("Tonnage")}</TableHead>
                <TableHead>{t("2e ticket")}</TableHead>
                <TableHead className="text-end">{t("2e tonnage")}</TableHead>
                <TableHead className="text-end">{t("Nb vidages")}</TableHead>
                <TableHead className="text-end">{t("Nb rippeurs")}</TableHead>
                {canEdit && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {trucks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    {t("Aucun camion saisi pour cette date (créez un rapport de collecte ou ajoutez une ligne).")}
                  </TableCell>
                </TableRow>
              )}
              {trucks.map((tr) => (
                <TableRow key={tr.id}>
                  <TableCell>{tr.truck?.brand}</TableCell>
                  <TableCell className="font-mono">{tr.truck?.matricule}</TableCell>
                  <TableCell>{tr.chauffeur_name || "—"}</TableCell>
                  <TableCell>{tr.ticket1}</TableCell>
                  <TableCell className="text-end">{tr.tonnage1 ?? ""}</TableCell>
                  <TableCell>{tr.ticket2}</TableCell>
                  <TableCell className="text-end">{tr.tonnage2 ?? ""}</TableCell>
                  <TableCell className="text-end">{tr.dumps_count}</TableCell>
                  <TableCell className="text-end">{tr.rippers_count}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <Link href={tr.report_id ? `/rapport-journalier/collecte/${tr.report_id}` : `/rapport-camions/${tr.id}`} aria-label={t("Modifier")}>
                        <Pencil className="size-4 text-muted-foreground" />
                      </Link>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {trucks.length > 0 && (
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={4}>{t("Total")}</TableCell>
                  <TableCell className="text-end" colSpan={3}>
                    {totalTonnage.toFixed(2)} t
                  </TableCell>
                  <TableCell className="text-end">{trucks.reduce((s, tr) => s + tr.dumps_count, 0)}</TableCell>
                  <TableCell className="text-end">{trucks.reduce((s, tr) => s + tr.rippers_count, 0)}</TableCell>
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
