import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { todayISO } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { WarningForm } from "../warning-form";

export const metadata = { title: "Nouvel avertissement" };

export default async function NouvelAvertissementPage() {
  await requireModule("avertissements", "edit");
  const employees = await getEmployees({ onlyActive: true });
  return (
    <div>
      <ModuleHeader title="Nouvel avertissement" backHref="/avertissements" />
      <WarningForm warning={null} employees={employees.map((e) => ({ id: e.id, label: employeeName(e) }))} canEdit defaultDate={todayISO()} />
    </div>
  );
}
