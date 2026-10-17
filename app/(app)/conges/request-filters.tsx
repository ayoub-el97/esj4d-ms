import { Search } from "lucide-react";
import type { Employee } from "@/lib/data/employees";
import { employeeName } from "@/lib/data/employees";
import { LEAVE_STATUS_LABELS } from "@/lib/module-types";
import { getT } from "@/lib/i18n/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";

/** Filtres communs des historiques : recherche, employé, période, statut. */
export async function RequestFilters({ employees, sp }: { employees: Employee[]; sp: { q?: string; employee?: string; status?: string; from?: string; to?: string } }) {
  const t = await getT();
  return (
    <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
      <div className="space-y-1">
        <Label htmlFor="q">{t("Recherche (nom ou matricule)")}</Label>
        <Input id="q" name="q" defaultValue={sp.q} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="employee">{t("Employé")}</Label>
        <NativeSelect id="employee" name="employee" defaultValue={sp.employee ?? ""}>
          <option value="">{t("Tous")}</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {employeeName(e)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="status">{t("Statut")}</Label>
        <NativeSelect id="status" name="status" defaultValue={sp.status ?? ""}>
          <option value="">{t("Tous")}</option>
          {Object.entries(LEAVE_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {t(v)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="from">{t("Du")}</Label>
        <Input id="from" name="from" type="date" defaultValue={sp.from} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="to">{t("Au")}</Label>
        <Input id="to" name="to" type="date" defaultValue={sp.to} />
      </div>
      <div className="flex items-end">
        <Button type="submit">
          <Search /> {t("Filtrer")}
        </Button>
      </div>
    </form>
  );
}
