import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getWorkDay } from "@/lib/data/attendance";
import { employeeName, getEmployees, getTrucks } from "@/lib/data/employees";
import { SHIFT_LABELS, type TruckDailyReport } from "@/lib/data/reports";
import { getPhotosFor } from "@/lib/data/photos";
import { getChangeSummary, getRecordChanges } from "@/lib/data/history";
import { formatDateLongFr } from "@/lib/dates";
import { DRIVER_POSITIONS } from "@/lib/types";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DayStatusBadge } from "@/components/day-status-badge";
import { PdfExportButton } from "@/components/pdf-export-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { ChangeLog, type ChangeField } from "@/components/change-log";
import { LastChange } from "@/components/last-change";
import { TruckReportForm } from "../truck-report-form";

export const generateMetadata = pageTitle("Ligne camion");

export default async function CamionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("rapport_camions"), getI18n()]);
  const { id } = await params;
  const supabase = await createClient();
  const { data: report } = await supabase.from("truck_daily_reports").select("*").eq("id", id).maybeSingle<TruckDailyReport>();
  if (!report) notFound();
  const [workDay, trucks, employees, photos, changes, summary] = await Promise.all([
    getWorkDay(report.activity_date),
    getTrucks(),
    getEmployees(),
    getPhotosFor("truck_report", [report.id]),
    getRecordChanges("truck_daily_reports", { ids: [report.id] }),
    getChangeSummary("truck_daily_reports", [report.id]),
  ]);
  const canEdit = user.permissions.rapport_camions.can_edit && workDay?.status !== "closed";
  // Chauffeurs proposés : chauffeurs actuels de la Collecte, plus le chauffeur enregistré sur cette
  // ligne (même s'il a changé d'équipe ou de fonction depuis) pour ne jamais l'effacer
  const chauffeurs = employees.filter((e) => (e.team_type === "collecte" && DRIVER_POSITIONS.includes(e.position)) || e.id === report.chauffeur_id);
  const empName = new Map(employees.map((e) => [e.id, employeeName(e)]));
  const plate = new Map(trucks.map((x) => [x.id, x.matricule]));
  const num = (v: unknown) => (v == null || v === "" ? "—" : String(Number(v)));
  const fields: ChangeField[] = [
    { key: "truck_id", label: "Camion", format: (v) => plate.get(String(v)) ?? "—" },
    { key: "shift", label: "Poste", format: (v) => t(SHIFT_LABELS[v as "matin" | "soir"] ?? String(v ?? "—")) },
    { key: "chauffeur_id", label: "Chauffeur", format: (v) => (v ? (empName.get(String(v)) ?? "—") : "—") },
    { key: "loads", label: "Vidages (ticket — tonnage)", format: (v) => (Array.isArray(v) && v.length ? v.map((l: { ticket?: string; tonnage?: number | null }, i) => `${i + 1}. ${l.ticket || "—"} — ${l.tonnage ?? "—"} t`).join(" ; ") : "—") },
    { key: "tonnage_total", label: "Tonnage total", format: num },
    { key: "dumps_count", label: "Nombre de vidages", format: num },
    { key: "rippers_count", label: "Rippeurs", format: num },
    { key: "km_start", label: "Km départ", format: num },
    { key: "km_end", label: "Km fin", format: num },
    { key: "fuel", label: "Carburant", format: num },
    { key: "observations", label: "Observations" },
  ];
  const s = summary.get(report.id);

  return (
    <div>
      <ModuleHeader
        title={t("Ligne camion — {shift}", { shift: t(SHIFT_LABELS[report.shift] ?? "Matin") })}
        subtitle={formatDateLongFr(report.activity_date, locale)}
        backHref={`/rapport-camions/historique?date=${report.activity_date}`}
      >
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>
      {s && <LastChange t={t} at={s.last_at} user={s.last_user} modified={s.modified} className="mb-3" />}
      <TruckReportForm report={{ ...report, loads: report.loads ?? [] }} photos={photos.get(report.id) ?? []} isAdmin={user.role === "admin"} defaultDate={report.activity_date} trucks={trucks} chauffeurs={chauffeurs} canEdit={canEdit} />
      <ChangeLog t={t} entries={changes} fields={fields} />
      <ModuleButtons
        pdfSlot={
          <>
            <PdfExportButton kind="camions" params={{ date: report.activity_date, truck: report.truck_id }} label="PDF de ce rapport" />
            <ExcelExportButton kind="camions" params={{ date: report.activity_date, truck: report.truck_id }} />
          </>
        }
        historyHref="/rapport-camions/historique"
        monthlyHref="/rapport-camions/mensuel"
      />
    </div>
  );
}
