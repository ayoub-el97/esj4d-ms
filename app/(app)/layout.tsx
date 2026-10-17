import Link from "next/link";
import { Building2, Home, LogOut, Settings, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { getBranding } from "@/lib/data/settings";
import { getT } from "@/lib/i18n/server";
import { ROLE_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/link-button";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, t, brand] = await Promise.all([getCurrentUser(), getT(), getBranding()]);
  const canSeeProfile = user.permissions.parametres.can_view || user.permissions.employes.can_view;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.companyName} className="size-8 rounded-lg object-contain" />
            ) : (
              <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white">
                {brand.companyName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="hidden max-w-40 truncate md:inline">{brand.companyName}</span>
          </Link>

          <nav className="ms-1 flex items-center gap-1">
            <LinkButton href="/" variant="ghost" size="sm" title={t("Accueil")}>
              <Home /> <span className="hidden lg:inline">{t("Accueil")}</span>
            </LinkButton>
            {canSeeProfile && (
              <LinkButton href="/profil" variant="ghost" size="sm" title={t("Profil de l'entreprise")}>
                <Building2 /> <span className="hidden lg:inline">{t("Profil")}</span>
              </LinkButton>
            )}
            {user.permissions.employes.can_view && (
              <LinkButton href="/employes" variant="ghost" size="sm" title={t("Employés")}>
                <Users /> <span className="hidden lg:inline">{t("Employés")}</span>
              </LinkButton>
            )}
            {user.permissions.parametres.can_view && (
              <LinkButton href="/parametres" variant="ghost" size="sm" title={t("Paramètres")}>
                <Settings /> <span className="hidden lg:inline">{t("Paramètres")}</span>
              </LinkButton>
            )}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            <LanguageSwitcher />
            <div className="hidden text-end sm:block">
              <div className="text-sm font-medium leading-tight">{user.fullName}</div>
              <Badge variant="secondary" className="text-[10px]">
                {t(ROLE_LABELS[user.role])}
              </Badge>
            </div>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm" title={t("Se déconnecter")}>
                <LogOut className="rtl:rotate-180" /> <span className="hidden sm:inline">{t("Déconnexion")}</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
