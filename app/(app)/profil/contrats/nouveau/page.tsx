import { requireModule } from "@/lib/auth";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { Card, CardContent } from "@/components/ui/card";
import { ContractForm } from "../contracts-ui";

export const generateMetadata = pageTitle("Nouveau contrat");

export default async function NewContractPage() {
  const [, t] = await Promise.all([requireModule("parametres", "edit"), getT()]);
  return (
    <div className="mx-auto max-w-3xl">
      <ModuleHeader title={t("Nouveau contrat")} subtitle={t("Les contrats précédents et leurs rapports sont conservés ; les anciens rapports ne sont pas rattachés au nouveau contrat.")} backHref="/profil/contrats" />
      <Card>
        <CardContent className="pt-6">
          <ContractForm />
        </CardContent>
      </Card>
    </div>
  );
}
