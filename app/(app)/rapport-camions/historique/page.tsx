import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getTrucks } from "@/lib/data/employees";
import { getTruckReports } from "@/lib/data/reports";
import { formatDateFr, isISODate } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { PdfExportButton } from "@/components/pdf-export-button";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { TruckTabs } from "../truck-tabs";
import { TruckDayTable } from "../truck-day-table";

export const generateMetadata = pageTitle("Historique des rapports camions");

type SP = { date?: string; from?: string; to?: string; truck?: string };

/**
 * Historique des rapports camions : chaque rapport est un enregistrement distinct (date, camion,
 * Matin / Soir, ligne), jamais remplacé par celui d'un autre jour. Du plus récent au plus ancien.
 */
export default async function TruckHistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, t] = await Promise.all([requireModule("rapport_camions"), getT()]);
  const sp = await searchParams;
  const filters = { date: isISODate(sp.date) ? sp.date : undefined, from: isISODate(sp.from) ? sp.from : undefined, to: isISODate(sp.to) ? sp.to : undefined, truck: sp.truck || undefined };
  const [rows, trucks] = await Promise.all([getTruckReports(filters, 2000), getTrucks()]);
  const sorted = [...rows].sort((a, b) => b.activity_date.localeCompare(a.activity_date));
  const canEdit = user.permissions.rapport_camions.can_edit;
  const pdfParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) if (v) pdfParams[k] = v;
  const days = new Set(sorted.map((r) => r.activity_date)).size;
  const period = filters.date ? formatDateFr(filters.date) : filters.from || filters.to ? t("du {from} au {to}", { from: filters.from ? formatDateFr(filters.from) : "…", to: filters.to ? formatDateFr(filters.to) : "…" }) : t("toutes dates");

  return (
    <div>
      <ModuleHeader title={t("Historique des rapports camions")} subtitle={t("{count} ligne(s) sur {days} jour(s) — {period}", { count: sorted.length, days, period })}>
        <PdfExportButton kind="camions" params={pdfParams} label="Exporter la sélection en PDF" />
      </ModuleHeader>
      <TruckTabs active="historique" />
      <p className="mb-3 text-xs text-muted-foreground">
        {t("Chaque rapport garde les valeurs saisies le jour même (tonnage, vidages, Matin / Soir, observations, photos). Ouvrez une ligne pour la consulter ou la corriger : la modification remplace la même ligne, sans doublon de tonnage ni de vidages.")}
      </p>
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="date">{t("Date exacte")}</Label>
          <Input id="date" name="date" type="date" defaultValue={sp.date} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={sp.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={sp.to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="truck">{t("Matricule")}</Label>
          <NativeSelect id="truck" name="truck" defaultValue={sp.truck ?? ""}>
            <option value="">{t("Tous")}</option>
            {trucks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.matricule}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">
            <Search /> {t("Rechercher")}
          </Button>
          <LinkButton href="/rapport-camions/historique" variant="outline">
            {t("Tout")}
          </LinkButton>
        </div>
      </form>
      {sorted.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("Aucun rapport camion pour ces critères.")}</p> : <TruckDayTable rows={sorted} canEdit={canEdit} t={t} />}
    </div>
  );
}
