import { Suspense } from "react";
import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { getTrucks, employeeName } from "@/lib/data/employees";
import { getCollectionReports } from "@/lib/data/reports";
import { formatDateLongFr, isISODate, todayISO } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewCollectionReport } from "./new-collection-report";

export const metadata = { title: "Rapport journalier — Collecte" };

export default async function CollectePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireModule("rapport_journalier");
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const [workDay, reports, trucks] = await Promise.all([getWorkDay(date), getCollectionReports({ date }), getTrucks(true)]);
  const canEdit = user.permissions.rapport_journalier.can_edit && workDay?.status !== "closed";
  const usedTrucks = new Set(reports.map((r) => r.truck_id));

  return (
    <div>
      <ModuleHeader title="Rapport journalier — Collecte" subtitle={formatDateLongFr(date)} backHref={`/rapport-journalier?date=${date}`}>
        <Suspense>
          <DateField value={date} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
        {canEdit && <NewCollectionReport date={date} trucks={trucks.filter((t) => !usedTrucks.has(t.id))} />}
      </ModuleHeader>

      {reports.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aucun rapport de collecte pour cette date. Choisissez un camion pour en créer un.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((r) => (
            <Link key={r.id} href={`/rapport-journalier/collecte/${r.id}`} className="block transition hover:shadow-md">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="font-mono">{r.truck?.matricule ?? "?"}</span>
                    <span className="text-sm font-normal text-muted-foreground">{r.truck?.brand}</span>
                    <Badge variant="secondary" className="ml-auto">
                      {r.photosAvant.length + r.photosApres.length} photo(s)
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">Chauffeur : </span>
                    {r.chauffeur ? employeeName(r.chauffeur) : "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rippeurs : </span>
                    {r.rippers.length ? r.rippers.map(employeeName).join(", ") : "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Secteurs : </span>
                    {r.sectors || "—"}
                  </div>
                  {r.truckReport && (
                    <div className="text-muted-foreground">
                      Tonnage : {Number(r.truckReport.tonnage1 ?? 0) + Number(r.truckReport.tonnage2 ?? 0)} t · Vidages : {r.truckReport.dumps_count}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <ModuleButtons
        pdfSlot={reports.length ? <PdfExportButton kind="rapport-collecte" params={{ date }} /> : undefined}
        historyHref="/rapport-journalier/collecte/historique"
      />
    </div>
  );
}
