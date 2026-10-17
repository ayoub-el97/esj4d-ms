import Link from "next/link";
import { Images, Pencil, Plus, Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployees, getTrucks } from "@/lib/data/employees";
import { costPivot, entriesTotals, fuelTotals, getFuelEntries, getFuelSummary, type FuelSummaryRow } from "@/lib/data/fuel";
import { formatDateFr, formatWorkMonth, isISODate, todayISO, workMonthOf, workMonthRange } from "@/lib/dates";
import { getProjectStart } from "@/lib/data/settings";
import { formatAmount, formatMoney } from "@/lib/money";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import type { Locale, TFunction } from "@/lib/i18n/config";
import { DRIVER_POSITIONS } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TruckTabs } from "../truck-tabs";
import { CostStats, PERIOD_PARAM } from "./cost-stats";

export const generateMetadata = pageTitle("Carburant");

type SP = { from?: string; to?: string; truck?: string; driver?: string; vue?: string };

const n = (v: number | null | undefined, digits = 2) => (v == null ? "—" : v.toFixed(digits));

export default async function CarburantPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("rapport_camions"), getI18n()]);
  const sp = await searchParams;
  const filters = { from: isISODate(sp.from) ? sp.from : undefined, to: isISODate(sp.to) ? sp.to : undefined, truck: sp.truck || undefined, driver: sp.driver || undefined };
  // Statistiques des coûts : vue par jour / semaine / mois (par défaut : mois).
  // Vue « jour » sans période choisie : 31 derniers jours, pour garder un tableau lisible.
  const period = PERIOD_PARAM[sp.vue ?? ""] ?? "month";
  const today = todayISO();
  const last31 = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
  const costFilters = period === "day" && !filters.from && !filters.to ? { ...filters, from: last31, to: today } : filters;
  const projectStart = await getProjectStart();
  const monthStart = workMonthRange(workMonthOf(today, projectStart), projectStart).from;
  const [entries, weekly, monthly, costRows, currentMonth, trucks, collecte] = await Promise.all([
    getFuelEntries(filters),
    getFuelSummary("week", filters),
    getFuelSummary("month", filters),
    getFuelSummary(period, costFilters),
    getFuelSummary("month", { truck: filters.truck, driver: filters.driver, from: monthStart, to: today }),
    getTrucks(),
    getEmployees({ team: "collecte" }),
  ]);
  const unit = t("DH");
  const monthSpend = currentMonth.reduce((s, r) => s + r.cost, 0);
  const drivers = collecte.filter((e) => DRIVER_POSITIONS.includes(e.position));
  const canEdit = user.permissions.rapport_camions.can_edit;
  const totals = entriesTotals(entries);
  const pdfParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) if (v) pdfParams[k] = v;
  const query = new URLSearchParams(pdfParams).toString();
  const costPdfParams: Record<string, string> = { ...pdfParams, vue: sp.vue && PERIOD_PARAM[sp.vue] ? sp.vue : "mois" };
  if (costFilters !== filters) Object.assign(costPdfParams, { from: costFilters.from!, to: costFilters.to! });

  const kpis = [
    { label: t("Dépense du mois en cours"), value: formatMoney(monthSpend, unit) },
    { label: t("Pleins"), value: String(totals.fills) },
    { label: t("Litres"), value: `${n(totals.liters)} L` },
    { label: t("Coût total"), value: formatMoney(totals.cost, unit) },
    { label: t("Km parcourus"), value: `${n(totals.distance_km, 0)} km` },
    { label: t("Consommation moyenne"), value: totals.l_per_100km == null ? "—" : `${n(totals.l_per_100km)} L/100 km` },
    { label: t("Coût aux 100 km"), value: formatMoney(totals.cost_per_100km, unit) },
  ];

  return (
    <div>
      <ModuleHeader title={t("Rapport camions")} subtitle={t("Carburant — {count} plein(s)", { count: entries.length })}>
        {canEdit && (
          <LinkButton href="/rapport-camions/carburant/nouveau" size="sm">
            <Plus /> {t("Nouveau plein")}
          </LinkButton>
        )}
        <LinkButton href={`/rapport-camions/carburant/photos${query ? `?${query}` : ""}`} size="sm" variant="secondary">
          <Images /> {t("Archive photos")}
        </LinkButton>
      </ModuleHeader>
      <TruckTabs active="carburant" />

      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="truck">{t("Matricule")}</Label>
          <NativeSelect id="truck" name="truck" defaultValue={filters.truck ?? ""}>
            <option value="">{t("Tous")}</option>
            {trucks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.matricule}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="driver">{t("Chauffeur")}</Label>
          <NativeSelect id="driver" name="driver" defaultValue={filters.driver ?? ""}>
            <option value="">{t("Tous")}</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.last_name} {d.first_name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">
            <Search /> {t("Filtrer")}
          </Button>
          <LinkButton href="/rapport-camions/carburant" variant="outline">
            {t("Tout")}
          </LinkButton>
        </div>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {t("Consommation calculée de plein à plein : litres du plein × 100 ÷ km parcourus depuis le plein précédent du même camion. Le premier plein d'un camion sert de référence.")}
      </p>

      <h2 className="mb-2 text-base font-semibold">{t("Pleins")}</h2>
      <div className="mb-6 overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Date")}</TableHead>
              <TableHead>{t("Matricule")}</TableHead>
              <TableHead>{t("Chauffeur")}</TableHead>
              <TableHead className="text-end">{t("Litres")}</TableHead>
              <TableHead className="text-end">{t("Coût ({unit})", { unit })}</TableHead>
              <TableHead className="text-end">{t("Prix / L ({unit})", { unit })}</TableHead>
              <TableHead className="text-end">{t("Compteur (km)")}</TableHead>
              <TableHead className="text-end">{t("Km parcourus")}</TableHead>
              <TableHead className="text-end">{t("L/100 km")}</TableHead>
              <TableHead className="text-end">{t("Photos")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  {t("Aucun plein enregistré.")}
                </TableCell>
              </TableRow>
            )}
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{formatDateFr(e.activity_date)}</TableCell>
                <TableCell className="font-mono">{e.truck?.matricule}</TableCell>
                <TableCell>{e.driver_name || "—"}</TableCell>
                <TableCell className="text-end tabular-nums">{n(e.liters)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatAmount(e.cost)}</TableCell>
                <TableCell className="text-end tabular-nums">{n(e.price_per_liter, 3)}</TableCell>
                <TableCell className="text-end tabular-nums">{n(e.odometer_km, 0)}</TableCell>
                <TableCell className="text-end tabular-nums">{e.distance_km == null ? t("1er plein") : n(e.distance_km, 0)}</TableCell>
                <TableCell className="text-end font-medium tabular-nums">{n(e.l_per_100km)}</TableCell>
                <TableCell className="text-end">{e.photos.length || ""}</TableCell>
                <TableCell>
                  <Link href={`/rapport-camions/carburant/${e.id}`} aria-label={canEdit ? t("Modifier") : t("Voir")}>
                    <Pencil className="size-4 text-muted-foreground" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CostStats
        pivot={costPivot(costRows)}
        period={period}
        baseQuery={pdfParams}
        note={costFilters !== filters ? t("Vue par jour : 31 derniers jours (choisissez une période avec Du / Au pour en voir d'autres).") : undefined}
        t={t}
        locale={locale}
        projectStart={projectStart}
      />

      <SummaryTable title={t("Consommation hebdomadaire")} rows={weekly} t={t} locale={locale} period="week" projectStart={projectStart} />
      <SummaryTable title={t("Consommation mensuelle")} rows={monthly} t={t} locale={locale} period="month" projectStart={projectStart} />

      <ModuleButtons
        pdfSlot={
          <>
            <PdfExportButton kind="carburant" params={pdfParams} />
            <PdfExportButton kind="carburant-couts" params={costPdfParams} label="PDF des coûts" />
          </>
        }
        monthlyHref="/rapport-camions/mensuel"
      />
    </div>
  );
}

