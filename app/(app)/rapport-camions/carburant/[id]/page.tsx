import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getWorkDay } from "@/lib/data/attendance";
import { getEmployees, getTrucks } from "@/lib/data/employees";
import { getFuelEntry } from "@/lib/data/fuel";
import { formatDateLongFr } from "@/lib/dates";
import { DRIVER_POSITIONS } from "@/lib/types";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { PhotoUploader } from "@/components/photo-uploader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FuelForm } from "../fuel-form";

export const generateMetadata = pageTitle("Plein de carburant");

export default async function PleinPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("rapport_camions"), getI18n()]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const entry = await getFuelEntry(id);
  if (!entry) notFound();
  const [workDay, trucks, collecte] = await Promise.all([getWorkDay(entry.activity_date), getTrucks(), getEmployees({ team: "collecte" })]);
  const canEdit = user.permissions.rapport_camions.can_edit && workDay?.status !== "closed";

  return (
    <div>
      <ModuleHeader title={t("Plein de carburant")} subtitle={`${entry.truck?.matricule ?? ""} — ${formatDateLongFr(entry.activity_date, locale)}`} backHref="/rapport-camions/carburant">
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>
      {sp.ok && (
        <Alert className="mb-4">
          <AlertDescription>{t("Plein enregistré. Vous pouvez ajouter ou retirer des photos ci-dessous.")}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_1fr]">
        <FuelForm entry={entry} defaultDate={entry.activity_date} trucks={trucks} drivers={collecte.filter((e) => DRIVER_POSITIONS.includes(e.position))} canEdit={canEdit} />
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("Consommation")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">{t("Km parcourus depuis le plein précédent")}</p>
                <p className="text-lg font-semibold">{entry.distance_km == null ? t("1er plein (référence)") : `${entry.distance_km.toFixed(0)} km`}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("Consommation")}</p>
                <p className="text-lg font-semibold">{entry.l_per_100km == null ? "—" : `${entry.l_per_100km.toFixed(2)} L/100 km`}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("Prix au litre")}</p>
                <p className="text-lg font-semibold">{entry.price_per_liter == null ? "—" : entry.price_per_liter.toFixed(3)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Photos (ticket, compteur, pompe)")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PhotoUploader
                entityType="fuel_entry"
                entityId={entry.id}
                phase="justificatif"
                activityDate={entry.activity_date}
                employeeId={entry.driver_id}
                location={entry.station}
                photos={entry.photos}
                canEdit={canEdit}
                title="Photos du plein"
              />
            </CardContent>
          </Card>
        </div>
      </div>
      <ModuleButtons pdfSlot={<PdfExportButton kind="carburant" params={{ id: entry.id }} />} historyHref="/rapport-camions/carburant" />
    </div>
  );
}
