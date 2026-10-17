import { requireModule } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { HolidaysUI, type HolidayItem } from "./holidays-ui";

export const generateMetadata = pageTitle("Jours fériés");

export default async function FeriesPage() {
  const [user, t] = await Promise.all([requireModule("parametres"), getT()]);
  const supabase = await createClient();
  const { data } = await supabase.from("holidays").select("date, label, estimated, sync_key").order("date", { ascending: false });
  const rows = data ?? [];
  // Année en cours à l'heure du Maroc
  const currentYear = Number(todayISO().slice(0, 4));
  const missingYears = [currentYear, currentYear + 1].filter((y) => !rows.some((r) => r.sync_key?.startsWith(`${y}:`)));
  const holidays: HolidayItem[] = rows.map((r) => ({ date: r.date, label: r.label, estimated: Boolean(r.estimated), synced: Boolean(r.sync_key) }));

  return (
    <div>
      <ModuleHeader title={t("Jours fériés")} subtitle={t("Fuseau horaire : Maroc (Africa/Casablanca)")} backHref="/parametres" />
      <HolidaysUI holidays={holidays} currentYear={currentYear} missingYears={missingYears} canEdit={user.permissions.parametres.can_edit} />
      <ModuleButtons />
    </div>
  );
}
