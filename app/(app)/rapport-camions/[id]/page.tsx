import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getWorkDay } from "@/lib/data/attendance";
import { getEmployees, getTrucks } from "@/lib/data/employees";
import type { TruckDailyReport } from "@/lib/data/reports";
import { formatDateLongFr } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { DayStatusBadge } from "@/components/day-status-badge";
import { TruckReportForm } from "../truck-report-form";

export const metadata = { title: "Ligne camion" };

export default async function CamionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("rapport_camions");
  const { id } = await params;
  const supabase = await createClient();
  const { data: report } = await supabase.from("truck_daily_reports").select("*").eq("id", id).maybeSingle<TruckDailyReport>();
  if (!report) notFound();
  const [workDay, trucks, collecte] = await Promise.all([getWorkDay(report.activity_date), getTrucks(), getEmployees({ team: "collecte" })]);
  const canEdit = user.permissions.rapport_camions.can_edit && workDay?.status !== "closed";

  return (
    <div>
      <ModuleHeader title="Ligne camion" subtitle={formatDateLongFr(report.activity_date)} backHref="/rapport-camions">
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>
      <TruckReportForm report={report} defaultDate={report.activity_date} trucks={trucks} chauffeurs={collecte.filter((e) => e.position === "chauffeur")} canEdit={canEdit} />
    </div>
  );
}
