import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getTrucks } from "@/lib/data/employees";
import { getAlertRules, getRepairs, getTruckDowntime } from "@/lib/data/repairs";
import { AlertBadge, FLEET_STATE_LABELS, alertReasonTexts } from "@/components/fleet-alerts";
import { formatDateFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { REPAIR_PHOTO_GROUPS, REPAIR_STATUS_LABELS, REPAIR_STATUS_STYLES } from "@/lib/repair-types";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { LinkButton } from "@/components/link-button";
import { PdfExportButton } from "@/components/pdf-export-button";
import { PhotoGallery } from "@/components/photo-gallery";

export const generateMetadata = pageTitle("Historique des réparations du camion");

export default async function TruckRepairHistoryPage({ params }: { params: Promise<{ truckId: string }> }) {
  const [user, t] = await Promise.all([requireModule("rapport_camions"), getT()]);
  const { truckId } = await params;
  const trucks = await getTrucks();
  const truck = trucks.find((tr) => tr.id === truckId);
  if (!truck) notFound();
  const [repairs, downtime, rules] = await Promise.all([getRepairs({ truck: truckId }), getTruckDowntime(truckId), getAlertRules()]);
  const totalDays = repairs.filter((r) => r.status === "repare" && r.days != null).reduce((s, r) => s + r.days!, 0);
  const unit = t("DH");
  const spent = repairs.filter((r) => r.counted).reduce((s, r) => s + (r.cost ?? 0), 0);
  const open = repairs.filter((r) => r.status === "en_attente" || r.status === "en_cours").length;

  return (
    <div className="mx-auto max-w-5xl">
      <ModuleHeader
        title={t("Historique du camion {matricule}", { matricule: truck.matricule })}
        subtitle={[truck.brand, truck.model, truck.is_active ? "" : t("inactif")].filter(Boolean).join(" · ") || undefined}
        backHref="/reparations"
      >
        {user.permissions.rapport_camions.can_edit && (
          <LinkButton href={`/reparations/nouveau?camion=${truck.id}`} size="sm">
            <Plus /> {t("Nouveau problème pour ce camion")}
          </LinkButton>
        )}
      </ModuleHeader>

      <div className={cn("mb-4 flex flex-wrap items-center gap-2 rounded-xl border p-3", downtime.alert === "rouge" ? "border-red-300 bg-red-50 dark:bg-red-950/30" : downtime.alert === "orange" ? "border-orange-300 bg-orange-50 dark:bg-orange-950/30" : "bg-card")}>
        <AlertBadge level={downtime.alert} t={t} />
        <span className="font-semibold">{t(FLEET_STATE_LABELS[downtime.state])}</span>
        {downtime.since && <span>{t("hors service depuis le {date} — {count} jour(s)", { date: formatDateFr(downtime.since), count: downtime.currentDays })}</span>}
        {downtime.alertReasons.length > 0 && <span className="text-sm text-muted-foreground">({alertReasonTexts(t, { ...downtime, truck, lastRepairDate: null, repairedInPeriod: 0, expenses: 0 }, rules).join(" ; ")})</span>}
        {downtime.overdue && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">{t("remise en service en retard")}</span>}
        {downtime.issues.length > 0 && <span className="text-sm font-medium text-red-700">{t("Dossiers à vérifier : pannes ouvertes en double ou immobilisations qui se chevauchent.")}</span>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">{t("Problèmes enregistrés")}</p>
          <p className="mt-1 text-lg font-semibold">{repairs.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">{t("En panne / en réparation")}</p>
          <p className="mt-1 text-lg font-semibold">{open}</p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">{t("Dépenses de réparation (total)")}</p>
          <p className="mt-1 text-lg font-semibold">{formatMoney(spent, unit)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">{t("Jours hors service (pannes réparées)")}</p>
          <p className="mt-1 text-lg font-semibold">{t("{count} j", { count: totalDays })}</p>
        </div>
      </div>

      {repairs.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("Aucun problème enregistré pour ce camion.")}</p>}
      <div className="space-y-4">
        {repairs.map((r) => (
          <article key={r.id} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{formatDateFr(r.reported_date)}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", REPAIR_STATUS_STYLES[r.status])}>{t(REPAIR_STATUS_LABELS[r.status])}</span>
              {r.days != null && (
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", r.status === "repare" ? "bg-muted" : "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300")}>
                  {r.status === "repare"
                    ? t("Immobilisé {count} j (du {from} au {to})", { count: r.days, from: formatDateFr(r.out_of_service_since), to: formatDateFr(r.repair_date) })
                    : t("Hors service depuis {count} j (depuis le {from})", { count: r.days, from: formatDateFr(r.out_of_service_since) })}
                </span>
              )}
              <span className="ms-auto text-sm font-semibold">
                {r.cost == null ? t("Coût non renseigné") : formatMoney(r.cost, unit)}
                {r.cost != null && !r.counted && <span className="ms-1 text-xs font-normal text-muted-foreground">({t("non compté")})</span>}
              </span>
            </div>
            <p className="mt-2 text-sm">
              <span className="text-muted-foreground">{t("Problème")} : </span>
              {r.problem_description}
              {r.problem_location && <span className="text-muted-foreground"> — {r.problem_location}</span>}
            </p>
            {(r.repair_description || r.repair_date) && (
              <p className="mt-1 text-sm">
                <span className="text-muted-foreground">{t("Réparation")}{r.repair_date ? ` (${formatDateFr(r.repair_date)})` : ""} : </span>
                {r.repair_description || "—"}
              </p>
            )}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {REPAIR_PHOTO_GROUPS.filter((g) => g.phase !== "vehicule").map((g) =>
                r.photos[g.phase].length ? (
                  <div key={g.phase}>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">
                      {t(g.title)} ({r.photos[g.phase].length})
                    </p>
                    <PhotoGallery photos={r.photos[g.phase]} />
                  </div>
                ) : null,
              )}
            </div>
            <div className="mt-3">
              <Link href={`/reparations/${r.id}`} className="text-sm font-medium text-primary hover:underline">
                {t("Ouvrir le dossier complet")}
              </Link>
            </div>
          </article>
        ))}
      </div>

      <ModuleButtons pdfSlot={repairs.length ? <PdfExportButton kind="reparations-camion" params={{ truck: truck.id }} label="PDF de l'historique" /> : undefined} monthlyHref={`/reparations/rapport?truck=${truck.id}`} />
    </div>
  );
}
