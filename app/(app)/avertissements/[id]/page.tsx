import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { getWarning } from "@/lib/data/warnings";
import { formatDateFr } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { WarningForm } from "../warning-form";

export const metadata = { title: "Avertissement" };

export default async function AvertissementPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("avertissements");
  const { id } = await params;
  const [warning, employees] = await Promise.all([getWarning(id), getEmployees()]);
  if (!warning) notFound();
  return (
    <div>
      <ModuleHeader title={`Avertissement — ${warning.name}`} subtitle={`Incident du ${formatDateFr(warning.incident_date)}`} backHref="/avertissements" />
      <WarningForm warning={warning} employees={employees.map((e) => ({ id: e.id, label: employeeName(e) }))} canEdit={user.permissions.avertissements.can_edit} defaultDate={warning.incident_date} />
      <ModuleButtons pdfSlot={<PdfExportButton kind="avertissements" params={{ id: warning.id, employee: warning.employee_id }} />} historyHref={`/avertissements?employee=${warning.employee_id}`} />
    </div>
  );
}
