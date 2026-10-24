import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getBranding } from "@/lib/data/settings";
import { getReminderAlerts } from "@/lib/data/reminders";
import { todayISO } from "@/lib/dates";
import { getT } from "@/lib/i18n/server";
import { ADMIN_MODULES, DASHBOARD_MODULES } from "@/lib/modules";
import { ROLE_LABELS } from "@/lib/types";
import { MobileTabBar, Sidebar, type NavItem } from "@/components/app-nav";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NotificationBell } from "@/components/notification-bell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, t, brand, alerts] = await Promise.all([getCurrentUser(), getT(), getBranding(), getReminderAlerts()]);

  // Navigation filtrée selon les permissions de l'utilisateur
  const modules: NavItem[] = DASHBOARD_MODULES.filter((m) => user.permissions[m.key].can_view).map(({ href, label, accent }) => ({ href, label, accent }));
  const admin: NavItem[] = ADMIN_MODULES.filter((m) => (m.href === "/profil" ? user.permissions.parametres.can_view || user.permissions.employes.can_view : user.permissions[m.key].can_view)).map(({ href, label, accent }) => ({
    href,
    label,
    accent,
  }));
  const navProps = { modules, admin, userName: user.fullName, userRole: ROLE_LABELS[user.role] };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 font-semibold">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.companyName} className="size-8 shrink-0 rounded-lg object-contain" />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">{(brand.companyName || "?").slice(0, 1).toUpperCase()}</span>
            )}
            <span className="truncate">{brand.companyName || t("Entreprise à configurer")}</span>
          </Link>
          <div className="ms-auto flex items-center gap-1.5">
            <LanguageSwitcher className="hidden sm:inline-flex lg:hidden" />
            <NotificationBell alerts={alerts} today={todayISO()} />
            <span className="hidden text-sm text-muted-foreground lg:inline">{t("Bonjour {name}", { name: user.fullName.split(" ")[0] })}</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <Sidebar {...navProps} />
        <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-10">{children}</main>
      </div>

      <MobileTabBar {...navProps} />
    </div>
  );
}
