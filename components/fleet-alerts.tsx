import Link from "next/link";
import { ChevronRight, Truck } from "lucide-react";
import { getFleetOverview, type FleetTruck } from "@/lib/data/repairs";
import { ALERT_LABELS, ALERT_STYLES, type AlertLevel, type AlertRules } from "@/lib/downtime";
import { formatDateFr, todayISO } from "@/lib/dates";
import type { TFunction } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export const FLEET_STATE_LABELS: Record<FleetTruck["state"], string> = { en_service: "En service", en_panne: "En panne", en_reparation: "En réparation" };

/** Badge d'alerte : couleur ET texte (jamais la couleur seule). */
export function AlertBadge({ level, t, className }: { level: AlertLevel; t: TFunction; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", ALERT_STYLES[level], className)}>{t(ALERT_LABELS[level])}</span>;
}

/** Raisons de l'alerte, en clair. */
export function alertReasonTexts(t: TFunction, tr: FleetTruck, rules: AlertRules): string[] {
  return tr.alertReasons.map((r) =>
    r === "duree_rouge" || r === "duree_orange"
      ? t("hors service depuis {count} j (seuil {limit} j)", { count: tr.currentDays, limit: r === "duree_rouge" ? rules.redDays : rules.orangeDays })
      : t("{count} panne(s) en {days} j (seuil {limit})", { count: tr.recentCount, days: rules.windowDays, limit: r === "frequence_rouge" ? rules.redCount : rules.orangeCount }),
  );
}

/** Résumé des camions hors service et en alerte (tableau de bord, rapport camions). */
export async function FleetAlertsCard() {
  const t = await getT();
  const today = todayISO();
  const fleet = await getFleetOverview(today, today);
  const out = fleet.trucks.filter((tr) => tr.state !== "en_service");
  const alerted = fleet.trucks.filter((tr) => tr.alert !== "vert").sort((a, b) => Number(b.alert === "rouge") - Number(a.alert === "rouge") || b.currentDays - a.currentDays);
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Truck className="size-4 text-amber-600" />
        <h2 className="text-base font-semibold">{t("État de la flotte")}</h2>
        <span className="text-sm text-muted-foreground">
          {t("{out} camion(s) hors service · {days} jour(s) d'immobilisation en cours", { out: out.length, days: out.reduce((s, tr) => s + tr.currentDays, 0) })}
        </span>
        <Link href="/reparations/flotte" className="ms-auto inline-flex items-center gap-0.5 text-sm text-primary hover:underline">
          {t("Voir la flotte")} <ChevronRight className="size-4 rtl:rotate-180" />
        </Link>
      </div>
      {alerted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{out.length ? t("Aucune alerte : les immobilisations en cours restent sous les seuils.") : t("Tous les camions sont en service.")}</p>
      ) : (
        <ul className="space-y-1.5">
          {alerted.slice(0, 6).map((tr) => (
            <li key={tr.truck_id}>
              <Link href={`/reparations/camion/${tr.truck_id}`} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:border-primary/40">
                <AlertBadge level={tr.alert} t={t} />
                <span className="font-mono font-semibold">{tr.truck.matricule}</span>
                <span className="text-muted-foreground">
                  {t(FLEET_STATE_LABELS[tr.state])}
                  {tr.since ? ` · ${t("depuis le {date} ({count} j)", { date: formatDateFr(tr.since), count: tr.currentDays })}` : ""}
                </span>
                <span className="ms-auto text-xs text-muted-foreground">{alertReasonTexts(t, tr, fleet.rules).join(" ; ")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
