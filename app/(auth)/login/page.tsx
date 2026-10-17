import { Truck } from "lucide-react";
import { getT, pageTitle } from "@/lib/i18n/server";
import { getBranding } from "@/lib/data/settings";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LoginForm } from "./login-form";

export const generateMetadata = pageTitle("Connexion");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const t = await getT();
  const { error } = await searchParams;
  const { companyName, logoUrl } = await getBranding();
  const notice = error === "inactif" ? t("Votre compte est désactivé. Contactez l'administrateur.") : undefined;

  return (
    <main className="relative flex flex-1 items-center justify-center bg-gradient-to-b from-indigo-100/70 via-background to-background p-4 dark:from-indigo-950/40">
      <LanguageSwitcher className="absolute end-4 top-4" />
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={companyName} className="size-16 rounded-2xl bg-white object-contain p-1 shadow" />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow">
              <Truck className="size-7" />
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">{companyName}</h1>
          <p className="text-sm text-muted-foreground">{t("Gestion Collecte & Nettoiement")}</p>
        </div>
        <LoginForm notice={notice} />
      </div>
    </main>
  );
}
