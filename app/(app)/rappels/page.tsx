import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getCompletions, getRemindersWithStatus } from "@/lib/data/reminders";
import { getT, pageTitle } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { RemindersPanel } from "@/components/reminders-panel";
import { CompletionsList } from "./completions-list";

export const generateMetadata = pageTitle("Rappels et alertes");

export default async function RappelsPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const [, t] = await Promise.all([getCurrentUser(), getT()]);
  const { vue } = await searchParams;
  const view = vue === "tous" || vue === "termines" ? vue : "afaire";
  const { list, today } = await getRemindersWithStatus();
  const due = list.filter((r) => ["overdue", "today", "later_today", "soon"].includes(r.status.state));
  const completions = view === "termines" ? await getCompletions(150) : [];

  return (
    <div className="max-w-3xl">
      <ModuleHeader title={t("Rappels et alertes")} subtitle={t("Rappels ponctuels ou récurrents (chaque jour, certains jours de la semaine, chaque mois) : ils apparaissent sur l'accueil le jour prévu.")} backHref="/" />
      <div className="mb-4 flex gap-1 rounded-lg border bg-card p-0.5 text-sm">
        {[
          { key: "afaire", href: "/rappels", label: t("À faire ({count})", { count: due.length }) },
          { key: "tous", href: "/rappels?vue=tous", label: t("Tous les rappels ({count})", { count: list.length }) },
          { key: "termines", href: "/rappels?vue=termines", label: t("Terminés") },
        ].map((v) => (
          <Link key={v.key} href={v.href} className={cn("flex-1 rounded-md px-3 py-1.5 text-center", view === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            {v.label}
          </Link>
        ))}
      </div>
      {view === "termines" ? (
        <CompletionsList items={completions} />
      ) : (
        <RemindersPanel reminders={view === "tous" ? list : due} today={today} emptyText={view === "tous" ? t("Aucun rappel.") : t("Rien à faire pour le moment.")} />
      )}
    </div>
  );
}
