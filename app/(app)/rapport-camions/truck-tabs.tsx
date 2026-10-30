import Link from "next/link";
import { Fuel, Truck, Wrench, History } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

/** Deux parties du rapport camions : rapport général et carburant. */
export async function TruckTabs({ active }: { active: "general" | "historique" | "carburant" | "reparations" }) {
  const t = await getT();
  const tabs = [
    { key: "general", href: "/rapport-camions", label: t("1. Rapport général"), icon: Truck },
    { key: "historique", href: "/rapport-camions/historique", label: t("Historique des rapports camions"), icon: History },
    { key: "carburant", href: "/rapport-camions/carburant", label: t("2. Carburant"), icon: Fuel },
    { key: "reparations", href: "/reparations", label: t("3. Réparations"), icon: Wrench },
  ] as const;
  return (
    <nav className="mb-4 flex flex-wrap gap-1 rounded-xl border bg-card p-1" aria-label={t("Rapport camions")}>
      {tabs.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
          className={cn(
            "flex min-w-[45%] flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:min-w-0 sm:px-3 sm:text-sm",
            active === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Icon className="size-4" /> {label}
        </Link>
      ))}
    </nav>
  );
}
