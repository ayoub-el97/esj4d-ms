import Link from "next/link";
import { BarChart3, ChevronRight, History, Plus, Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getTrucks } from "@/lib/data/employees";
import { getRepairs } from "@/lib/data/repairs";
import { getProjectStart } from "@/lib/data/settings";
import { formatDateFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { formatAmount, formatMoney } from "@/lib/money";
import { REPAIR_STATUSES, REPAIR_STATUS_LABELS, REPAIR_STATUS_STYLES } from "@/lib/repair-types";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveRepairPeriod } from "./period";

export const generateMetadata = pageTitle("Problèmes et réparations");

type SP = { q?: string; truck?: string; status?: string; mois?: string; annee?: string; from?: string; to?: string };

export default async function ReparationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, t] = await Promise.all([requireModule("rapport_camions"), getT()]);
  const sp = await searchParams;
  const projectStart = await getProjectStart();
  const period = resolveRepairPeriod(sp, projectStart);
  const filters = { q: sp.q, truck: sp.truck || undefined, status: sp.status || undefined, from: period.from, to: period.to };
  const [repairs, trucks] = await Promise.all([getRepairs(filters), getTrucks()]);
  const canEdit = user.permissions.rapport_camions.can_edit;
  const unit = t("DH");
  const count = (s: string) => repairs.filter((r) => r.status === s).length;
  const spent = repairs.filter((r) => r.counted && (!period.from || r.repair_date! >= period.from) && (!period.to || r.repair_date! <= period.to)).reduce((s, r) => s + (r.cost ?? 0), 0);

  const kpis = [
    { label: t("Dossiers"), value: String(repairs.length) },
    { label: t("En attente"), value: String(count("en_attente")) },
    { label: t("En cours"), value: String(count("en_cours")) },
    { label: t("Réparés"), value: String(count("repare")) },
    { label: t("Dépenses réelles"), value: formatMoney(spent, unit) },
  ];

  return (
    <div>
      <ModuleHeader title={t("Problèmes et réparations")} subtitle={t("Suivi des pannes, réparations et dépenses de chaque camion")}>
        {canEdit && (
          <LinkButton href={`/reparations/nouveau${sp.truck ? `?camion=${sp.truck}` : ""}`} size="sm">
            <Plus /> {t("Nouveau problème")}
          </LinkButton>
        )}
        <LinkButton href="/reparations/rapport" size="sm" variant="secondary">
          <BarChart3 /> {t("Rapport des dépenses")}
        </LinkButton>
        {sp.truck && (
          <LinkButton href={`/reparations/camion/${sp.truck}`} size="sm" variant="outline">
            <History /> {t("Historique du camion")}
          </LinkButton>
        )}
      </ModuleHeader>

      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="q">{t("Recherche")}</Label>
          <Input id="q" name="q" defaultValue={sp.q} placeholder={t("Matricule, problème, pièce, lieu…")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="truck">{t("Camion")}</Label>
          <NativeSelect id="truck" name="truck" defaultValue={sp.truck ?? ""}>
            <option value="">{t("Tous")}</option>
            {trucks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.matricule}
                {!tr.is_active ? ` (${t("inactif")})` : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">{t("Statut")}</Label>
          <NativeSelect id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">{t("Tous")}</option>
            {REPAIR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(REPAIR_STATUS_LABELS[s])}
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
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">
            <Search /> {t("Filtrer")}
          </Button>
          <LinkButton href="/reparations" variant="outline">
            {t("Tout")}
          </LinkButton>
          {period.from && (
            <span className="text-xs text-muted-foreground">
              {t("Période : {from} → {to}", { from: formatDateFr(period.from), to: period.to ? formatDateFr(period.to) : "…" })}
            </span>
          )}
        </div>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      {repairs.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("Aucun problème enregistré pour ces critères.")}</p>}

      {/* Téléphone : cartes */}
      <div className="space-y-2 sm:hidden">
        {repairs.map((r) => (
          <Link key={r.id} href={`/reparations/${r.id}`} className="block rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold">{r.truck?.matricule}</span>
              <span className={cn("ms-auto rounded-full px-2 py-0.5 text-xs font-medium", REPAIR_STATUS_STYLES[r.status])}>{t(REPAIR_STATUS_LABELS[r.status])}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm">{r.problem_description}</p>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              {formatDateFr(r.reported_date)}
              {r.cost != null && <span className={cn("font-medium", r.counted ? "text-foreground" : "")}>· {formatMoney(r.cost, unit)}</span>}
              <ChevronRight className="ms-auto size-4 rtl:rotate-180" />
            </div>
          </Link>
        ))}
      </div>

      {/* Ordinateur : tableau */}
      {repairs.length > 0 && (
        <div className="hidden overflow-x-auto rounded-xl border bg-card sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Signalé le")}</TableHead>
                <TableHead>{t("Matricule")}</TableHead>
                <TableHead>{t("Problème")}</TableHead>
                <TableHead>{t("Réparé le")}</TableHead>
                <TableHead className="text-end">{t("Coût ({unit})", { unit })}</TableHead>
                <TableHead>{t("Statut")}</TableHead>
                <TableHead className="text-end">{t("Photos")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {repairs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{formatDateFr(r.reported_date)}</TableCell>
                  <TableCell className="font-mono">
                    <Link href={`/reparations/camion/${r.truck_id}`} className="hover:underline">
                      {r.truck?.matricule}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-72">
                    <span className="line-clamp-2">{r.problem_description}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.repair_date ? formatDateFr(r.repair_date) : "—"}</TableCell>
                  <TableCell className={cn("text-end tabular-nums", !r.counted && "text-muted-foreground")} title={r.counted ? undefined : t("Non compté dans les dépenses")}>
                    {r.cost == null ? "—" : formatAmount(r.cost)}
                  </TableCell>
                  <TableCell>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", REPAIR_STATUS_STYLES[r.status])}>{t(REPAIR_STATUS_LABELS[r.status])}</span>
                  </TableCell>
                  <TableCell className="text-end text-xs text-muted-foreground">{Object.values(r.photos).reduce((s, l) => s + l.length, 0) || ""}</TableCell>
                  <TableCell>
                    <LinkButton href={`/reparations/${r.id}`} size="sm" variant="ghost">
                      {t("Ouvrir")}
                    </LinkButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ModuleButtons monthlyHref="/reparations/rapport" />
    </div>
  );
}
