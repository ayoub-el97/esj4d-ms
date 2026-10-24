import Link from "next/link";
import type { TFunction } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "grille", label: "Rapport mensuel de pointage", href: "/pointage/mensuel" },
  { key: "heures-sup", label: "Heures supplémentaires", href: "/pointage/mensuel/heures-sup" },
  { key: "recap", label: "Récap", href: "/pointage/mensuel/recap" },
] as const;

/** Les trois sections du rapport mensuel de pointage (même mois conservé d'un onglet à l'autre). */
export function MonthlyTabs({ active, month, t }: { active: (typeof TABS)[number]["key"]; month: string; t: TFunction }) {
  return (
    <nav className="no-print mb-4 flex gap-1 overflow-x-auto rounded-lg border bg-card p-0.5 text-sm" aria-label={t("Sections du rapport mensuel")}>
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`${tab.href}?mois=${month}`}
          aria-current={active === tab.key ? "page" : undefined}
          className={cn("flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center", active === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
        >
          {t(tab.label)}
        </Link>
      ))}
    </nav>
  );
}
