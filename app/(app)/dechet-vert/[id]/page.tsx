import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { getGreenWasteEntry } from "@/lib/data/green-waste";
import { formatDateLongFr } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { PhotoUploader } from "@/components/photo-uploader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GreenWasteForm } from "../green-waste-form";

export const metadata = { title: "Intervention déchet vert" };

export default async function GreenWasteEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("dechet_vert");
  const { id } = await params;
  const entry = await getGreenWasteEntry(id);
  if (!entry) notFound();
  const workDay = await getWorkDay(entry.activity_date);
  const canEdit = user.permissions.dechet_vert.can_edit && workDay?.status !== "closed";

  return (
    <div>
      <ModuleHeader title="Déchet vert — intervention" subtitle={formatDateLongFr(entry.activity_date)} backHref={`/dechet-vert?date=${entry.activity_date}`}>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <GreenWasteForm entry={entry} defaultDate={entry.activity_date} canEdit={canEdit} />
        <Card>
          <CardHeader>
            <CardTitle>Photos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <PhotoUploader entityType="green_waste" entityId={entry.id} phase="avant" activityDate={entry.activity_date} location={entry.location} photos={entry.photosAvant} canEdit={canEdit} />
            <PhotoUploader entityType="green_waste" entityId={entry.id} phase="apres" activityDate={entry.activity_date} location={entry.location} photos={entry.photosApres} canEdit={canEdit} />
          </CardContent>
        </Card>
      </div>
      <ModuleButtons pdfSlot={<PdfExportButton kind="dechet-vert" params={{ date: entry.activity_date, id: entry.id }} />} historyHref="/dechet-vert/historique" />
    </div>
  );
}
