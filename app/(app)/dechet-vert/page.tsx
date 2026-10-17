import { Suspense } from "react";
import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { getGreenWasteEntries } from "@/lib/data/green-waste";
import { formatDateLongFr, isISODate, todayISO } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GreenWasteForm } from "./green-waste-form";

export const generateMetadata = pageTitle("Déchet vert");

export default async function DechetVertPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("dechet_vert"), getI18n()]);
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const [workDay, entries] = await Promise.all([getWorkDay(date), getGreenWasteEntries({ date })]);
  const canEdit = user.permissions.dechet_vert.can_edit && workDay?.status !== "closed";

  return (
    <div>
      <ModuleHeader title={t("Déchet vert")} subtitle={formatDateLongFr(date, locale)}>
        <Suspense>
          <DateField value={date} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {entries.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("Aucune intervention déchet vert pour cette date.")}</p>}
          {entries.map((e) => (
            <Link key={e.id} href={`/dechet-vert/${e.id}`} className="block">
              <Card className="transition hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {e.location || t("Lieu non précisé")}
                    <Badge variant="secondary" className="ms-auto">
                      {t("{before} avant · {after} après", { before: e.photosAvant.length, after: e.photosApres.length })}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                {e.comment && <CardContent className="text-sm text-muted-foreground">{e.comment}</CardContent>}
              </Card>
            </Link>
          ))}
        </div>
        {canEdit && <GreenWasteForm entry={null} defaultDate={date} canEdit />}
      </div>

      <ModuleButtons pdfSlot={entries.length ? <PdfExportButton kind="dechet-vert" params={{ date }} /> : undefined} historyHref="/dechet-vert/historique" monthlyHref={`/dechet-vert/historique?mois=${date.slice(0, 7)}`} />
    </div>
  );
}
