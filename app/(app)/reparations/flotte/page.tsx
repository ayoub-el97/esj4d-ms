import Link from "next/link";
import { AlertTriangle, Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getFleetOverview, type FleetTruck } from "@/lib/data/repairs";
import { getProjectStart } from "@/lib/data/settings";
import { formatDateFr, formatWorkMonth, isMonth, todayISO, workMonthOf } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { LinkButton } from "@/components/link-button";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertBadge, FLEET_STATE_LABELS, alertReasonTexts } from "@/components/fleet-alerts";
import { resolveRepairPeriod } from "../period";
import { FLEET_FILTERS, applyFleetFilter } from "@/lib/fleet-filters";

export const generateMetadata = pageTitle("État de la flotte");

const ALERT_ROW: Record<string, string> = { rouge: "border-s-4 border-s-red-500", orange: "border-s-4 border-s-orange-400", vert: "border-s-4 border-s-transparent" };

export default async function FleetPage({ searchParams }: { searchParams: Promise<{ etat?: string; mois?: string }> }) {
  const [, { t, locale }] = await Promise.all([requireModule("rapport_camions"), getI18n()]);
  const sp = await searchParams;
  const projectStart = await getProjectStart();
  const today = todayISO();
  const mois = isMonth(sp.mois) ? sp.mois : workMonthOf(today, projectStart);
  const { from, to } = resolveRepairPeriod({ mois }, projectStart) as { from: string; to: string };
  const etat = FLEET_FILTERS.some((f) => f.key === sp.etat) ? sp.etat! : "tous";
  const fleet = await getFleetOverview(from, to);
  const unit = t("DH");
  const sorted = [...fleet.trucks].sort((a, b) => ["rouge", "orange", "vert"].indexOf(a.alert) - ["rouge", "orange", "vert"].indexOf(b.alert) || b.currentDays - a.currentDays || a.truck.matricule.localeCompare(b.truck.matricule));
  const shown = applyFleetFilter(sorted, etat);
  const out = fleet.trucks.filter((tr) => tr.state !== "en_service");
  const issues = fleet.trucks.flatMap((tr) => tr.issues.map((i) => ({ tr, i })));

  const kpis = [
    { label: t("Camions hors service"), value: out.length, cls: out.length ? "text-red-700 dark:text-red-400" : "" },
    { label: t("En panne"), value: fleet.trucks.filter((tr) => tr.state === "en_panne").length, cls: "" },
    { label: t("En réparation"), value: fleet.trucks.filter((tr) => tr.state === "en_reparation").length, cls: "" },
    { label: t("Jours d'immobilisation en cours (total)"), value: out.reduce((s, tr) => s + tr.currentDays, 0), cls: "" },
    { label: t("Alertes rouges / orange"), value: `${fleet.trucks.filter((tr) => tr.alert === "rouge").length} / ${fleet.trucks.filter((tr) => tr.alert === "orange").length}`, cls: "" },
  ];
  const top = (list: FleetTruck[], value: (tr: FleetTruck) => number, fmt: (n: number) => string) =>
    list
      .filter((tr) => value(tr) > 0)
      .sort((a, b) => value(b) - value(a))
      .slice(0, 5)
      .map((tr) => (
        <li key={tr.truck_id} className="flex justify-between gap-2 text-sm">
          <Link href={`/reparations/camion/${tr.truck_id}`} className="font-mono font-medium hover:underline">
            {tr.truck.matricule}
          </Link>
          <span className="font-semibold tabular-nums">{fmt(value(tr))}</span>
        </li>
      ));
  const empty = <li className="text-sm text-muted-foreground">{t("Aucun")}</li>;
  const longest = top(out, (tr) => tr.currentDays, (n) => t("{count} j", { count: n }));
  const mostIncidents = top(fleet.trucks, (tr) => tr.period?.incidents ?? 0, (n) => t("{count} panne(s)", { count: n }));
  const mostExpenses = top(fleet.trucks, (tr) => tr.expenses, (n) => formatMoney(n, unit));

  return (
    <div>
      <ModuleHeader title={t("État de la flotte")} subtitle={t("Camions hors service, jours d'immobilisation et alertes — au {date}", { date: formatDateFr(today) })} backHref="/reparations" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", k.cls)}>{k.value}</p>
          </div>
        ))}
      </div>

      <form className="no-print mb-4 grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="space-y-1">
          <Label htmlFor="etat">{t("Afficher")}</Label>
          <NativeSelect id="etat" name="etat" defaultValue={etat}>
            {FLEET_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {t(f.label)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mois">{t("Période des statistiques")}</Label>
          <Input id="mois" name="mois" type="month" defaultValue={mois} />
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> {t("Afficher")}
          </Button>
        </div>
      </form>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold">{t("Immobilisations en cours les plus longues")}</h2>
          <ol className="space-y-1">{longest.length ? longest : empty}</ol>
        </section>
        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold">{t("Le plus de pannes — {period}", { period: formatWorkMonth(mois, projectStart, locale) })}</h2>
          <ol className="space-y-1">{mostIncidents.length ? mostIncidents : empty}</ol>
        </section>
        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold">{t("Dépenses de réparation les plus élevées — {period}", { period: formatWorkMonth(mois, projectStart, locale) })}</h2>
          <ol className="space-y-1">{mostExpenses.length ? mostExpenses : empty}</ol>
        </section>
      </div>

      {issues.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-medium">
            <AlertTriangle className="me-1 inline size-4" />
            {t("Dossiers à vérifier :")}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {issues.map(({ tr, i }, k) => (
              <li key={k}>
                <Link href={`/reparations/camion/${tr.truck_id}`} className="font-mono underline-offset-2 hover:underline">
                  {tr.truck.matricule}
                </Link>{" "}
                — {i.kind === "plusieurs_ouvertes" ? t("{count} pannes ouvertes en même temps : clôturez ou corrigez les doublons.", { count: i.ids.length }) : t("deux immobilisations se chevauchent (les jours communs ne sont comptés qu'une fois).")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Matricule")}</TableHead>
              <TableHead>{t("Statut")}</TableHead>
              <TableHead>{t("Alerte")}</TableHead>
              <TableHead>{t("Hors service depuis")}</TableHead>
              <TableHead className="text-end">{t("Jours hors service")}</TableHead>
              <TableHead className="text-end">{t("Pannes ({days} j)", { days: fleet.rules.windowDays })}</TableHead>
              <TableHead>{t("Remise en service prévue")}</TableHead>
              <TableHead className="text-end">{t("Jours d'immobilisation (période)")}</TableHead>
              <TableHead className="text-end">{t("Dépenses (période)")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  {t("Aucun camion pour ce filtre.")}
                </TableCell>
              </TableRow>
            )}
            {shown.map((tr) => {
              const expected = tr.open.map((r) => r.expected_return_date).filter(Boolean).sort()[0] ?? null;
              return (
                <TableRow key={tr.truck_id} className={ALERT_ROW[tr.alert]}>
                  <TableCell className="font-mono font-semibold">
                    <Link href={`/reparations/camion/${tr.truck_id}`} className="hover:underline">
                      {tr.truck.matricule}
                    </Link>
                    <span className="block font-sans text-xs font-normal text-muted-foreground">{[tr.truck.brand, tr.truck.model].filter(Boolean).join(" ")}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{t(FLEET_STATE_LABELS[tr.state])}</TableCell>
                  <TableCell>
                    <AlertBadge level={tr.alert} t={t} />
                    {tr.alertReasons.length > 0 && <span className="mt-0.5 block text-xs text-muted-foreground">{alertReasonTexts(t, tr, fleet.rules).join(" ; ")}</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{tr.since ? formatDateFr(tr.since) : "—"}</TableCell>
                  <TableCell className="text-end font-semibold tabular-nums">{tr.state === "en_service" ? "—" : t("{count} j", { count: tr.currentDays })}</TableCell>
                  <TableCell className="text-end tabular-nums">{tr.recentCount}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {expected ? formatDateFr(expected) : "—"}
                    {tr.overdue && <span className="ms-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">{t("en retard")}</span>}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{tr.period?.downtimeDays ?? 0}</TableCell>
                  <TableCell className="text-end tabular-nums">{tr.expenses ? formatMoney(tr.expenses, unit) : "—"}</TableCell>
                  <TableCell>
                    <LinkButton href={`/reparations/camion/${tr.truck_id}`} size="sm" variant="ghost">
                      {t("Historique")}
                    </LinkButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("Jours calendaires, jour d'immobilisation et jour de remise en service inclus ; le compteur avance seul chaque jour tant que la panne n'est pas réparée. Alerte orange : panne en cours depuis {od} j ou plus, ou {oc} pannes ou plus en {w} j. Alerte rouge : {rd} j ou plus, ou {rc} pannes ou plus. Seuils modifiables dans Paramètres › Réglages.", {
          od: fleet.rules.orangeDays,
          oc: fleet.rules.orangeCount,
          w: fleet.rules.windowDays,
          rd: fleet.rules.redDays,
          rc: fleet.rules.redCount,
        })}
      </p>

      <ModuleButtons pdfSlot={<PdfExportButton kind="flotte" params={{ mois, etat }} />} monthlyHref={`/reparations/rapport?mois=${mois}`} extra={<LinkButton href="/reparations" variant="outline">{t("Liste des réparations")}</LinkButton>} />
    </div>
  );
}
