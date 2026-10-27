import Link from "next/link";
import { BarChart3, Camera, ChevronRight, FileText, Plus, Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getPurchaseCategories, getPurchases } from "@/lib/data/purchases";
import { getProjectStart } from "@/lib/data/settings";
import { formatDateFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { formatAmount, formatMoney } from "@/lib/money";
import { categoryLabel } from "@/lib/purchase-types";
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

export const generateMetadata = pageTitle("Achats");

type SP = { q?: string; category?: string; mois?: string; annee?: string; from?: string; to?: string };

export default async function AchatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, t] = await Promise.all([requireModule("achats"), getT()]);
  const sp = await searchParams;
  const projectStart = await getProjectStart();
  const period = resolvePurchasePeriod(sp, projectStart);
  const [purchases, categories] = await Promise.all([getPurchases({ q: sp.q, category: sp.category || undefined, from: period.from, to: period.to }), getPurchaseCategories()]);
  const canEdit = user.permissions.achats.can_edit;
  const unit = t("DH");
  const active = purchases.filter((p) => !p.cancelled);
  const total = active.reduce((s, p) => s + p.total_amount, 0);
  const pdfParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v) pdfParams[k] = String(v);

  const kpis = [
    { label: t("Achats"), value: String(active.length) },
    { label: t("Total des dépenses"), value: formatMoney(total, unit) },
    { label: t("Photos des achats"), value: String(active.reduce((s, p) => s + p.photos.materiel.length, 0)) },
    { label: t("Photos de factures / bons"), value: String(active.reduce((s, p) => s + p.photos.justificatif.length, 0)) },
  ];

  return (
    <div>
      <ModuleHeader title={t("Achats")} subtitle={t("Historique des achats")}>
        {canEdit && (
          <LinkButton href="/achats/nouveau" size="sm">
            <Plus /> {t("Nouvel achat")}
          </LinkButton>
        )}
        <LinkButton href="/achats/rapport" size="sm" variant="secondary">
          <BarChart3 /> {t("Rapports mensuel et annuel")}
        </LinkButton>
      </ModuleHeader>

      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="q">{t("Recherche")}</Label>
          <Input id="q" name="q" defaultValue={sp.q} placeholder={t("Description…")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="category">{t("Catégorie")}</Label>
          <NativeSelect id="category" name="category" defaultValue={sp.category ?? ""}>
            <option value="">{t("Toutes")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(t, c)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mois">{t("Mois")}</Label>
          <Input id="mois" name="mois" type="month" defaultValue={sp.mois} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={sp.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={sp.to} />
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-6">
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
            <div className="flex items-start gap-2">
              <span className="line-clamp-2 font-semibold">{p.label}</span>
              <span className="ms-auto shrink-0 font-semibold tabular-nums">{formatMoney(p.total_amount, unit)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {formatDateFr(p.purchase_date)} · {categoryLabel(t, p.category)}
              </span>
              {p.cancelled && <span className="text-red-700">{t("Annulé")}</span>}
              <PhotoCounts materiel={p.photos.materiel.length} facture={p.photos.justificatif.length} />
              <ChevronRight className="ms-auto size-4 rtl:rotate-180" />
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
                <TableHead>{t("Description")}</TableHead>
                <TableHead>{t("Catégorie")}</TableHead>
                <TableHead className="text-end">{t("Montant total ({unit})", { unit })}</TableHead>
                <TableHead>{t("Photos")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p) => (
                <TableRow key={p.id} className={p.cancelled ? "opacity-60" : undefined}>
                  <TableCell className="whitespace-nowrap">{formatDateFr(p.purchase_date)}</TableCell>
                  <TableCell className="max-w-md">
                    <Link href={`/achats/${p.id}`} className="font-medium hover:underline">
                      {p.label}
                    </Link>
                    {p.cancelled && <span className="ms-2 text-xs text-red-700">{t("Annulé")}</span>}
                  </TableCell>
                  <TableCell className="text-xs">{categoryLabel(t, p.category)}</TableCell>
                  <TableCell className="text-end font-semibold tabular-nums">{formatAmount(p.total_amount)}</TableCell>
                  <TableCell>
                    <PhotoCounts materiel={p.photos.materiel.length} facture={p.photos.justificatif.length} />
                  </TableCell>
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
                <TableCell colSpan={3}>{t("Total ({count} achat(s), hors annulés)", { count: active.length })}</TableCell>
                <TableCell className="text-end tabular-nums">{formatAmount(total)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      <ModuleButtons pdfSlot={<PdfExportButton kind="achats-liste" params={pdfParams} label="PDF de la liste" />} monthlyHref="/achats/rapport" />
    </div>
  );
}

/** Nombre de photos des achats et de photos de facture / bon. */
async function PhotoCounts({ materiel, facture }: { materiel: number; facture: number }) {
  const t = await getT();
  if (!materiel && !facture) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      {materiel > 0 && (
        <span className="inline-flex items-center gap-0.5" title={t("Photos des achats")}>
          <Camera className="size-3.5" /> {materiel}
        </span>
      )}
      {facture > 0 && (
        <span className="inline-flex items-center gap-0.5" title={t("Photos de la facture / du bon")}>
          <FileText className="size-3.5" /> {facture}
        </span>
      )}
    </span>
  );
}
