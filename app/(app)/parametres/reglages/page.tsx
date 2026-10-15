import { requireModule } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Réglages" };

export default async function ReglagesPage() {
  await requireModule("parametres");
  const settings = await getSettings();
  return (
    <div>
      <ModuleHeader title="Réglages" backHref="/parametres" />
      <SettingsForm settings={settings} />
      <ModuleButtons />
    </div>
  );
}
