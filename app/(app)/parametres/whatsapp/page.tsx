import { requireModule } from "@/lib/auth";
import { getWhatsAppAdminView } from "@/lib/actions/whatsapp";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { WhatsAppSettings } from "./whatsapp-settings";

export const generateMetadata = pageTitle("Configuration WhatsApp");

export default async function WhatsAppConfigPage() {
  const [user, t] = await Promise.all([requireModule("parametres", "edit"), getT()]);
  if (user.role !== "admin") {
    return (
      <div>
        <ModuleHeader title={t("Configuration WhatsApp")} backHref="/parametres" />
        <Alert>
          <AlertDescription>{t("Réservé à l'administrateur.")}</AlertDescription>
        </Alert>
      </div>
    );
  }
  const view = await getWhatsAppAdminView();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return (
    <div className="mx-auto max-w-5xl">
      <ModuleHeader title={t("Configuration WhatsApp")} subtitle={t("Envoi des rapports au directeur par l'API officielle WhatsApp Business (Meta)")} backHref="/parametres" />
      {view.ok && view.data ? (
        <WhatsAppSettings config={view.data.config} missing={view.data.missing} log={view.data.log} webhookUrl={`${origin}/api/whatsapp/webhook`} />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>{view.ok ? t("Erreur inattendue.") : view.error}</AlertDescription>
        </Alert>
      )}
      <ModuleButtons />
    </div>
  );
}
