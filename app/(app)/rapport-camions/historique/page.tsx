import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTrucks } from "@/lib/data/employees";
import { formatDateFr, formatDateLongFr, isISODate } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { PdfExportButton } from "@/components/pdf-export-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { TruckTabs } from "../truck-tabs";

export const generateMetadata = pageTitle("Historique des rapports camions");

type SP = { date?: string; from?: string; to?: string; truck?: string };
type DayRow = { activity_date: string; trucks: number; lines: number; tonnage: number };

/**
 * Historique des rapports camions : une ligne par date ayant un rapport, du plus récent au plus
 * ancien. Chaque date ouvre son rapport complet (historique/[date]) et son PDF.
 */
export default async function TruckHistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [, { t, locale }] = await Promise.all([requireModule("rapport_camions"), getI18n()]);
  const sp = await searchParams;
  // Ancienne adresse (?date=…) : le rapport de cette date
  if (isISODate(sp.date)) redirect(`/rapport-camions/historique/${sp.date}`);
  const from = isISODate(sp.from) ? sp.from : undefined;
  const to = isISODate(sp.to) ? sp.to : undefined;
  const truck = sp.truck || undefined;
  const supabase = await createClient();
  const [{ data }, trucks] = await Promise.all([supabase.rpc("truck_report_dates", { p_from: from ?? null, p_to: to ?? null, p_truck: truck ?? null }), getTrucks()]);
  const days = (data ?? []) as DayRow[];
  const filtered = !!(from || to || truck);
  const params: Record<string, string> = { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(truck ? { truck } : {}) };
  const period = from || to ? t("du {from} au {to}", { from: from ? formatDateFr(from) : "…", to: to ? formatDateFr(to) : "…" }) : t("toutes dates");

  return (
    <div>
      <ModuleHeader title={t("Historique des rapports camions")} subtitle={t("{count} jour(s) — {period}", { count: days.length, period })}>
        {/* Export d'une période : seulement après une recherche (sinon, PDF de chaque date) */}
        {filtered && days.length > 0 && (
          <>
            <PdfExportButton kind="camions" params={params} label="Exporter la sélection en PDF" />
            <ExcelExportButton kind="camions" params={params} />
          </>
        )}
      </ModuleHeader>
      <TruckTabs active="historique" />
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="truck">{t("Matricule")}</Label>
          <NativeSelect id="truck" name="truck" defaultValue={truck ?? ""}>
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
          {filtered && (
            <LinkButton href="/rapport-camions/historique" variant="outline">
              {t("Tout")}
            </LinkButton>
          )}
        </div>
      </form>

      {days.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("Aucun rapport camion pour ces critères.")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {days.map((d) => (
            <li key={d.activity_date}>
              <Link href={`/rapport-camions/historique/${d.activity_date}`} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-3 text-sm transition-colors hover:bg-muted">
                <span className="w-24 font-semibold tabular-nums">{formatDateFr(d.activity_date)}</span>
                <span className="min-w-40 text-muted-foreground first-letter:uppercase">{formatDateLongFr(d.activity_date, locale)}</span>
                <span className="text-muted-foreground">
                  {t("{count} camion(s)", { count: d.trucks })} · {t("{tonnage} t", { tonnage: Number(d.tonnage).toFixed(2) })}
                </span>
                <ChevronRight className="ms-auto size-4 text-muted-foreground rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
