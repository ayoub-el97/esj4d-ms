import Link from "next/link";
import { BarChart3, ChevronRight, Plus, Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getPurchases } from "@/lib/data/purchases";
import { getProjectStart } from "@/lib/data/settings";
import { formatDateFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { formatAmount, formatMoney } from "@/lib/money";
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES, PURCHASE_CATEGORIES, PURCHASE_CATEGORY_LABELS, unitLabel } from "@/lib/purchase-types";
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
import { resolvePurchasePeriod } from "./period";

export const generateMetadata = pageTitle("Achats de matériel");

type SP = { q?: string; category?: string; supplier?: string; status?: string; mois?: string; annee?: string; from?: string; to?: string; min?: string; max?: string };

export default async function AchatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, t] = await Promise.all([requireModule("achats"), getT()]);
  const sp = await searchParams;
  const projectStart = await getProjectStart();
  const period = resolvePurchasePeriod(sp, projectStart);
  const min = sp.min ? Number(sp.min) : undefined;
  const max = sp.max ? Number(sp.max) : undefined;
  const purchases = await getPurchases({ q: sp.q, category: sp.category || undefined, supplier: sp.supplier || undefined, status: sp.status || undefined, from: period.from, to: period.to, min, max });
  const canEdit = user.permissions.achats.can_edit;
  const unit = t("DH");
  const active = purchases.filter((p) => !p.cancelled);
  const sum = (k: "total_amount" | "amount_paid" | "amount_due") => active.reduce((s, p) => s + p[k], 0);
  const pdfParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v) pdfParams[k] = String(v);

  const kpis = [
    { label: t("Achats"), value: String(active.length) },
    { label: t("Valeur des achats"), value: formatMoney(sum("total_amount"), unit) },
    { label: t("Montant payé"), value: formatMoney(sum("amount_paid"), unit) },
    { label: t("Reste dû aux fournisseurs"), value: formatMoney(sum("amount_due"), unit) },
  ];

  return (
    <div>
      <ModuleHeader title={t("Achats de matériel")} subtitle={t("Historique des achats")}>
        {canEdit && (
          <LinkButton href="/achats/nouveau" size="sm">
            <Plus /> {t("Nouvel achat de matériel")}
          </LinkButton>
        )}
        <LinkButton href="/achats/rapport" size="sm" variant="secondary">
          <BarChart3 /> {t("Rapports mensuel et annuel")}
        </LinkButton>
      </ModuleHeader>

      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="q">{t("Matériel (recherche)")}</Label>
          <Input id="q" name="q" defaultValue={sp.q} placeholder={t("Nom, description, notes…")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="supplier">{t("Fournisseur")}</Label>
          <Input id="supplier" name="supplier" defaultValue={sp.supplier} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="category">{t("Catégorie")}</Label>
          <NativeSelect id="category" name="category" defaultValue={sp.category ?? ""}>
            <option value="">{t("Toutes")}</option>
            {PURCHASE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(PURCHASE_CATEGORY_LABELS[c])}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">{t("Statut de paiement")}</Label>
          <NativeSelect id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">{t("Tous")}</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(PAYMENT_STATUS_LABELS[s])}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mois">{t("Mois")}</Label>
          <Input id="mois" name="mois" type="month" defaultValue={sp.mois} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="annee">{t("Année")}</Label>
          <Input id="annee" name="annee" type="number" min="2000" max="2100" defaultValue={sp.annee} placeholder="2026" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={sp.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={sp.to} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="min">{t("Montant min.")}</Label>
            <Input id="min" name="min" type="number" min="0" step="0.01" defaultValue={sp.min} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max">{t("Montant max.")}</Label>
            <Input id="max" name="max" type="number" min="0" step="0.01" defaultValue={sp.max} />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
          <Button type="submit">
            <Search /> {t("Filtrer")}
          </Button>
          <LinkButton href="/achats" variant="outline">
            {t("Tout")}
          </LinkButton>
          {period.from && (
            <span className="text-xs text-muted-foreground">
              {t("Période : {from} → {to}", { from: formatDateFr(period.from), to: period.to ? formatDateFr(period.to) : "…" })}
            </span>
          )}
        </div>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      {purchases.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("Aucun achat pour ces critères.")}</p>}

      {/* Téléphone : cartes */}
      <div className="space-y-2 sm:hidden">
        {purchases.map((p) => (
          <Link key={p.id} href={`/achats/${p.id}`} className={cn("block rounded-xl border bg-card p-3 shadow-sm", p.cancelled && "opacity-60")}>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{p.material_name}</span>
              <span className={cn("ms-auto rounded-full px-2 py-0.5 text-xs font-medium", PAYMENT_STATUS_STYLES[p.payment_status])}>{t(PAYMENT_STATUS_LABELS[p.payment_status])}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatDateFr(p.purchase_date)} · {p.supplier_name} · {p.quantity} {t(unitLabel(p.unit, p.unit_label))}
            </div>
            <div className="mt-1 flex items-center text-sm">
              <span className="font-semibold tabular-nums">{formatMoney(p.total_amount, unit)}</span>
              {p.amount_due > 0 && !p.cancelled && <span className="ms-2 text-xs text-red-700">{t("reste {amount}", { amount: formatMoney(p.amount_due, unit) })}</span>}
              <ChevronRight className="ms-auto size-4 text-muted-foreground rtl:rotate-180" />
            </div>
          </Link>
        ))}
      </div>

      {/* Ordinateur : tableau */}
      {purchases.length > 0 && (
        <div className="hidden overflow-x-auto rounded-xl border bg-card sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date d'achat")}</TableHead>
                <TableHead>{t("Matériel")}</TableHead>
                <TableHead>{t("Catégorie")}</TableHead>
                <TableHead>{t("Fournisseur")}</TableHead>
                <TableHead className="text-end">{t("Quantité")}</TableHead>
                <TableHead className="text-end">{t("Total ({unit})", { unit })}</TableHead>
                <TableHead className="text-end">{t("Payé ({unit})", { unit })}</TableHead>
                <TableHead className="text-end">{t("Reste ({unit})", { unit })}</TableHead>
                <TableHead>{t("Statut")}</TableHead>
                <TableHead className="text-end">{t("Photos")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p) => (
                <TableRow key={p.id} className={p.cancelled ? "opacity-60" : undefined}>
                  <TableCell className="whitespace-nowrap">{formatDateFr(p.purchase_date)}</TableCell>
                  <TableCell className="font-medium">{p.material_name}</TableCell>
                  <TableCell className="text-xs">{t(PURCHASE_CATEGORY_LABELS[p.category])}</TableCell>
                  <TableCell>{p.supplier_name}</TableCell>
                  <TableCell className="text-end whitespace-nowrap tabular-nums">
                    {p.quantity} {t(unitLabel(p.unit, p.unit_label))}
                  </TableCell>
                  <TableCell className="text-end font-semibold tabular-nums">
                    {formatAmount(p.total_amount)}
                    {p.amount_adjusted && <span className="block text-[10px] font-medium text-orange-700">{t("ajusté")}</span>}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{formatAmount(p.amount_paid)}</TableCell>
                  <TableCell className={cn("text-end tabular-nums", p.amount_due > 0 && !p.cancelled && "font-medium text-red-700")}>{formatAmount(p.amount_due)}</TableCell>
                  <TableCell>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", PAYMENT_STATUS_STYLES[p.payment_status])}>{t(PAYMENT_STATUS_LABELS[p.payment_status])}</span>
                  </TableCell>
                  <TableCell className="text-end text-xs text-muted-foreground">{p.photo_count || ""}</TableCell>
                  <TableCell>
                    <LinkButton href={`/achats/${p.id}`} size="sm" variant="ghost">
                      {t("Voir")}
                    </LinkButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5}>{t("Total ({count} achat(s), hors annulés)", { count: active.length })}</TableCell>
                <TableCell className="text-end tabular-nums">{formatAmount(sum("total_amount"))}</TableCell>
                <TableCell className="text-end tabular-nums">{formatAmount(sum("amount_paid"))}</TableCell>
                <TableCell className="text-end tabular-nums">{formatAmount(sum("amount_due"))}</TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      <ModuleButtons pdfSlot={<PdfExportButton kind="achats-liste" params={pdfParams} label="PDF de la liste" />} monthlyHref="/achats/rapport" />
    </div>
  );
}
