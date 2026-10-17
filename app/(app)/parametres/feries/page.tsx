import { requireModule } from "@/lib/auth";
import { getT, pageTitle } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { HolidaysUI } from "./holidays-ui";

export const generateMetadata = pageTitle("Jours fériés");

export default async function FeriesPage() {
  const [, t] = await Promise.all([requireModule("parametres"), getT()]);
  const supabase = await createClient();
  const { data } = await supabase.from("holidays").select("date, label").order("date", { ascending: false });
  return (
    <div>
      <ModuleHeader title={t("Jours fériés")} backHref="/parametres" />
      <HolidaysUI holidays={data ?? []} />
      <ModuleButtons />
    </div>
  );
}
