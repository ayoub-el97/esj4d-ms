import { requireModule } from "@/lib/auth";
import { getSuppliers } from "@/lib/data/purchases";
import { todayISO } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { PurchaseForm } from "../purchase-form";

export const generateMetadata = pageTitle("Nouvel achat de matériel");

export default async function NouvelAchatPage() {
  const [user, t] = await Promise.all([requireModule("achats", "edit"), getT()]);
  const suppliers = await getSuppliers();
  return (
    <div className="mx-auto max-w-4xl">
      <ModuleHeader title={t("Nouvel achat de matériel")} subtitle={t("Photos : prenez-les directement avec le téléphone ou importez-les ; elles sont envoyées à l'enregistrement.")} backHref="/achats" />
      <PurchaseForm purchase={null} suppliers={suppliers} defaultDate={todayISO()} canEdit isAdmin={user.role === "admin"} />
    </div>
  );
}
