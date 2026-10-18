import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getCleaningReportDates } from "@/lib/data/reports";
import { formatDateLongFr } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const generateMetadata = pageTitle("Historique des rapports de nettoiement");

export default async function NettoiementHistoriquePage() {
  const [, { t, locale }, dates] = await Promise.all([requireModule("rapport_journalier"), getI18n(), getCleaningReportDates()]);
  return (
    <div>
      <ModuleHeader title={t("Historique des rapports de nettoiement")} backHref="/rapport-journalier/nettoiement" />
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Date d'activité")}</TableHead>
              <TableHead className="text-end">{t("Agents")}</TableHead>
              <TableHead className="text-end">{t("Photos Avant")}</TableHead>
              <TableHead className="text-end">{t("Photos Après")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {dates.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("Aucun rapport enregistré.")}
                </TableCell>
              </TableRow>
            )}
            {dates.map((d) => (
              <TableRow key={d.activity_date}>
                <TableCell>
                  <Link href={`/rapport-journalier/nettoiement?date=${d.activity_date}`} className="font-medium hover:underline">
                    {formatDateLongFr(d.activity_date, locale)}
                  </Link>
                </TableCell>
                <TableCell className="text-end">{d.agents}</TableCell>
                <TableCell className="text-end">{d.photos_avant}</TableCell>
                <TableCell className={d.photos_avant > 0 && d.photos_apres === 0 ? "text-end font-medium text-orange-700" : "text-end"}>{d.photos_apres}</TableCell>
                <TableCell className="text-end">
                  <Link href={`/rapport-journalier/nettoiement?date=${d.activity_date}`} className="text-sm text-primary hover:underline">
                    {t("Voir le rapport et les photos")}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ModuleButtons />
    </div>
  );
}
