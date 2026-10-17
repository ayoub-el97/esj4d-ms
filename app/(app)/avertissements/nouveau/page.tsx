import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { todayISO } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { WarningForm } from "../warning-form";

export const generateMetadata = pageTitle("Nouvel avertissement");

export default async function NouvelAvertissementPage() {
  const [, t, employees] = await Promise.all([requireModule("avertissements", "edit"), getT(), getEmployees({ onlyActive: true })]);
  return (
    <div>
      <ModuleHeader title={t("Nouvel avertissement")} backHref="/avertissements" />
      <WarningForm warning={null} employees={employees.map((e) => ({ id: e.id, label: employeeName(e) }))} canEdit defaultDate={todayISO()} />
    </div>
  );
}
