import Link from "next/link";
import { Suspense } from "react";
import { FolderOpen, Lock, Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getAttendanceSheetsSummary, type SheetSummary } from "@/lib/data/history";
import { addDaysISO, formatDateLongFr, isISODate, todayISO } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/config";
import { sheetTitle } from "@/lib/sheet-title";
import type { TeamType } from "@/lib/types";
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

export const generateMetadata = pageTitle("Historique du pointage");

const TEAMS: TeamType[] = ["collecte", "nettoiement"];

type SP = { date?: string; from?: string; to?: string };

/**
 * Historique du pointage par date : pour chaque date, la feuille de présence des équipes de collecte
 * et celle des équipes de nettoiement. Chaque feuille s'ouvre dans la feuille de présence habituelle
 * (même tableau, mêmes règles, même enregistrement), avec les données enregistrées ce jour-là.
 */
export default async function HistoriquePage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("pointage"), getI18n()]);
  const sp = await searchParams;
  const today = todayISO();
  const date = isISODate(sp.date) ? sp.date : today;
  const to = isISODate(sp.to) ? sp.to : today;
  const from = isISODate(sp.from) ? sp.from : addDaysISO(to, -30);
  const [day, list] = await Promise.all([getAttendanceSheetsSummary(date, date), getAttendanceSheetsSummary(from, to)]);
  const canEdit = user.permissions.pointage.can_edit;

  // Journées de la période : une ligne par date, du plus récent au plus ancien
  const byDate = new Map<string, Partial<Record<TeamType, SheetSummary>>>();
  for (const s of list) byDate.set(s.activity_date, { ...(byDate.get(s.activity_date) ?? {}), [s.team_type]: s });
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <ModuleHeader title={t("Historique du pointage")} subtitle={formatDateLongFr(date, locale)} backHref="/pointage">
        <Suspense>
          <DateField value={date} label="Date de la feuille" />
          <DayNav value={date} />
        </Suspense>
      </ModuleHeader>
      <p className="mb-4 text-xs text-muted-foreground">
        {t("Chaque feuille de présence est enregistrée pour sa date et n'est jamais recréée à partir de la liste actuelle des employés. Ouvrez une feuille pour la compléter ou la corriger exactement comme une nouvelle feuille : ajouter ou retirer un employé, statut, heures, heures supplémentaires, affectations, observations. L'enregistrement met à jour la feuille de cette date (jamais celle d'aujourd'hui).")}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {TEAMS.map((team) => (
          <SheetCard key={team} t={t} team={team} date={date} s={day.find((x) => x.team_type === team)} canEdit={canEdit} />
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
          <LinkButton href="/pointage/historique/lignes" variant="ghost" className="ms-auto">
            {t("Recherche détaillée (employé, poste, statut)")}
          </LinkButton>
        </form>
        {dates.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("Aucune feuille de présence enregistrée sur cette période.")}</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {dates.map((d) => {
              const g = byDate.get(d)!;
              return (
                <li key={d} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-sm", d === date && "bg-primary/5")}>
                  <Link href={`/pointage/historique?date=${d}&from=${from}&to=${to}`} className="min-w-52 font-medium first-letter:uppercase hover:underline">
                    {formatDateLongFr(d, locale)}
                  </Link>
                  {TEAMS.map((team) => {
                    const s = g[team];
                    return (
                      <Link key={team} href={`/pointage/${team}?date=${d}`} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted", !s?.rows_count && "text-muted-foreground")}>
                        <span className="font-medium">{team === "collecte" ? t("Collecte") : t("Nettoiement")}</span>
                        <span>{s?.rows_count ? t("{count} employé(s)", { count: s.rows_count }) : t("non enregistrée")}</span>
                        {s?.modified && <ModifiedBadge t={t} />}
                        {s?.closed && <Lock className="size-3" />}
                      </Link>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ModuleButtons
        pdfSlot={<ExcelExportButton kind="pointage" params={{ date }} label="Exporter Excel (les deux feuilles)" />}
        monthlyHref="/pointage/mensuel"
      />
    </div>
  );
}

function SheetCard({ t, team, date, s, canEdit }: { t: TFunction; team: TeamType; date: string; s: SheetSummary | undefined; canEdit: boolean }) {
  const saved = !!s?.rows_count;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <header className="flex flex-wrap items-start gap-2">
        <h3 className="font-semibold">{sheetTitle(t, team, date)}</h3>
        {s?.closed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
            <Lock className="size-3" /> {t("Journée clôturée")}
          </span>
        )}
      </header>
      <p className="text-sm text-muted-foreground">
        {saved ? t("{count} employé(s) pointé(s), dont {worked} au travail.", { count: s!.rows_count, worked: s!.worked_count }) : t("Aucune feuille enregistrée pour cette date : elle peut être remplie comme une nouvelle feuille.")}
      </p>
      {s && <LastChange t={t} at={s.last_at} user={s.last_user} modified={s.modified} />}
      <div className="mt-auto flex flex-wrap gap-2">
        <LinkButton href={`/pointage/${team}?date=${date}`}>
          <FolderOpen /> {s?.closed || !canEdit ? t("Ouvrir la journée") : saved ? t("Ouvrir et modifier") : t("Remplir la feuille")}
        </LinkButton>
        {saved && (
          <>
            <PdfExportButton kind="pointage" params={{ date, equipe: team }} />
            <ExcelExportButton kind="pointage" params={{ date, equipe: team }} />
          </>
        )}
      </div>
    </article>
  );
}
