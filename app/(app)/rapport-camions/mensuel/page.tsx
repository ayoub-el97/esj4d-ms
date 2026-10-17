import { Suspense } from "react";
import { requireModule } from "@/lib/auth";
import { getTruckMonthly } from "@/lib/data/reports";
import { currentMonth, formatMonthFr, isMonth } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const generateMetadata = pageTitle("Rapport mensuel camions");

export default async function CamionsMensuelPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const [, { t, locale }] = await Promise.all([requireModule("rapport_camions"), getI18n()]);
  const sp = await searchParams;
  const month = isMonth(sp.mois) ? sp.mois : currentMonth();
  const rows = await getTruckMonthly(month);
  const total = rows.reduce((a, r) => ({ days: a.days + r.days, tonnage: a.tonnage + r.tonnage, dumps: a.dumps + r.dumps, km: a.km + r.km, fuel: a.fuel + r.fuel }), { days: 0, tonnage: 0, dumps: 0, km: 0, fuel: 0 });

  return (
    <div>
      <ModuleHeader title={t("Rapport mensuel camions")} subtitle={formatMonthFr(month, locale)} backHref="/rapport-camions">
        <Suspense>
          <DateField value={month} param="mois" type="month" label="Mois" />
        </Suspense>
      </ModuleHeader>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Matricule")}</TableHead>
              <TableHead>{t("Marque")}</TableHead>
              <TableHead className="text-end">{t("Jours")}</TableHead>
              <TableHead className="text-end">{t("Tickets")}</TableHead>
              <TableHead className="text-end">{t("Tonnage total (t)")}</TableHead>
              <TableHead className="text-end">{t("Vidages")}</TableHead>
              <TableHead className="text-end">{t("Km")}</TableHead>
              <TableHead className="text-end">{t("Carburant (L)")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {t("Aucune donnée pour ce mois.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.truck?.id ?? r.truck?.matricule}>
                <TableCell className="font-mono">{r.truck?.matricule}</TableCell>
                <TableCell>{r.truck?.brand}</TableCell>
                <TableCell className="text-end">{r.days}</TableCell>
                <TableCell className="text-end">{r.tickets}</TableCell>
                <TableCell className="text-end">{r.tonnage.toFixed(2)}</TableCell>
                <TableCell className="text-end">{r.dumps}</TableCell>
                <TableCell className="text-end">{r.km.toFixed(1)}</TableCell>
                <TableCell className="text-end">{r.fuel.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {rows.length > 0 && (
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={2}>{t("Total")}</TableCell>
                <TableCell className="text-end">{total.days}</TableCell>
                <TableCell />
                <TableCell className="text-end">{total.tonnage.toFixed(2)}</TableCell>
                <TableCell className="text-end">{total.dumps}</TableCell>
                <TableCell className="text-end">{total.km.toFixed(1)}</TableCell>
                <TableCell className="text-end">{total.fuel.toFixed(2)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <ModuleButtons pdfSlot={<PdfExportButton kind="camions-mensuel" params={{ mois: month }} />} historyHref="/rapport-camions" />
    </div>
  );
}
