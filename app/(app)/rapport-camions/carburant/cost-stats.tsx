import Link from "next/link";
import type { CostPivot, FuelPeriod } from "@/lib/data/fuel";
import { formatDateFr, formatMonthFr } from "@/lib/dates";
import type { Locale, TFunction } from "@/lib/i18n/config";
import { formatAmount, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const PERIOD_PARAM: Record<string, FuelPeriod> = { jour: "day", semaine: "week", mois: "month" };

export function periodLabel(period: FuelPeriod, iso: string, t: TFunction, locale: Locale): string {
  if (period === "month") return formatMonthFr(iso.slice(0, 7), locale);
  if (period === "week") return t("Semaine du {date}", { date: formatDateFr(iso) });
  return formatDateFr(iso);
}

/** Statistiques des coûts carburant (DH) : par jour, semaine ou mois, pour chaque camion. */
export function CostStats({
  pivot,
  period,
  baseQuery,
  note,
  t,
  locale,
}: {
  pivot: CostPivot;
  period: FuelPeriod;
  baseQuery: Record<string, string>;
  note?: string;
  t: TFunction;
  locale: Locale;
}) {
  const unit = t("DH");
  const views: { key: string; period: FuelPeriod; label: string }[] = [
    { key: "jour", period: "day", label: t("Par jour") },
    { key: "semaine", period: "week", label: t("Par semaine") },
    { key: "mois", period: "month", label: t("Par mois") },
  ];
  const max = Math.max(1, ...pivot.rows.map((r) => r.total));
  const href = (vue: string) => `/rapport-camions/carburant?${new URLSearchParams({ ...baseQuery, vue }).toString()}#couts`;

  return (
    <section id="couts" className="mb-6 scroll-mt-20">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{t("Statistiques des coûts ({unit})", { unit })}</h2>
        <div className="ms-auto flex gap-1 rounded-lg border bg-card p-0.5">
          {views.map((v) => (
            <Link
              key={v.key}
              href={href(v.key)}
              scroll={false}
              className={cn("rounded-md px-3 py-1 text-sm", v.period === period ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {v.label}
            </Link>
          ))}
        </div>
      </div>
      {note && <p className="mb-2 text-xs text-muted-foreground">{note}</p>}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{period === "day" ? t("Jour") : period === "week" ? t("Semaine") : t("Mois")}</TableHead>
              {pivot.trucks.map((tr) => (
                <TableHead key={tr.id} className="text-end font-mono">
                  {tr.matricule}
                </TableHead>
              ))}
              <TableHead className="text-end">{t("Total ({unit})", { unit })}</TableHead>
              <TableHead className="hidden w-40 sm:table-cell" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pivot.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={pivot.trucks.length + 3} className="text-center text-muted-foreground">
                  {t("Aucune donnée.")}
                </TableCell>
              </TableRow>
            )}
            {pivot.rows.map((r) => (
              <TableRow key={r.period}>
                <TableCell className="whitespace-nowrap">{periodLabel(period, r.period, t, locale)}</TableCell>
                {pivot.trucks.map((tr) => (
                  <TableCell key={tr.id} className="text-end tabular-nums">
                    {r.byTruck[tr.id] != null ? formatAmount(r.byTruck[tr.id]) : ""}
                  </TableCell>
                ))}
                <TableCell className="text-end font-semibold tabular-nums">{formatAmount(r.total)}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${Math.round((r.total / max) * 100)}%` }} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {pivot.rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell>{t("Total de la période")}</TableCell>
                {pivot.trucks.map((tr) => (
                  <TableCell key={tr.id} className="text-end tabular-nums">
                    {formatAmount(pivot.totalByTruck[tr.id] ?? 0)}
                  </TableCell>
                ))}
                <TableCell className="text-end tabular-nums">{formatMoney(pivot.total, unit)}</TableCell>
                <TableCell className="hidden sm:table-cell" />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </section>
  );
}
