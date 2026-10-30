import type { CombinedReport } from "@/lib/data/combined-report";
import { formatDateFr } from "@/lib/dates";
import type { TFunction } from "@/lib/i18n/config";

/**
 * Rapport Collecte / Nettoiement : tableau compact, une page à l'impression.
 * Nettoiement : lieu de travail à gauche, nom de l'employé à droite (en vis-à-vis).
 */
export function CombinedReportView({ t, data }: { t: TFunction; data: CombinedReport }) {
  // Impression : taille du texte selon le volume, pour tenir sur une page A4 (8 à 11 px)
  const cleaning = Math.ceil((data.cleaning?.length ?? 1) / 2) + 2;
  const truckLines = (data.trucks ?? []).reduce((n, tr) => n + 2 + tr.shifts.length * 2 + Math.floor(tr.locations.length / 45), 0);
  const printSize = Math.max(8, Math.min(11, 960 / ((cleaning + Math.ceil(truckLines / 2) + 7) * 1.45)));
  return (
    <section className="combined-report rounded-xl border bg-card p-3 text-xs leading-snug print:border-0 print:p-0">
      <style>{`@media print { .combined-report { font-size: ${printSize.toFixed(1)}px !important; line-height: 1.2 !important; } .combined-report h2 { font-size: 13px; } }`}</style>
      <h2 className="text-center text-sm font-bold">{t("Rapport Collecte / Nettoiement")}</h2>
      <p className="mb-2 text-center font-medium">{t("Date : {date}", { date: formatDateFr(data.date) })}</p>

      <h3 className="mb-1 border-b font-semibold">{t("Nettoiement")}</h3>
      {data.cleaning === null ? (
        <p className="mb-2 text-muted-foreground">{t("Aucun rapport de nettoiement enregistré pour cette date.")}</p>
      ) : data.cleaning.length === 0 ? (
        <p className="mb-2 text-muted-foreground">{t("Aucun employé dans le rapport de nettoiement de cette date.")}</p>
      ) : (
        <div dir="ltr" className="mb-2 gap-x-6 sm:columns-2 print:columns-2">
          <div className="flex break-inside-avoid justify-between gap-2 font-semibold text-muted-foreground">
            <span>{t("Lieu de travail")}</span>
            <span>{t("Employé")}</span>
          </div>
          {data.cleaning.map((r, i) => (
            <div key={i} className="flex break-inside-avoid justify-between gap-2 border-b border-dotted py-px">
              <span className="min-w-0">{r.location || "—"}</span>
              <span className="shrink-0 text-right font-medium">{r.name}</span>
            </div>
          ))}
        </div>
      )}

      <h3 className="mb-1 border-b font-semibold">{t("Collecte")}</h3>
      {data.trucks === null ? (
        <p className="text-muted-foreground">{t("Aucun rapport de collecte enregistré pour cette date.")}</p>
      ) : (
        <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 print:grid-cols-2">
          {data.trucks.map((tr) => (
            <div key={tr.key} className="break-inside-avoid border-b border-dotted pb-1">
              <div className="font-bold">
                {tr.type} {t("N°")} {tr.number}
                {tr.matricule && tr.matricule !== tr.number && <span className="font-normal text-muted-foreground"> ({tr.matricule})</span>}
              </div>
              {tr.shifts.map((s, i) => (
                <div key={i}>
                  {s.shift && <span className="font-semibold">{s.shift === "matin" ? t("Matin") : t("Soir")} — </span>}
                  <span>
                    {t("Chauffeur")} : {s.chauffeur || "—"}
                  </span>
                  <span className="block">
                    {t("Équipe")} : {s.crew.length ? s.crew.join(", ") : "—"}
                  </span>
                </div>
              ))}
              <div>
                {t("Lieux de travail")} : {tr.locations || "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