function SummaryTable({ title, rows, t, locale, period, projectStart }: { title: string; rows: FuelSummaryRow[]; t: TFunction; locale: Locale; period: "week" | "month"; projectStart: string | null }) {
  // Une ligne par période et par camion, puis un total par période (tous camions)
  const periods = Array.from(new Set(rows.map((r) => r.period_start)));
  const label = (p: string) => (period === "week" ? t("Semaine du {date}", { date: formatDateFr(p) }) : formatWorkMonth(p.slice(0, 7), projectStart, locale));
  return (
    <>
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      <div className="mb-6 overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{period === "week" ? t("Semaine") : t("Mois")}</TableHead>
              <TableHead>{t("Matricule")}</TableHead>
              <TableHead className="text-end">{t("Pleins")}</TableHead>
              <TableHead className="text-end">{t("Litres")}</TableHead>
              <TableHead className="text-end">{t("Coût ({unit})", { unit: t("DH") })}</TableHead>
              <TableHead className="text-end">{t("Km parcourus")}</TableHead>
              <TableHead className="text-end">{t("L/100 km")}</TableHead>
              <TableHead className="text-end">{t("Coût aux 100 km ({unit})", { unit: t("DH") })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {t("Aucune donnée.")}
                </TableCell>
              </TableRow>
            )}
            {periods.map((p) => {
              const list = rows.filter((r) => r.period_start === p);
              const tot = fuelTotals(list);
              return [
                ...list.map((r) => (
                  <TableRow key={`${p}-${r.truck_id}`}>
                    <TableCell>{label(p)}</TableCell>
                    <TableCell className="font-mono">{r.truck?.matricule}</TableCell>
                    <TableCell className="text-end tabular-nums">{r.fills}</TableCell>
                    <TableCell className="text-end tabular-nums">{n(r.liters)}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatAmount(r.cost)}</TableCell>
                    <TableCell className="text-end tabular-nums">{n(r.distance_km, 0)}</TableCell>
                    <TableCell className="text-end font-medium tabular-nums">{n(r.l_per_100km)}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatAmount(r.cost_per_100km)}</TableCell>
                  </TableRow>
                )),
                list.length > 1 ? (
                  <TableRow key={`${p}-total`} className="bg-muted/50 font-medium">
                    <TableCell>{label(p)}</TableCell>
                    <TableCell>{t("Tous les camions")}</TableCell>
                    <TableCell className="text-end tabular-nums">{tot.fills}</TableCell>
                    <TableCell className="text-end tabular-nums">{n(tot.liters)}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatAmount(tot.cost)}</TableCell>
                    <TableCell className="text-end tabular-nums">{n(tot.distance_km, 0)}</TableCell>
                    <TableCell className="text-end tabular-nums">{n(tot.l_per_100km)}</TableCell>
                    <TableCell />
                  </TableRow>
                ) : null,
              ];
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
