import Link from "next/link";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getPurchaseReport } from "@/lib/data/purchases";
import { getProjectStart } from "@/lib/data/settings";
import { formatDateFr, formatWorkMonth, isISODate, isMonth, todayISO, workMonthOf } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { formatAmount, formatMoney } from "@/lib/money";
import { PAYMENT_STATUS_LABELS, PURCHASE_CATEGORY_LABELS, PURCHASE_UNIT_LABELS, type PurchaseCategory, type PurchaseUnit } from "@/lib/purchase-types";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolvePurchasePeriod } from "../period";

export const generateMetadata = pageTitle("Rapports des achats de matériel");

type SP = { vue?: string; mois?: string; annee?: string; from?: string; to?: string };

export default async function PurchaseReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [, { t, locale }] = await Promise.all([requireModule("achats"), getI18n()]);
  const sp = await searchParams;
  const projectStart = await getProjectStart();
  const today = todayISO();
  const vue = sp.vue === "annee" || sp.vue === "periode" ? sp.vue : "mois";
  const mois = isMonth(sp.mois) ? sp.mois : workMonthOf(today, projectStart);
  const annee = sp.annee && /^\d{4}$/.test(sp.annee) ? sp.annee : today.slice(0, 4);
  const pFrom = isISODate(sp.from) ? sp.from : `${today.slice(0, 4)}-01-01`;
  const pTo = isISODate(sp.to) ? sp.to : today;
  const period = resolvePurchasePeriod(vue === "mois" ? { mois } : vue === "annee" ? { annee } : { from: pFrom, to: pTo }, projectStart);
  const r = await getPurchaseReport(period.from!, period.to!);
  const unit = t("DH");
  const title = vue === "mois" ? t("Rapport mensuel des achats de matériel") : vue === "annee" ? t("Rapport annuel des achats de matériel") : t("Rapport des achats de matériel");
  const subtitle = vue === "mois" ? formatWorkMonth(mois, projectStart, locale) : vue === "annee" ? t("Année {year}", { year: annee }) : t("du {from} au {to}", { from: formatDateFr(period.from), to: formatDateFr(period.to) });
  const pdfParams: Record<string, string> = { vue, from: period.from!, to: period.to! };
  if (vue === "mois") pdfParams.mois = mois;
  if (vue === "annee") pdfParams.annee = annee;
  const maxMonth = Math.max(1, ...r.byMonth.map((m) => Math.max(m.value, m.paid)));
  const tabs = [
    { key: "mois", label: t("Mensuel") },
    { key: "annee", label: t("Annuel") },
    { key: "periode", label: t("Période libre") },
  ];
  const unitText = (u: string) => (u in PURCHASE_UNIT_LABELS ? t(PURCHASE_UNIT_LABELS[u as PurchaseUnit]) : u);

  return (
    <div className="mx-auto max-w-6xl">
      <ModuleHeader title={title} subtitle={subtitle} backHref="/achats" />
      <div className="mb-3 flex gap-1 rounded-lg border bg-card p-0.5 text-sm">
        {tabs.map((v) => (
          <Link key={v.key} href={`/achats/rapport?vue=${v.key}`} className={cn("flex-1 rounded-md px-3 py-1.5 text-center", vue === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            {v.label}
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
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
              <Input id="from" name="from" type="date" defaultValue={pFrom} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">{t("Au")}</Label>
              <Input id="to" name="to" type="date" defaultValue={pTo} />
            </div>
          </>
        )}
        <Button type="submit">
          <Search /> {t("Calculer")}
        </Button>
      </form>

      <div className="mb-2 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: t("Nombre d'achats"), value: String(r.count) },
          { label: t("Valeur des achats de la période"), value: formatMoney(r.totalValue, unit) },
          { label: t("Paiements effectués pendant la période"), value: formatMoney(r.paidInPeriod, unit) },
          { label: t("Reste dû sur les achats de la période"), value: formatMoney(r.dueOnPeriod, unit) },
          { label: t("Total dû aux fournisseurs à la fin de la période"), value: formatMoney(r.outstandingAtEnd, unit) },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>
      <p className="mb-6 text-xs text-muted-foreground">
        {t("La valeur des achats suit la date d'achat ; les paiements suivent leur propre date (un achat payé plus tard ou en plusieurs fois est réparti correctement).")}
        {r.paidForEarlier > 0 && ` ${t("Dont {amount} payés pendant la période pour des achats antérieurs.", { amount: formatMoney(r.paidForEarlier, unit) })}`} {t("Les achats annulés ne sont pas comptés.")}
      </p>

      {r.byMonth.length > 0 && vue !== "mois" && (
        <section className="mb-6 rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">{t("Comparaison mensuelle")}</h2>
          <div className="space-y-2">
            {r.byMonth.map((m) => (
              <div key={m.month} className="grid grid-cols-[8rem_1fr_auto] items-center gap-2 text-sm sm:grid-cols-[11rem_1fr_auto]">
                <span className="truncate first-letter:uppercase">{formatWorkMonth(m.month, projectStart, locale).split(" (")[0]}</span>
                <div className="space-y-1">
                  <div className="h-2.5 rounded-full bg-muted">
                    <div className="h-2.5 rounded-full bg-indigo-500" style={{ width: `${Math.round((m.value / maxMonth) * 100)}%` }} title={t("Achats")} />
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.round((m.paid / maxMonth) * 100)}%` }} title={t("Paiements")} />
                  </div>
                </div>
                <span className="text-end text-xs tabular-nums">
                  <span className="font-semibold">{formatAmount(m.value)}</span>
                  <span className="block text-emerald-700">{formatAmount(m.paid)}</span>
                </span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              <span className="me-3 inline-block size-2 rounded-full bg-indigo-500" /> {t("Valeur des achats")} <span className="ms-3 me-1 inline-block size-2 rounded-full bg-emerald-500" /> {t("Paiements effectués")}
            </p>
          </div>
        </section>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="overflow-x-auto rounded-xl border bg-card">
          <h2 className="px-4 pt-3 text-base font-semibold">{t("Dépenses par catégorie")}</h2>
          <Table>
            <TableBody>
              {r.byCategory.map((c) => (
                <TableRow key={c.key}>
                  <TableCell>{t(PURCHASE_CATEGORY_LABELS[c.key as PurchaseCategory] ?? c.key)}</TableCell>
                  <TableCell className="text-end text-xs text-muted-foreground">{t("{count} achat(s)", { count: c.count })}</TableCell>
                  <TableCell className="text-end font-semibold tabular-nums">{formatMoney(c.total, unit)}</TableCell>
                </TableRow>
              ))}
              {r.byCategory.length === 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground">{t("Aucune donnée.")}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
        <section className="overflow-x-auto rounded-xl border bg-card">
          <h2 className="px-4 pt-3 text-base font-semibold">{t("Dépenses par fournisseur")}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Fournisseur")}</TableHead>
                <TableHead className="text-end">{t("Achats")}</TableHead>
                <TableHead className="text-end">{t("Total ({unit})", { unit })}</TableHead>
                <TableHead className="text-end">{t("Reste dû ({unit})", { unit })}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.bySupplier.map((s) => (
                <TableRow key={s.key}>
                  <TableCell>{s.key}</TableCell>
                  <TableCell className="text-end">{s.count}</TableCell>
                  <TableCell className="text-end font-semibold tabular-nums">{formatAmount(s.total)}</TableCell>
                  <TableCell className={cn("text-end tabular-nums", s.due > 0 && "text-red-700")}>{formatAmount(s.due)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="overflow-x-auto rounded-xl border bg-card">
          <h2 className="px-4 pt-3 text-base font-semibold">{t("Matériels les plus achetés (quantités)")}</h2>
          <Table>
            <TableBody>
              {r.byMaterial.slice(0, 15).map((m) => (
                <TableRow key={`${m.key}-${m.unit}`}>
                  <TableCell>{m.key}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {Math.round(m.quantity * 1000) / 1000} {unitText(m.unit)}
                  </TableCell>
                  <TableCell className="text-end text-xs text-muted-foreground">{t("{count} achat(s)", { count: m.count })}</TableCell>
                  <TableCell className="text-end font-semibold tabular-nums">{formatAmount(m.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
        <section className="overflow-x-auto rounded-xl border bg-card">
          <h2 className="px-4 pt-3 text-base font-semibold">{t("Achats les plus importants")}</h2>
          <Table>
            <TableBody>
              {r.top.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{formatDateFr(p.purchase_date)}</TableCell>
                  <TableCell>
                    <Link href={`/achats/${p.id}`} className="hover:underline">
                      {p.material_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.supplier_name}</TableCell>
                  <TableCell className="text-end font-semibold tabular-nums">{formatAmount(p.total_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>

      <h2 className="mb-2 text-base font-semibold">{t("Détail des achats")}</h2>
      <div className="mb-6 overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Date")}</TableHead>
              <TableHead>{t("Matériel")}</TableHead>
              <TableHead>{t("Fournisseur")}</TableHead>
              <TableHead className="text-end">{t("Quantité")}</TableHead>
              <TableHead className="text-end">{t("Total ({unit})", { unit })}</TableHead>
              <TableHead className="text-end">{t("Payé ({unit})", { unit })}</TableHead>
              <TableHead className="text-end">{t("Reste ({unit})", { unit })}</TableHead>
              <TableHead>{t("Statut")}</TableHead>
              <TableHead>{t("Justificatifs")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.purchases.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  {t("Aucun achat sur cette période.")}
                </TableCell>
              </TableRow>
            )}
            {r.purchases.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="whitespace-nowrap">{formatDateFr(p.purchase_date)}</TableCell>
                <TableCell>
                  <Link href={`/achats/${p.id}`} className="font-medium hover:underline">
                    {p.material_name}
                  </Link>
                </TableCell>
                <TableCell>{p.supplier_name}</TableCell>
                <TableCell className="text-end tabular-nums whitespace-nowrap">
                  {p.quantity} {unitText(p.unit === "autre" ? p.unit_label : p.unit)}
                </TableCell>
                <TableCell className="text-end font-semibold tabular-nums">{formatAmount(p.total_amount)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatAmount(p.amount_paid)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatAmount(p.amount_due)}</TableCell>
                <TableCell className="text-xs">{t(PAYMENT_STATUS_LABELS[p.payment_status])}</TableCell>
                <TableCell className="text-xs">
                  {p.photos.justificatif.length ? (
                    <Link href={`/achats/${p.id}`} className="text-primary hover:underline">
                      {t("{count} reçu(s)", { count: p.photos.justificatif.length })}
                    </Link>
                  ) : (
                    <span className="text-orange-700">{t("sans reçu")}</span>
                  )}
                  {p.photos.materiel.length ? ` · ${t("{count} photo(s)", { count: p.photos.materiel.length })}` : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {r.purchases.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>{t("Total")}</TableCell>
                <TableCell className="text-end tabular-nums">{formatAmount(r.totalValue)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatAmount(r.purchases.reduce((s, p) => s + p.amount_paid, 0))}</TableCell>
                <TableCell className="text-end tabular-nums">{formatAmount(r.dueOnPeriod)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      <ModuleButtons
        pdfSlot={
          <>
            <PdfExportButton kind="achats-rapport" params={pdfParams} />
            <PdfExportButton kind="achats-rapport" params={{ ...pdfParams, photos: "1" }} label="PDF avec reçus" />
          </>
        }
        historyHref="/achats"
      />
    </div>
  );
}
