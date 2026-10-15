import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getCleaningReportDates } from "@/lib/data/reports";
import { formatDateLongFr } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Historique — Rapports nettoiement" };

export default async function NettoiementHistoriquePage() {
  await requireModule("rapport_journalier");
  const dates = await getCleaningReportDates();
  return (
    <div>
      <ModuleHeader title="Historique des rapports de nettoiement" backHref="/rapport-journalier/nettoiement" />
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date d&apos;activité</TableHead>
              <TableHead className="text-right">Agents</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dates.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Aucun rapport enregistré.
                </TableCell>
              </TableRow>
            )}
            {dates.map((d) => (
              <TableRow key={d.activity_date}>
                <TableCell>
                  <Link href={`/rapport-journalier/nettoiement?date=${d.activity_date}`} className="font-medium hover:underline">
                    {formatDateLongFr(d.activity_date)}
                  </Link>
                </TableCell>
                <TableCell className="text-right">{d.agents}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ModuleButtons />
    </div>
  );
}
