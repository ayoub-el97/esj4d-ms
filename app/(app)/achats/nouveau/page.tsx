import { requireModule } from "@/lib/auth";
import { getPurchaseCategories } from "@/lib/data/purchases";
import { todayISO } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { PurchaseForm } from "../purchase-form";

export const generateMetadata = pageTitle("Nouvel achat");

export default async function NouvelAchatPage() {
  const [, t] = await Promise.all([requireModule("achats", "edit"), getT()]);
  const categories = await getPurchaseCategories();
  return (
    <div className="mx-auto max-w-3xl">
      <ModuleHeader title={t("Nouvel achat")} subtitle={t("Photos : prenez-les directement avec le téléphone ou importez-les ; elles sont envoyées à l'enregistrement.")} backHref="/achats" />
      <PurchaseForm purchase={null} categories={categories} defaultDate={todayISO()} canEdit />
    </div>
  );
}
