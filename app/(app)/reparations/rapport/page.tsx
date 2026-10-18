import Link from "next/link";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getTrucks } from "@/lib/data/employees";
import { getDowntimeReport, getRepairExpenseReport } from "@/lib/data/repairs";
import { getProjectStart } from "@/lib/data/settings";
import { formatDateFr, formatWorkMonth, isISODate, isMonth, todayISO, workMonthOf } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { formatAmount, formatMoney } from "@/lib/money";
import { REPAIR_STATUS_LABELS } from "@/lib/repair-types";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveRepairPeriod } from "../period";

export const generateMetadata = pageTitle("Dépenses de réparation des camions");

type SP = { vue?: string; mois?: string; annee?: string; from?: string; to?: string; truck?: string };

export default async function RepairReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [, { t, locale }] = await Promise.all([requireModule("rapport_camions"), getI18n()]);
  const sp = await searchParams;
  const projectStart = await getProjectStart();
  const today = todayISO();
  const vue = sp.vue === "annee" || sp.vue === "periode" ? sp.vue : "mois";
  const mois = isMonth(sp.mois) ? sp.mois : workMonthOf(today, projectStart);
  const annee = sp.annee && /^\d{4}$/.test(sp.annee) ? sp.annee : today.slice(0, 4);
  const periodFrom = isISODate(sp.from) ? sp.from : `${today.slice(0, 4)}-01-01`;
  const periodTo = isISODate(sp.to) ? sp.to : today;
  const period =
    vue === "mois" ? resolveRepairPeriod({ mois }, projectStart) : vue === "annee" ? resolveRepairPeriod({ annee }, projectStart) : resolveRepairPeriod({ from: periodFrom, to: periodTo }, projectStart);
  const from = period.from!;
  const to = period.to!;
  const [report, trucks, downtime] = await Promise.all([getRepairExpenseReport(from, to, sp.truck || undefined), getTrucks(), getDowntimeReport(from, to, sp.truck || undefined)]);
  const spentByTruck = new Map(report.rows.map((r) => [r.truck_id, r.total]));
  const dtTotals = downtime.rows.reduce(
    (a, r) => ({ incidents: a.incidents + r.incidents, days: a.days + r.downtimeDays, openEnd: a.openEnd + r.openAtEnd, openEndDays: a.openEndDays + r.openAtEndDays, closed: a.closed + r.closedInPeriod, closedDays: a.closedDays + (r.avgClosedDays ?? 0) * r.closedInPeriod }),
    { incidents: 0, days: 0, openEnd: 0, openEndDays: 0, closed: 0, closedDays: 0 },
  );
  const unit = t("DH");
  const title = vue === "mois" ? formatWorkMonth(mois, projectStart, locale) : vue === "annee" ? t("Année {year}", { year: annee }) : t("du {from} au {to}", { from: formatDateFr(from), to: formatDateFr(to) });
  const pdfParams: Record<string, string> = { vue, from, to };
  if (vue === "mois") pdfParams.mois = mois;
  if (vue === "annee") pdfParams.annee = annee;
  if (sp.truck) pdfParams.truck = sp.truck;
  const max = Math.max(1, ...report.rows.map((r) => r.total));
  const tabs = [
    { key: "mois", label: t("Mensuel") },
    { key: "annee", label: t("Annuel") },
    { key: "periode", label: t("Période libre") },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <ModuleHeader title={t("Dépenses de réparation des camions")} subtitle={title} backHref="/reparations" />

      <div className="mb-3 flex gap-1 rounded-lg border bg-card p-0.5 text-sm">
        {tabs.map((v) => (
          <Link key={v.key} href={`/reparations/rapport?vue=${v.key}${sp.truck ? `&truck=${sp.truck}` : ""}`} className={cn("flex-1 rounded-md px-3 py-1.5 text-center", vue === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            {v.label}
          </Link>
        ))}
      </div>

      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
        <input type="hidden" name="vue" value={vue} />
        {vue === "mois" && (
          <div className="space-y-1">
            <Label htmlFor="mois">{t("Mois")}</Label>
            <Input id="mois" name="mois" type="month" defaultValue={mois} />
          </div>
        )}
        {vue === "annee" && (
          <div className="space-y-1">
            <Label htmlFor="annee">{t("Année")}</Label>
            <Input id="annee" name="annee" type="number" min="2000" max="2100" defaultValue={annee} />
          </div>
        )}
        {vue === "periode" && (
          <>
            <div className="space-y-1">
              <Label htmlFor="from">{t("Du")}</Label>
              <Input id="from" name="from" type="date" defaultValue={periodFrom} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">{t("Au")}</Label>
              <Input id="to" name="to" type="date" defaultValue={periodTo} />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label htmlFor="truck">{t("Camion")}</Label>
          <NativeSelect id="truck" name="truck" defaultValue={sp.truck ?? ""}>
            <option value="">{t("Toute la flotte")}</option>
            {trucks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.matricule}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> {t("Calculer")}
          </Button>
        </div>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{t("Total dépensé (flotte)")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(report.total, unit)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{t("Réparations comptées")}</p>
          <p className="mt-1 text-2xl font-bold">{report.repairs}</p>
        </div>
        <div className="col-span-2 rounded-xl border bg-card p-4 shadow-sm sm:col-span-1">
          <p className="text-xs text-muted-foreground">{t("Camions concernés")}</p>
          <p className="mt-1 text-2xl font-bold">{report.rows.length}</p>
        </div>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {t("Seules les dépenses réelles sont comptées : coût saisi et date de réparation, statut En réparation ou Réparé (ou Annulé avec frais engagés). Les dossiers « En panne » ne sont pas comptés. Chaque réparation est comptée une seule fois, dans le mois de sa date de réparation.")}
      </p>

      <h2 className="mb-2 text-base font-semibold">{t("Immobilisation par camion")}</h2>
      <div className="mb-2 overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Matricule")}</TableHead>
              <TableHead className="text-end">{t("Pannes (début dans la période)")}</TableHead>
              <TableHead className="text-end">{t("Jours d'immobilisation dans la période")}</TableHead>
              <TableHead className="text-end">{t("Pannes ouvertes à la fin de la période")}</TableHead>
              <TableHead className="text-end">{t("dont jours dans la période")}</TableHead>
              <TableHead className="text-end">{t("Pannes réparées")}</TableHead>
              <TableHead className="text-end">{t("Durée moyenne (j)")}</TableHead>
              <TableHead className="text-end">{t("Dépenses ({unit})", { unit })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {downtime.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {t("Aucune immobilisation sur cette période.")}
                </TableCell>
              </TableRow>
            )}
            {downtime.rows.map((r) => (
              <TableRow key={r.truck_id}>
                <TableCell className="font-mono font-semibold">
                  <Link href={`/reparations/camion/${r.truck_id}`} className="hover:underline">
                    {r.truck?.matricule}
                  </Link>
                </TableCell>
                <TableCell className="text-end">{r.incidents}</TableCell>
                <TableCell className="text-end font-semibold">{r.downtimeDays}</TableCell>
                <TableCell className={cn("text-end", r.openAtEnd > 0 && "font-semibold text-orange-700 dark:text-orange-400")}>{r.openAtEnd}</TableCell>
                <TableCell className="text-end">{r.openAtEndDays}</TableCell>
                <TableCell className="text-end">{r.closedInPeriod}</TableCell>
                <TableCell className="text-end">{r.avgClosedDays ?? "—"}</TableCell>
                <TableCell className="text-end tabular-nums">{formatAmount(spentByTruck.get(r.truck_id) ?? 0)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {downtime.rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell>{t("Total")}</TableCell>
                <TableCell className="text-end">{dtTotals.incidents}</TableCell>
                <TableCell className="text-end">{dtTotals.days}</TableCell>
                <TableCell className="text-end">{dtTotals.openEnd}</TableCell>
                <TableCell className="text-end">{dtTotals.openEndDays}</TableCell>
                <TableCell className="text-end">{dtTotals.closed}</TableCell>
                <TableCell className="text-end">{dtTotals.closed ? Math.round((dtTotals.closedDays / dtTotals.closed) * 10) / 10 : "—"}</TableCell>
                <TableCell className="text-end tabular-nums">{formatMoney(report.total, unit)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      <p className="mb-6 text-xs text-muted-foreground">
        {t("Jours calendaires, jour d'immobilisation et jour de remise en service inclus. Une panne commencée avant la période ou encore ouverte n'est comptée que pour les jours compris dans la période (jusqu'à aujourd'hui) ; deux immobilisations qui se chevauchent sur le même camion ne comptent qu'une fois les jours communs. Durée moyenne : pannes réparées dans la période.")}
      </p>

      <h2 className="mb-2 text-base font-semibold">{t("Dépenses par camion")}</h2>
      <div className="mb-6 overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Matricule")}</TableHead>
              <TableHead>{t("Marque / modèle")}</TableHead>
              <TableHead className="text-end">{t("Nombre de réparations")}</TableHead>
              <TableHead className="text-end">{t("Total des dépenses ({unit})", { unit })}</TableHead>
              <TableHead>{t("Détail des réparations")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("Aucune dépense de réparation sur cette période.")}
                </TableCell>
              </TableRow>
            )}
            {report.rows.map((r) => (
              <TableRow key={r.truck_id} className="align-top">
                <TableCell className="font-mono font-semibold">
                  <Link href={`/reparations/camion/${r.truck_id}`} className="hover:underline">
                    {r.truck?.matricule}
                  </Link>
                </TableCell>
                <TableCell>{[r.truck?.brand, r.truck?.model].filter(Boolean).join(" ") || "—"}</TableCell>
                <TableCell className="text-end">{r.repairs}</TableCell>
                <TableCell className="text-end font-semibold tabular-nums">{formatAmount(r.total)}</TableCell>
                <TableCell>
                  <ul className="space-y-1 text-xs">
                    {r.items.map((it) => (
                      <li key={it.id}>
                        <Link href={`/reparations/${it.id}`} className="hover:underline">
                          {formatDateFr(it.date)} — {formatMoney(it.cost, unit)}
                        </Link>
                        <span className="text-muted-foreground">
                          {" "}
                          · {t(REPAIR_STATUS_LABELS[it.status])} · {it.description.slice(0, 60)}
                          {it.receipts ? ` · ${t("{count} reçu(s)", { count: it.receipts })}` : ` · ${t("sans reçu")}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {report.rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>{t("Total")}</TableCell>
                <TableCell className="text-end">{report.repairs}</TableCell>
                <TableCell className="text-end tabular-nums">{formatMoney(report.total, unit)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {report.rows.length > 0 && (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold">{t("Camions les plus coûteux à entretenir")}</h2>
            <ol className="space-y-2">
              {report.rows.slice(0, 5).map((r, i) => (
                <li key={r.truck_id} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span>
                      {i + 1}. <span className="font-mono font-medium">{r.truck?.matricule}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{formatMoney(r.total, unit)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.round((r.total / max) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          </section>
          {vue !== "mois" && (
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-base font-semibold">{t("Dépenses par mois")}</h2>
              <Table>
                <TableBody>
                  {report.byMonth.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell>{formatWorkMonth(m.month, projectStart, locale)}</TableCell>
                      <TableCell className="text-end">{t("{count} réparation(s)", { count: m.repairs })}</TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">{formatMoney(m.total, unit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}
        </div>
      )}

      <ModuleButtons
        pdfSlot={<PdfExportButton kind="reparations-depenses" params={pdfParams} />}
        extra={
          <>
            <LinkButton href="/reparations" variant="outline">
              {t("Liste des réparations")}
            </LinkButton>
            <LinkButton href="/reparations/flotte" variant="outline">
              {t("État de la flotte")}
            </LinkButton>
          </>
        }
      />
    </div>
  );
}
