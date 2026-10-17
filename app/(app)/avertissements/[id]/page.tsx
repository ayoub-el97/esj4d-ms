import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { getWarning } from "@/lib/data/warnings";
import { formatDateFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { WarningForm } from "../warning-form";

export const generateMetadata = pageTitle("Avertissement");

export default async function AvertissementPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, t] = await Promise.all([requireModule("avertissements"), getT()]);
  const { id } = await params;
  const [warning, employees] = await Promise.all([getWarning(id), getEmployees()]);
  if (!warning) notFound();
  return (
    <div>
      <ModuleHeader title={t("Avertissement — {name}", { name: warning.name })} subtitle={t("Incident du {date}", { date: formatDateFr(warning.incident_date) })} backHref="/avertissements" />
      <WarningForm warning={warning} employees={employees.map((e) => ({ id: e.id, label: employeeName(e) }))} canEdit={user.permissions.avertissements.can_edit} defaultDate={warning.incident_date} />
      <ModuleButtons pdfSlot={<PdfExportButton kind="avertissements" params={{ id: warning.id, employee: warning.employee_id }} />} historyHref={`/avertissements?employee=${warning.employee_id}`} />
    </div>
  );
}
