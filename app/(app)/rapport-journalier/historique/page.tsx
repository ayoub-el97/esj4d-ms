import Link from "next/link";
import { Suspense } from "react";
import { Brush, ClipboardList, FolderOpen, Lock, Search, Truck } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getDailyReportsSummary } from "@/lib/data/history";
import { addDaysISO, formatDateLongFr, isISODate, todayISO } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { DayNav } from "@/components/day-nav";
import { PdfExportButton } from "@/components/pdf-export-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { LastChange, ModifiedBadge } from "@/components/last-change";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const generateMetadata = pageTitle("Historique des rapports journaliers");

type SP = { date?: string; from?: string; to?: string };

/**
 * Historique des rapports journaliers par date. Chaque rapport s'ouvre dans son écran habituel
 * (mêmes champs, mêmes règles, même enregistrement) avec les données enregistrées ce jour-là.
 */
export default async function DailyReportsHistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [, { t, locale }] = await Promise.all([requireModule("rapport_journalier"), getI18n()]);
  const sp = await searchParams;
  const today = todayISO();
  const date = isISODate(sp.date) ? sp.date : today;
  const to = isISODate(sp.to) ? sp.to : today;
  const from = isISODate(sp.from) ? sp.from : addDaysISO(to, -30);
  const [[day], list] = await Promise.all([getDailyReportsSummary(date, date), getDailyReportsSummary(from, to)]);

  const cards = [
    {
      key: "nettoiement",
      icon: <Brush />,
      title: t("Rapport journalier — Nettoiement"),
      text: day?.cleaning_agents ? t("{count} agent(s) avec lieu de travail et photos.", { count: day.cleaning_agents }) : t("Aucun agent enregistré pour cette date."),
      href: `/rapport-journalier/nettoiement?date=${date}`,
      pdf: day?.cleaning_agents ? <PdfExportButton kind="rapport-nettoiement" params={{ date }} /> : null,
      excel: day?.cleaning_agents ? <ExcelExportButton kind="rapport-nettoiement" params={{ date }} /> : null,
    },
    {
      key: "collecte",
      icon: <Truck />,
      title: t("Rapport journalier — Collecte"),
      text: day?.collection_count ? t("{count} camion(s) : équipe, secteurs, photos.", { count: day.collection_count }) : t("Aucun rapport de collecte pour cette date."),
      href: `/rapport-journalier/collecte?date=${date}`,
      pdf: null,
      excel: day?.collection_count ? <ExcelExportButton kind="rapport-collecte" params={{ date }} /> : null,
    },
    {
      key: "camions",
      icon: <Truck />,
      title: t("Rapport camions"),
      text: day?.truck_lines ? t("{count} ligne(s), {tonnage} t au total.", { count: day.truck_lines, tonnage: day.tonnage.toFixed(2) }) : t("Aucune ligne camion pour cette date."),
      href: `/rapport-camions/historique?date=${date}`,
      pdf: day?.truck_lines ? <PdfExportButton kind="camions" params={{ date }} /> : null,
      excel: day?.truck_lines ? <ExcelExportButton kind="camions" params={{ date }} /> : null,
    },
    {
      key: "global",
      icon: <ClipboardList />,
      title: t("Rapport journalier global"),
      text: t("Récapitulatif camions et nettoiement"),
      href: `/rapport-journalier/global?date=${date}`,
      pdf: null,
      excel: null,
    },
  ];

  return (
    <div>
      <ModuleHeader title={t("Historique des rapports journaliers")} subtitle={formatDateLongFr(date, locale)} backHref={`/rapport-journalier?date=${date}`}>
        <Suspense>
          <DateField value={date} />
          <DayNav value={date} />
        </Suspense>
      </ModuleHeader>
      <p className="mb-3 text-xs text-muted-foreground">
        {t("Chaque rapport est enregistré pour sa date. Ouvrez-le pour le compléter ou le corriger dans son écran habituel (lieux, commentaires, équipe, secteurs, tonnages, vidages, photos) : l'enregistrement met à jour le même rapport, sans doublon.")}
      </p>
      {day && <LastChange t={t} at={day.last_at} user={day.last_user} modified={day.modified} className="mb-3" />}

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <article key={c.key} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
            <header className="flex items-center gap-2 font-semibold [&_svg]:size-4">
              {c.icon} {c.title}
              {day?.closed && <Lock className="ms-auto text-muted-foreground" />}
            </header>
            <p className="text-sm text-muted-foreground">{c.text}</p>
            <div className="mt-auto flex flex-wrap gap-2">
              <LinkButton href={c.href}>
                <FolderOpen /> {t("Ouvrir la journée")}
              </LinkButton>
              {c.pdf}
              {c.excel}
            </div>
          </article>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-base font-semibold">{t("Journées enregistrées")}</h2>
        <form className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
          <input type="hidden" name="date" value={date} />
          <div className="space-y-1">
            <Label htmlFor="from">{t("Du")}</Label>
            <Input id="from" name="from" type="date" defaultValue={from} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">{t("Au")}</Label>
            <Input id="to" name="to" type="date" defaultValue={to} />
          </div>
          <Button type="submit" variant="outline">
            <Search /> {t("Afficher")}
          </Button>
          <LinkButton href="/rapport-journalier/collecte/historique" variant="ghost" className="ms-auto">
            {t("Rapports de collecte avec photos")}
          </LinkButton>
        </form>
        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("Aucun rapport enregistré sur cette période.")}</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {list.map((r) => (
              <li key={r.activity_date} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm", r.activity_date === date && "bg-primary/5")}>
                <Link href={`/rapport-journalier/historique?date=${r.activity_date}&from=${from}&to=${to}`} className="min-w-52 font-medium first-letter:uppercase hover:underline">
                  {formatDateLongFr(r.activity_date, locale)}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {t("Nettoiement : {n} agent(s)", { n: r.cleaning_agents })} · {t("Collecte : {n} camion(s)", { n: r.collection_count })} · {t("Camions : {n} ligne(s), {tonnage} t", { n: r.truck_lines, tonnage: r.tonnage.toFixed(2) })}
                </span>
                {r.modified && <ModifiedBadge t={t} />}
                {r.closed && <Lock className="size-3 text-muted-foreground" />}
              </li>
            ))}
          </ul>
        )}
      </section>
      <ModuleButtons monthlyHref="/rapport-mensuel" />
    </div>
  );
}
