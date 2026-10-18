import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getWorkDay } from "@/lib/data/attendance";
import { getEmployees, getTrucks } from "@/lib/data/employees";
import { SHIFT_LABELS, type TruckDailyReport } from "@/lib/data/reports";
import { getPhotosFor } from "@/lib/data/photos";
import { formatDateLongFr } from "@/lib/dates";
import { DRIVER_POSITIONS } from "@/lib/types";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { DayStatusBadge } from "@/components/day-status-badge";
import { TruckReportForm } from "../truck-report-form";

export const generateMetadata = pageTitle("Ligne camion");

export default async function CamionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("rapport_camions"), getI18n()]);
  const { id } = await params;
  const supabase = await createClient();
  const { data: report } = await supabase.from("truck_daily_reports").select("*").eq("id", id).maybeSingle<TruckDailyReport>();
  if (!report) notFound();
  const [workDay, trucks, collecte, photos] = await Promise.all([getWorkDay(report.activity_date), getTrucks(), getEmployees({ team: "collecte" }), getPhotosFor("truck_report", [report.id])]);
  const canEdit = user.permissions.rapport_camions.can_edit && workDay?.status !== "closed";

  return (
    <div>
      <ModuleHeader
        title={t("Ligne camion — {shift}", { shift: t(SHIFT_LABELS[report.shift] ?? "Matin") })}
        subtitle={formatDateLongFr(report.activity_date, locale)}
        backHref={`/rapport-camions?date=${report.activity_date}`}
      >
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>
      <TruckReportForm report={{ ...report, loads: report.loads ?? [] }} photos={photos.get(report.id) ?? []} isAdmin={user.role === "admin"} defaultDate={report.activity_date} trucks={trucks} chauffeurs={collecte.filter((e) => DRIVER_POSITIONS.includes(e.position))} canEdit={canEdit} />
    </div>
  );
}
