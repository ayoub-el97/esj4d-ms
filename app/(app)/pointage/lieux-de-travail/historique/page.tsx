import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getWorkLocationDates } from "@/lib/data/combined-report";
import { formatDateFr, formatDateLongFr, isISODate } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const generateMetadata = pageTitle("Lieux de travail des agents");

/** Historique propre à cette section du Pointage : une ligne par date ayant un rapport, du plus récent au plus ancien. */
export default async function WorkLocationsHistoryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const [, { t, locale }] = await Promise.all([requireModule("rapport_journalier"), getI18n()]);
  const sp = await searchParams;
  const from = isISODate(sp.from) ? sp.from : undefined;
  const to = isISODate(sp.to) ? sp.to : undefined;
  const days = await getWorkLocationDates(from ?? "2000-01-01", to ?? "2100-01-01");
  const period = from || to ? t("du {from} au {to}", { from: from ? formatDateFr(from) : "…", to: to ? formatDateFr(to) : "…" }) : t("toutes dates");

  return (
    <div>
      <ModuleHeader title={t("Lieux de travail des agents")} subtitle={`${t("Historique")} — ${t("{count} jour(s) — {period}", { count: days.length, period })}`} backHref="/pointage" />
      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </div>
        <Button type="submit">
          <Search /> {t("Rechercher")}
        </Button>
        {(from || to) && (
          <LinkButton href="/pointage/lieux-de-travail/historique" variant="outline">
            {t("Tout")}
          </LinkButton>
        )}
      </form>

      {days.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("Aucun rapport enregistré sur cette période.")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {days.map((d) => (
            <li key={d.activity_date}>
              <Link href={`/pointage/lieux-de-travail/historique/${d.activity_date}`} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-3 text-sm transition-colors hover:bg-muted">
                <span className="w-24 font-semibold tabular-nums">{formatDateFr(d.activity_date)}</span>
                <span className="min-w-40 text-muted-foreground first-letter:uppercase">{formatDateLongFr(d.activity_date, locale)}</span>
                <span className="text-muted-foreground">
                  {t("Nettoiement : {n} agent(s)", { n: d.agents })} · {t("Collecte : {n} camion(s)", { n: d.trucks })}
                </span>
                <ChevronRight className="ms-auto size-4 text-muted-foreground rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
