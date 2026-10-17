import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getReminders } from "@/lib/data/reminders";
import { todayISO } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { RemindersPanel } from "@/components/reminders-panel";

export const generateMetadata = pageTitle("Rappels et alertes");

export default async function RappelsPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const [, t] = await Promise.all([getCurrentUser(), getT()]);
  const { vue } = await searchParams;
  const showDone = vue === "faits";
  const all = await getReminders({ includeDone: showDone });
  const reminders = showDone ? all.filter((r) => r.done_at).reverse() : all;
  const today = todayISO();

  return (
    <div className="max-w-3xl">
      <ModuleHeader title={t("Rappels et alertes")} subtitle={t("Créez un rappel à une date : il apparaît en alerte sur l'accueil et dans la cloche quelques jours avant.")} backHref="/" />
      <div className="mb-4 flex gap-1 rounded-lg border bg-card p-0.5 text-sm">
        {[
          { href: "/rappels", label: t("À venir"), active: !showDone },
          { href: "/rappels?vue=faits", label: t("Faits"), active: showDone },
        ].map((v) => (
          <Link key={v.href} href={v.href} className={cn("flex-1 rounded-md px-3 py-1.5 text-center", v.active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            {v.label}
          </Link>
        ))}
      </div>
      <RemindersPanel reminders={reminders} today={today} emptyText={showDone ? t("Aucun rappel fait.") : t("Aucun rappel à venir.")} />
    </div>
  );
}
