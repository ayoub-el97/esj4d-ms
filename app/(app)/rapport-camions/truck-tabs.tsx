import Link from "next/link";
import { Fuel, Truck } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

/** Deux parties du rapport camions : rapport général et carburant. */
export async function TruckTabs({ active }: { active: "general" | "carburant" }) {
  const t = await getT();
  const tabs = [
    { key: "general", href: "/rapport-camions", label: t("1. Rapport général"), icon: Truck },
    { key: "carburant", href: "/rapport-camions/carburant", label: t("2. Carburant"), icon: Fuel },
  ] as const;
  return (
    <nav className="mb-4 flex gap-1 rounded-xl border bg-card p-1" aria-label={t("Rapport camions")}>
      {tabs.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            active === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Icon className="size-4" /> {label}
        </Link>
      ))}
    </nav>
  );
}
