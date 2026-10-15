import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { HolidaysUI } from "./holidays-ui";

export const metadata = { title: "Jours fériés" };

export default async function FeriesPage() {
  await requireModule("parametres");
  const supabase = await createClient();
  const { data } = await supabase.from("holidays").select("date, label").order("date", { ascending: false });
  return (
    <div>
      <ModuleHeader title="Jours fériés" backHref="/parametres" />
      <HolidaysUI holidays={data ?? []} />
      <ModuleButtons />
    </div>
  );
}
