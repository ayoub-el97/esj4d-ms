import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getOvertimeGrid, getPeriodStartDay } from "@/lib/data/attendance-grid";
import { periodMonthOf, shiftMonth, WEEKDAY_INITIALS, weekdayOf } from "@/lib/attendance-grid";
import { formatDateFr, formatMonthFr, isMonth, todayISO } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { POSITIONS, POSITION_LABELS, TEAM_SLUGS, type Position } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MonthlyTabs } from "../tabs";

export const generateMetadata = pageTitle("Heures supplémentaires");

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

export default async function OvertimePage({ searchParams }: { searchParams: Promise<{ mois?: string; equipe?: string; poste?: string; q?: string }> }) {
  const [, { t, locale }] = await Promise.all([requireModule("pointage"), getI18n()]);
  const sp = await searchParams;
  const startDay = await getPeriodStartDay();
  const month = isMonth(sp.mois) ? sp.mois : periodMonthOf(todayISO(), startDay);
  const team = sp.equipe ? TEAM_SLUGS[sp.equipe] : undefined;
  const position = POSITIONS.includes(sp.poste as Position) ? (sp.poste as Position) : undefined;
  const q = (sp.q ?? "").slice(0, 60);
  const grid = await getOvertimeGrid(month, { team, position, q }, startDay);
  const monthName = formatMonthFr(month, locale).replace(/^./, (c) => c.toUpperCase());
  const withHours = grid.rows.filter((r) => r.total > 0).length;
  const params = { mois: month, ...(team ? { equipe: team } : {}), ...(position ? { poste: position } : {}), ...(q ? { q } : {}) };
  const monthHref = (m: string) => `/pointage/mensuel/heures-sup?${new URLSearchParams({ ...params, mois: m }).toString()}`;

  return (
    <div>
      <ModuleHeader title={t("Heures supplémentaires")} subtitle={t("{month} — du {from} au {to}", { month: monthName, from: formatDateFr(grid.from), to: formatDateFr(grid.to) })} backHref="/pointage">
        <Link href={monthHref(shiftMonth(month, -1))} className="text-sm text-primary hover:underline">
          ← {t("Période précédente")}
        </Link>
        <Link href={monthHref(shiftMonth(month, 1))} className="text-sm text-primary hover:underline">
          {t("Période suivante")} →
        </Link>
      </ModuleHeader>
      <MonthlyTabs active="heures-sup" month={month} t={t} />

      <form method="get" className="no-print mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_1fr_auto]">
        <label className="space-y-1 text-xs font-medium">
          {t("Mois de la période")}
          <Input type="month" name="mois" defaultValue={month} className="w-auto" />
        </label>
        <label className="space-y-1 text-xs font-medium">
          {t("Équipe")}
          <NativeSelect name="equipe" defaultValue={team ?? ""}>
            <option value="">{t("Toutes les équipes")}</option>
            <option value="collecte">{t("Collecte")}</option>
            <option value="nettoiement">{t("Nettoiement")}</option>
          </NativeSelect>
        </label>
        <label className="space-y-1 text-xs font-medium">
          {t("Fonction")}
          <NativeSelect name="poste" defaultValue={position ?? ""}>
            <option value="">{t("Toutes les fonctions")}</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {t(POSITION_LABELS[p])}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1 text-xs font-medium">
          {t("Employé")}
          <Input type="search" name="q" defaultValue={q} placeholder={t("Nom, prénom ou matricule")} />
        </label>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            <RefreshCw /> {t("Générer / actualiser")}
          </Button>
        </div>
      </form>

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">{t("Total des heures supplémentaires")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{fmt(grid.total)} h</p>
          <p className="text-xs text-muted-foreground">{t("dont automatiques {auto} h + manuelles {manual} h", { auto: fmt(grid.auto), manual: fmt(grid.manual) })}</p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">{t("Employés avec des heures supplémentaires")}</p>
          <p className="mt-1 text-2xl font-bold">
            {withHours} / {grid.rows.length}
          </p>
        </div>
      </div>

      <div className="max-h-[75vh] overflow-auto rounded-xl border bg-card">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              {["Nombre", "Nom", "Prénom", "Fonction"].map((h, i) => (
                <th key={h} rowSpan={2} className={cn("sticky top-0 z-30 border-e border-b bg-muted px-2 text-start font-semibold", i === 0 && "start-0 w-10 min-w-10", i === 1 && "start-10 w-32 min-w-32", i > 1 && "w-28 min-w-28")}>
                  {t(h)}
                </th>
              ))}
              {grid.dates.map((d) => (
                <th key={d} className={cn("sticky top-0 z-20 h-[1.375rem] border-e border-b bg-muted px-0.5 pt-1 text-center text-[10px] font-semibold", grid.holidays[d] && "bg-purple-100 dark:bg-purple-950")} title={grid.holidays[d] || undefined}>
                  {d.slice(8, 10)}/{d.slice(5, 7)}
                </th>
              ))}
              {(["Auto", "Manuel", "Total"] as const).map((h) => (
                <th key={h} rowSpan={2} className="sticky top-0 z-20 border-e border-b bg-muted px-2 text-center font-semibold">
                  {t(h)}
                </th>
              ))}
            </tr>
            <tr>
              {grid.dates.map((d) => (
                <th key={d} className="sticky top-[1.375rem] z-20 border-e border-b bg-muted px-0.5 pb-1 text-center text-[10px] font-medium text-muted-foreground">
                  {WEEKDAY_INITIALS[weekdayOf(d)]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.length === 0 && (
              <tr>
                <td colSpan={7 + grid.dates.length} className="p-6 text-center text-muted-foreground">
                  {t("Aucun employé pour cette période et ces filtres.")}
                </td>
              </tr>
            )}
            {grid.rows.map((r) => (
              <tr key={r.id}>
                <td className="sticky start-0 z-10 border-e border-b bg-card px-2 text-center">{r.order_number}</td>
                <td className="sticky start-10 z-10 truncate border-e border-b bg-card px-2 font-medium">{r.last_name}</td>
                <td className="truncate border-e border-b px-2">{r.first_name}</td>
                <td className="truncate border-e border-b px-2 text-muted-foreground">{r.job_title || t(POSITION_LABELS[r.position] ?? r.position)}</td>
                {grid.dates.map((d) => (
                  <td
                    key={d}
                    className={cn("h-7 min-w-9 border-e border-b text-center leading-tight tabular-nums", r.hours[d] ? "bg-indigo-50 font-semibold text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200" : "text-muted-foreground/40")}
                    title={r.hours[d] ? t("Automatiques {auto} h + manuelles {manual} h = {total} h", { auto: fmt(r.hours[d].auto), manual: fmt(r.hours[d].manual), total: fmt(r.hours[d].total) }) : undefined}
                  >
                    {r.hours[d] ? (
                      <>
                        {fmt(r.hours[d].total)}
                        {r.hours[d].auto > 0 && r.hours[d].manual > 0 && <span className="block text-[9px] font-normal opacity-70">{fmt(r.hours[d].auto)}+{fmt(r.hours[d].manual)}</span>}
                      </>
                    ) : (
                      ""
                    )}
                  </td>
                ))}
                <td className="border-e border-b bg-muted/40 px-2 text-center tabular-nums">{r.auto ? fmt(r.auto) : "—"}</td>
                <td className="border-e border-b bg-muted/40 px-2 text-center tabular-nums">{r.manual ? fmt(r.manual) : "—"}</td>
                <td className="border-b bg-muted/40 px-2 text-center font-bold tabular-nums">{r.total ? fmt(r.total) : "—"}</td>
              </tr>
            ))}
          </tbody>
          {grid.rows.length > 0 && (
            <tfoot>
              {(
                [
                  ["auto", "Heures automatiques du jour"],
                  ["manual", "Heures manuelles du jour"],
                  ["total", "Total du jour (heures)"],
                ] as const
              ).map(([k, label], i) => (
                <tr key={k} className={i === 0 ? "[&>td]:border-t-2" : ""}>
                  <td colSpan={4} className={cn("sticky start-0 z-10 border-e border-b bg-muted px-2", k === "total" ? "font-bold" : "font-semibold")}>
                    {t(label)}
                  </td>
                  {grid.dates.map((d) => (
                    <td key={d} className={cn("h-7 border-e border-b bg-muted/40 text-center tabular-nums", k === "total" && "font-bold")}>
                      {fmt(grid.dayTotals[d]?.[k] ?? 0)}
                    </td>
                  ))}
                  <td className="border-e border-b bg-muted px-2 text-center tabular-nums">{k === "auto" ? fmt(grid.auto) : ""}</td>
                  <td className="border-e border-b bg-muted px-2 text-center tabular-nums">{k === "manual" ? fmt(grid.manual) : ""}</td>
                  <td className="border-b bg-muted px-2 text-center font-bold tabular-nums">{k === "total" ? fmt(grid.total) : ""}</td>
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("Total = heures automatiques + heures manuelles, toujours additionnées. Automatiques : dépassement de la fin prévue (heure d'entrée + 8 h, y compris après minuit), arrondi à l'heure supérieure. Manuelles : heures accordées par le responsable dans la colonne « HS » du Pointage, ajoutées en totalité. Même total que la synthèse mensuelle.")}
      </p>

      <ModuleButtons pdfSlot={<PdfExportButton kind="pointage-hs" params={params} />} historyHref="/pointage/historique" />
    </div>
  );
}
