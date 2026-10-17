"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { useT } from "@/lib/i18n/client";
import { NavIcon } from "@/lib/nav-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/language-switcher";

/** Entrée de navigation (texte français = clé de traduction). Sérialisable : passée depuis le layout serveur. */
export type NavItem = { href: string; label: string; accent: string };


const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const { t } = useT();
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", active ? "bg-primary text-primary-foreground" : item.accent)}>
        <NavIcon href={item.href} className="size-4" />
      </span>
      <span className="truncate">{t(item.label)}</span>
    </Link>
  );
}

function NavGroups({ modules, admin, pathname, onNavigate }: { modules: NavItem[]; admin: NavItem[]; pathname: string; onNavigate?: () => void }) {
  const { t } = useT();
  const home: NavItem = { href: "/", label: "Accueil", accent: "bg-muted text-foreground" };
  const reminders: NavItem = { href: "/rappels", label: "Rappels et alertes", accent: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" };
  return (
    <div className="space-y-5">
      <div className="space-y-0.5">
        <NavLink item={home} pathname={pathname} onNavigate={onNavigate} />
        <NavLink item={reminders} pathname={pathname} onNavigate={onNavigate} />
      </div>
      {modules.length > 0 && (
        <div className="space-y-0.5">
          <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("Modules")}</p>
          {modules.map((m) => (
            <NavLink key={m.href} item={m} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      )}
      {admin.length > 0 && (
        <div className="space-y-0.5">
          <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("Administration")}</p>
          {admin.map((m) => (
            <NavLink key={m.href} item={m} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserBlock({ name, role }: { name: string; role: string }) {
  const { t } = useT();
  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center gap-2 px-1">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{name.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{t(role)}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher className="flex-1" />
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm" title={t("Se déconnecter")}>
            <LogOut className="rtl:rotate-180" /> {t("Déconnexion")}
          </Button>
        </form>
      </div>
    </div>
  );
}

/** Barre latérale (ordinateur, à partir de lg). */
export function Sidebar({ modules, admin, userName, userRole }: { modules: NavItem[]; admin: NavItem[]; userName: string; userRole: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col gap-4 overflow-y-auto border-e bg-card px-3 py-4 lg:flex">
      <div className="flex-1">
        <NavGroups modules={modules} admin={admin} pathname={pathname} />
      </div>
      <UserBlock name={userName} role={userRole} />
    </aside>
  );
}

/** Barre d'onglets en bas de l'écran (téléphone et tablette) + menu complet. */
export function MobileTabBar({ modules, admin, userName, userRole }: { modules: NavItem[]; admin: NavItem[]; userName: string; userRole: string }) {
  const { t } = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Onglets : accueil, pointage et rapport journalier (si autorisés), rappels, menu
  const tabs: NavItem[] = [
    { href: "/", label: "Accueil", accent: "" },
    ...modules.filter((m) => m.href === "/pointage" || m.href === "/rapport-journalier"),
    { href: "/rappels", label: "Rappels", accent: "" },
  ];
  const short: Record<string, string> = { "/rapport-journalier": "Rapports" };

  return (
    <>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur lg:hidden" aria-label={t("Navigation")}>
        <div className="mx-auto flex max-w-xl">
          {tabs.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary/10")}>
                  <NavIcon href={tab.href} className="size-5" />
                </span>
                {t(short[tab.href] ?? tab.label)}
              </Link>
            );
          })}
          <button type="button" onClick={() => setOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground">
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <Menu className="size-5" />
            </span>
            {t("Menu")}
          </button>
        </div>
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] gap-3 overflow-y-auto rounded-t-2xl px-4 pt-4 pb-6">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-muted" />
          <SheetTitle>{t("Menu")}</SheetTitle>
          <NavGroups modules={modules} admin={admin} pathname={pathname} onNavigate={() => setOpen(false)} />
          <UserBlock name={userName} role={userRole} />
        </SheetContent>
      </Sheet>
    </>
  );
}
