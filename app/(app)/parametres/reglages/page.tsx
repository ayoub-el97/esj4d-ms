import { requireModule } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { SettingsForm } from "./settings-form";

export const generateMetadata = pageTitle("Réglages");

export default async function ReglagesPage() {
  const [, t, settings] = await Promise.all([requireModule("parametres"), getT(), getSettings()]);
  return (
    <div>
      <ModuleHeader title={t("Réglages")} backHref="/parametres" />
      <SettingsForm settings={settings} />
      <ModuleButtons />
    </div>
  );
}
