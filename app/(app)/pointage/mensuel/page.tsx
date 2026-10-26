import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, History, ListChecks, RefreshCw } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getFinalizedPeriods, getLiveGrid, getPeriodSnapshots, getPeriodStartDay } from "@/lib/data/attendance-grid";
import { getSettings, logoUrl } from "@/lib/data/settings";
import { attendancePeriod, diffGrids, filterGrid, periodMonthOf, shiftMonth, CODE_DEF } from "@/lib/attendance-grid";
import { formatDateFr, formatDateTimeFr, formatMonthFr, isMonth, todayISO } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ATTENDANCE_STATUS_LABELS, POSITION_LABELS, TEAM_SLUGS, type AttendanceStatus, type Position, ALL_POSITIONS } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { LinkButton } from "@/components/link-button";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GridLegend, GridTable } from "./grid-table";
import { FinalizePanel } from "./finalize-panel";
import { MonthlyTabs } from "./tabs";

export const generateMetadata = pageTitle("Rapport mensuel de pointage");

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function MonthlyGridPage({ searchParams }: { searchParams: Promise<{ mois?: string; equipe?: string; poste?: string; q?: string; version?: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("pointage"), getI18n()]);
  const sp = await searchParams;
  const startDay = await getPeriodStartDay();
  const today = todayISO();
  const month = isMonth(sp.mois) ? sp.mois : periodMonthOf(today, startDay);
  const team = sp.equipe ? TEAM_SLUGS[sp.equipe] : undefined;
  const position = ALL_POSITIONS.includes(sp.poste as Position) ? (sp.poste as Position) : undefined;
  const q = (sp.q ?? "").slice(0, 60);

  const [live, snapshots, finalized, settings] = await Promise.all([getLiveGrid(month, startDay), getPeriodSnapshots(month), getFinalizedPeriods(), getSettings()]);
  const latest = snapshots[0] ?? null;
  const wantLive = sp.version === "actuel";
  const selected = wantLive ? null : sp.version ? (snapshots.find((s) => String(s.revision) === sp.version) ?? latest) : latest;
  const base = selected ? selected.data : live;
  const grid = filterGrid(base, { team, position, q });
  const changes = latest ? diffGrids(latest.data, live) : [];
  const canEdit = user.permissions.pointage.can_edit;
  const ended = live.to <= today;
  const monthName = capitalize(formatMonthFr(month, locale));
  const logo = logoUrl(settings.company_logo_path);

  const filterParams = { ...(team ? { equipe: team } : {}), ...(position ? { poste: position } : {}), ...(q ? { q } : {}) };
  const href = (extra: Record<string, string>) => `/pointage/mensuel?${new URLSearchParams({ mois: month, ...filterParams, ...extra }).toString()}`;
  const monthHref = (m: string) => `/pointage/mensuel?${new URLSearchParams({ mois: m, ...filterParams }).toString()}`;

  // Historique : 12 dernières périodes + périodes finalisées plus anciennes
  const finalizedByMonth = new Map(finalized.map((f) => [f.month, f]));
  const currentMonth = periodMonthOf(today, startDay);
  const historyMonths = [...new Set([...Array.from({ length: 12 }, (_, i) => shiftMonth(currentMonth, -i)), ...finalized.map((f) => f.month)])].sort().reverse();

  return (
    <div>
      <ModuleHeader title={t("Rapport mensuel de pointage")} subtitle={t("{month} — du {from} au {to}", { month: monthName, from: formatDateFr(live.from), to: formatDateFr(live.to) })} backHref="/pointage">
        <div className="flex items-center gap-1">
          <LinkButton href={monthHref(shiftMonth(month, -1))} variant="outline" size="icon-sm" aria-label={t("Période précédente")}>
            <ChevronLeft className="rtl:rotate-180" />
          </LinkButton>
          <LinkButton href={monthHref(shiftMonth(month, 1))} variant="outline" size="icon-sm" aria-label={t("Période suivante")}>
            <ChevronRight className="rtl:rotate-180" />
          </LinkButton>
        </div>
      </ModuleHeader>

      <MonthlyTabs active="grille" month={month} t={t} />

      {/* Filtres (formulaire simple : le rapport est recalculé depuis le Pointage à chaque affichage) */}
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
            {ALL_POSITIONS.map((p) => (
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
        {sp.version && <input type="hidden" name="version" value={sp.version} />}
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            <RefreshCw /> {t("Générer / actualiser")}
          </Button>
        </div>
      </form>

      {/* État de la période */}
      <div className="no-print mb-4 space-y-2">
        {!latest && !ended && (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
            {t("Période en cours : la grille est calculée en direct depuis le Pointage et se met à jour à chaque saisie ou correction.")}
          </p>
        )}
        {!latest && ended && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="flex-1">{t("Période terminée, non finalisée : la grille reflète toujours le Pointage actuel. Finalisez-la pour conserver la version officielle dans l'historique.")}</span>
            {canEdit && <FinalizePanel month={month} alreadyFinalized={false} />}
          </div>
        )}
        {latest && (
          <div className="space-y-2 rounded-lg border bg-card px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{t("Finalisée")}</Badge>
              <span>
                {t("Version {n} du {date} par {name}", { n: latest.revision, date: formatDateTimeFr(latest.created_at), name: latest.created_by_name || "—" })}
                {latest.reason && <span className="text-muted-foreground"> — {latest.reason}</span>}
              </span>
              <span className="ms-auto flex flex-wrap gap-2">
                {selected ? (
                  <LinkButton href={href({ version: "actuel" })} variant="outline" size="sm">
                    {t("Voir les données actuelles du Pointage")}
                  </LinkButton>
                ) : (
                  <LinkButton href={href({})} variant="outline" size="sm">
                    {t("Voir la version finalisée")}
                  </LinkButton>
                )}
              </span>
            </div>
            {selected && selected.revision !== latest.revision && (
              <p className="text-amber-800 dark:text-amber-300">{t("Vous consultez la version {n} (ancienne version).", { n: selected.revision })}</p>
            )}
            {!selected && <p className="text-sky-800 dark:text-sky-300">{t("Affichage des données actuelles du Pointage (non finalisées).")}</p>}
            {changes.length > 0 ? (
              <details className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <summary className="cursor-pointer font-medium">
                  <AlertTriangle className="me-1 inline size-4" />
                  {t("{count} différence(s) entre la version finalisée et le Pointage actuel", { count: changes.length })}
                </summary>
                <ul className="mt-2 max-h-48 space-y-0.5 overflow-auto text-xs">
                  {changes.slice(0, 200).map((c, i) => (
                    <li key={i}>
                      {c.name} — {c.date ? formatDateFr(c.date) : t("nouvel employé dans la période ({count} jour(s) pointé(s))", { count: c.after })} {c.date && <>: {c.before} → {c.after}</>}
                    </li>
                  ))}
                </ul>
                {canEdit && (
                  <div className="mt-2">
                    <FinalizePanel month={month} alreadyFinalized />
                  </div>
                )}
              </details>
            ) : (
              <p className="text-muted-foreground">{t("Aucune différence avec le Pointage actuel.")}</p>
            )}
            {snapshots.length > 1 && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <History className="size-3.5" /> {t("Versions :")}
                {snapshots.map((s) => (
                  <Link key={s.id} href={href({ version: String(s.revision) })} className={s.id === selected?.id ? "font-semibold text-foreground underline" : "underline-offset-2 hover:underline"} title={s.reason || undefined}>
                    v{s.revision} ({formatDateFr(s.created_at.slice(0, 10))})
                  </Link>
                ))}
              </p>
            )}
          </div>
        )}
      </div>

      {/* En-tête du rapport (modèle EST-4D) */}
      <div className="mb-3 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt={settings.company_name} className="size-16 shrink-0 object-contain" /> : <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-primary text-2xl font-bold text-primary-foreground">{settings.company_name.slice(0, 1)}</div>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            <dt className="text-muted-foreground">{t("Mois")}</dt>
            <dd className="font-semibold">{monthName}</dd>
            <dt className="text-muted-foreground">{t("Date début")}</dt>
            <dd>{formatDateFr(live.from)}</dd>
            <dt className="text-muted-foreground">{t("Date fin")}</dt>
            <dd>{formatDateFr(live.to)}</dd>
            <dt className="text-muted-foreground">{t("Date d'aujourd'hui")}</dt>
            <dd>{formatDateFr(today)}</dd>
          </dl>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold">{t("Rapport mensuel de pointage")}</p>
          <p className="text-base">
            {t("Du")} <span className="font-semibold">{formatDateFr(live.from)}</span> {t("Au")} <span className="font-semibold">{formatDateFr(live.to)}</span>
          </p>
          <p className="text-xs text-muted-foreground">{t("{count} jour(s) · {employees} employé(s)", { count: live.dates.length, employees: grid.rows.length })}</p>
        </div>
        <div className="text-sm sm:text-end">
          <p className="font-semibold">{settings.company_name}</p>
          <p className="text-muted-foreground">{settings.agency_name}</p>
          {!logo && user.permissions.parametres.can_edit && (
            <Link href="/profil" className="no-print text-xs text-primary underline-offset-2 hover:underline">
              {t("Ajouter le logo de l'entreprise")}
            </Link>
          )}
        </div>
      </div>

      <GridTable grid={grid} t={t} today={today} locale={locale} />

      <div className="mt-3 space-y-3">
        <GridLegend t={t} extraCodes={grid.extraCodes} />
        {grid.extraCodes.length > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {t("Statut du Pointage hors liste de référence : {list}. Il est affiché tel quel et totalisé à part (jamais converti en un autre code) ; indiquez-nous le code officiel à lui attribuer si nécessaire.", {
              list: grid.extraCodes.map((c) => `${c} = ${t(CODE_DEF[c].label)}`).join(", "),
            })}
          </p>
        )}
        {grid.issues.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            <p className="font-medium">
              <ListChecks className="me-1 inline size-4" />
              {t("{count} pointage(s) à vérifier (non comptés dans les totaux) :", { count: grid.issues.length })}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {grid.issues.slice(0, 100).map((i) => {
                const row = grid.rows.find((r) => r.id === i.employee_id);
                return (
                  <li key={`${i.employee_id}-${i.date}`}>
                    <Link href={`/pointage/${row?.team_type ?? "collecte"}?date=${i.date}`} className="underline-offset-2 hover:underline">
                      {i.name} — {formatDateFr(i.date)}
                    </Link>{" "}
                    : {i.kind === "conflit" ? t("statuts différents le même jour") : t("statut sans code")} ({i.statuses.map((s) => (s in ATTENDANCE_STATUS_LABELS ? t(ATTENDANCE_STATUS_LABELS[s as AttendanceStatus]) : s)).join(" / ")})
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t("Codes calculés depuis le Pointage : un jour férié travaillé (Présent ou Repos travaillé à une date fériée) = JFT ; un congé approuvé apparaît en CP (sauf modification autorisée). Une case = un employé et une date, comptée une seule fois ; ×2 = deux services le même jour. Les cases vides ne sont jamais comptées.")}
        </p>
      </div>

      {/* Historique des périodes */}
      <section className="no-print mt-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
          <History className="size-4" /> {t("Périodes précédentes")}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {historyMonths.map((m) => {
            const p = attendancePeriod(m, startDay);
            const f = finalizedByMonth.get(m);
            return (
              <Link key={m} href={monthHref(m)} className={`flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition hover:border-primary/40 ${m === month ? "border-primary ring-1 ring-primary" : ""}`}>
                <span>
                  <span className="font-medium">{capitalize(formatMonthFr(m, locale))}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDateFr(p.from)} → {formatDateFr(p.to)}
                  </span>
                </span>
                {f ? <Badge>{t("Finalisée v{n}", { n: f.revision })}</Badge> : p.to > today ? <Badge variant="secondary">{t("En cours")}</Badge> : <Badge variant="outline">{t("Non finalisée")}</Badge>}
              </Link>
            );
          })}
        </div>
      </section>

      <ModuleButtons
        pdfSlot={<PdfExportButton kind="pointage-grille" params={{ mois: month, ...filterParams, ...(sp.version ? { version: sp.version } : {}) }} />}
        historyHref="/pointage/historique"
        extra={
          <LinkButton href={`/pointage/mensuel/synthese?mois=${month}`} variant="outline">
            {t("Synthèse (jours travaillés, HS…)")}
          </LinkButton>
        }
      />
    </div>
  );
}
