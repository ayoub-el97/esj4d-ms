import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getContracts } from "@/lib/data/contracts";
import { CONTRACT_STATUSES, CONTRACT_STATUS_LABELS, CONTRACT_STATUS_STYLES, contractPeriod, type Contract } from "@/lib/contract-types";
import { formatDateFr, isISODate } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const generateMetadata = pageTitle("Contrats de la société");

type SP = { q?: string; annee?: string; statut?: string; from?: string; to?: string };

function ContractTable({ t, list, empty }: { t: TFunction; list: Contract[]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Référence du contrat")}</TableHead>
            <TableHead>{t("Début")}</TableHead>
            <TableHead>{t("Fin")}</TableHead>
            <TableHead>{t("Clôture")}</TableHead>
            <TableHead>{t("Statut")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          )}
          {list.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link href={`/profil/contrats/${c.id}`} className="font-medium hover:underline">
                  {c.reference}
                </Link>
                {c.description && <div className="line-clamp-1 text-xs text-muted-foreground">{c.description}</div>}
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatDateFr(c.start_date)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDateFr(c.end_date)}</TableCell>
              <TableCell className="whitespace-nowrap">{c.closed_on ? formatDateFr(c.closed_on) : "—"}</TableCell>
              <TableCell>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", CONTRACT_STATUS_STYLES[c.status])}>{t(CONTRACT_STATUS_LABELS[c.status])}</span>
              </TableCell>
              <TableCell>
                <LinkButton href={`/profil/contrats/${c.id}`} size="sm" variant="ghost">
                  {t("Ouvrir")}
                </LinkButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function ContractsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, t] = await Promise.all([requireModule("parametres"), getT()]);
  const sp = await searchParams;
  const all = await getContracts();
  const current = all.filter((c) => c.status === "actif" || c.status === "brouillon");
  const term = (sp.q ?? "").trim().toLowerCase();
  const archived = all
    .filter((c) => c.status === "termine" || c.status === "archive")
    .filter((c) => !term || c.reference.toLowerCase().includes(term) || c.description.toLowerCase().includes(term))
    .filter((c) => !sp.statut || c.status === sp.statut)
    .filter((c) => !sp.annee || c.start_date.slice(0, 4) <= sp.annee && contractPeriod(c).to.slice(0, 4) >= sp.annee)
    .filter((c) => !isISODate(sp.from) || contractPeriod(c).to >= sp.from)
    .filter((c) => !isISODate(sp.to) || c.start_date <= sp.to);
  const canEdit = user.permissions.parametres.can_edit;

  return (
    <div className="space-y-6">
      <ModuleHeader title={t("Contrats de la société")} subtitle={t("Contrats successifs de la société : chaque rapport appartient au contrat dont la période contient sa date.")} backHref="/profil?onglet=entreprise">
        {canEdit && (
          <LinkButton href="/profil/contrats/nouveau" size="sm">
            <Plus /> {t("Nouveau contrat")}
          </LinkButton>
        )}
      </ModuleHeader>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("Contrats en cours")}</h2>
        <ContractTable t={t} list={current} empty={t("Aucun contrat en cours.")} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("Archives des contrats")}</h2>
        <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="q">{t("Référence du contrat")}</Label>
            <Input id="q" name="q" defaultValue={sp.q} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="annee">{t("Année")}</Label>
            <Input id="annee" name="annee" type="number" min="2000" max="2100" defaultValue={sp.annee} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="statut">{t("Statut")}</Label>
            <NativeSelect id="statut" name="statut" defaultValue={sp.statut ?? ""}>
              <option value="">{t("Tous")}</option>
              {CONTRACT_STATUSES.filter((s) => s === "termine" || s === "archive").map((s) => (
                <option key={s} value={s}>
                  {t(CONTRACT_STATUS_LABELS[s])}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="from">{t("Du")}</Label>
            <Input id="from" name="from" type="date" defaultValue={sp.from} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">{t("Au")}</Label>
            <Input id="to" name="to" type="date" defaultValue={sp.to} />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
            <Button type="submit">
              <Search /> {t("Filtrer")}
            </Button>
            <LinkButton href="/profil/contrats" variant="outline">
              {t("Tout")}
            </LinkButton>
          </div>
        </form>
        <ContractTable t={t} list={archived} empty={t("Aucun contrat archivé.")} />
      </section>
    </div>
  );
}
