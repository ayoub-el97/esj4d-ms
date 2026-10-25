import Link from "next/link";
import { dayFunctionLabel } from "@/lib/day-function";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getTrucks, employeeName } from "@/lib/data/employees";
import { getCollectionReports } from "@/lib/data/reports";
import { getRecordAuditInfo } from "@/lib/data/audit-info";
import { COLLECTION_STATUS_LABELS, COLLECTION_STATUS_STYLES } from "@/lib/collection-status";
import { formatDateFr, formatDateLongFr, isISODate, todayISO } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { PhotoGallery } from "@/components/photo-gallery";
import { AuditLine } from "@/components/audit-line";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";

export const generateMetadata = pageTitle("Historique des rapports de collecte");

export default async function CollecteHistoriquePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; truck?: string }> }) {
  const [, { t, locale }] = await Promise.all([requireModule("rapport_journalier"), getI18n()]);
  const sp = await searchParams;
  // Sans période choisie : les 31 derniers jours
  const today = todayISO();
  const defaultFrom = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
  const from = isISODate(sp.from) ? sp.from : sp.to ? undefined : defaultFrom;
  const to = isISODate(sp.to) ? sp.to : undefined;
  const [reports, trucks] = await Promise.all([getCollectionReports({ from, to, truck: sp.truck || undefined }), getTrucks()]);
  const audit = await getRecordAuditInfo("collection_reports", reports.map((r) => r.id));

  return (
    <div>
      <ModuleHeader title={t("Historique des rapports de collecte")} subtitle={t("{count} rapport(s)", { count: reports.length })} backHref="/rapport-journalier/collecte" />
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
          <Label htmlFor="truck">{t("Camion")}</Label>
          <NativeSelect id="truck" name="truck" defaultValue={sp.truck ?? ""}>
            <option value="">{t("Tous")}</option>
            {trucks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.matricule}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> {t("Filtrer")}
          </Button>
        </div>
      </form>

      {reports.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("Aucun rapport.")}</p>}
      <div className="space-y-4">
        {reports.map((r) => {
          const info = audit.get(r.id);
          return (
            <article key={r.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <header className="flex flex-wrap items-center gap-2">
                <Link href={`/rapport-journalier/collecte/${r.id}`} className="font-semibold first-letter:uppercase hover:underline">
                  {formatDateLongFr(r.activity_date, locale)}
                </Link>
                <span className="font-mono text-sm">{r.truck?.matricule}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", COLLECTION_STATUS_STYLES[r.status])}>{t(COLLECTION_STATUS_LABELS[r.status])}</span>
                <div className="ms-auto flex gap-1">
                  <PdfExportButton kind="rapport-collecte" params={{ date: r.activity_date, id: r.id }} label="PDF" />
                  <LinkButton href={`/rapport-journalier/collecte/${r.id}`} size="sm" variant="outline">
                    {r.day_closed ? t("Voir") : t("Ouvrir / modifier")}
                  </LinkButton>
                </div>
              </header>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="inline text-muted-foreground">{t("Chauffeur")} : </dt>
                  <dd className="inline">{r.chauffeur ? employeeName(r.chauffeur) : "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">{t("Équipe")} : </dt>
                  <dd className="inline">{r.rippers.length ? r.rippers.map((e) => (e.day_position && e.day_position !== e.position ? `${employeeName(e)} (${dayFunctionLabel(t, e.day_position, e.position)})` : employeeName(e))).join(", ") : "—"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline text-muted-foreground">{t("Lieux / secteurs")} : </dt>
                  <dd className="inline whitespace-pre-line">{r.sectors || "—"}</dd>
                </div>
                {r.observations && (
                  <div className="sm:col-span-2">
                    <dt className="inline text-muted-foreground">{t("Observations")} : </dt>
                    <dd className="inline whitespace-pre-line">{r.observations}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <section>
                  <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t("Photos Avant")} ({r.photosAvant.length})
                  </h3>
                  <PhotoGallery photos={r.photosAvant} emptyText={t("Aucune photo")} />
                </section>
                <section>
                  <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t("Photos Après")} ({r.photosApres.length})
                  </h3>
                  <PhotoGallery photos={r.photosApres} emptyText={t("Aucune photo")} />
                </section>
              </div>
              {info && <AuditLine info={info} t={t} />}
            </article>
          );
        })}
      </div>
      {!sp.from && !sp.to && <p className="mt-4 text-xs text-muted-foreground">{t("Rapports des 31 derniers jours (à partir du {date}) ; choisissez une période pour voir les plus anciens.", { date: formatDateFr(defaultFrom) })}</p>}
      <ModuleButtons monthlyHref="/rapport-camions/mensuel" />
    </div>
  );
}
