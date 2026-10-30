import type { ReactNode } from "react";
import type { CombinedReport } from "@/lib/data/combined-report";
import { formatDateFr } from "@/lib/dates";
import type { TFunction } from "@/lib/i18n/config";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <div className="font-medium">{children}</div>
    </div>
  );
}

function Lines({ items }: { items: string[] }) {
  if (!items.length) return <>—</>;
  return (
    <>
      {items.map((v, i) => (
        <div key={i} dir="auto">
          {v}
        </div>
      ))}
    </>
  );
}

/**
 * Lieux de travail des agents : feuille verticale (A4 portrait à l'impression) qui continue sur les pages
 * suivantes sans réduire le texte. Nettoiement puis Collecte, un camion par bloc.
 * `heading` : titre et date (retirés sur la page Pointage, qui les affiche déjà).
 */
export function CombinedReportView({ t, data, heading = true }: { t: TFunction; data: CombinedReport; heading?: boolean }) {
  return (
    <section className="rounded-xl border bg-card p-4 text-sm print:border-0 print:p-0">
      {heading && (
        <>
          <h2 className="text-center text-lg font-bold">{t("Lieux de travail des agents")}</h2>
          <p className="mb-3 text-center font-medium">{t("Date : {date}", { date: formatDateFr(data.date) })}</p>
        </>
      )}

      <h3 className="mb-1 border-b-2 border-foreground/40 pb-0.5 text-base font-semibold">{t("Nettoiement")}</h3>
      {data.cleaning === null ? (
        <p className="mb-4 text-muted-foreground">{t("Aucun rapport de nettoiement enregistré pour cette date.")}</p>
      ) : data.cleaning.length === 0 ? (
        <p className="mb-4 text-muted-foreground">{t("Aucun employé dans le rapport de nettoiement de cette date.")}</p>
      ) : (
        <div className="mb-4">
          <div className="grid grid-cols-2 gap-x-4 border-b py-1 text-xs font-semibold text-muted-foreground">
            <span>{t("Employé")}</span>
            <span>{t("Lieu de travail")}</span>
          </div>
          {data.cleaning.map((r) => (
            <div key={r.id} className="grid break-inside-avoid grid-cols-2 gap-x-4 border-b border-dotted py-1">
              <span className="min-w-0 font-medium">{r.name}</span>
              <span dir="auto" className="min-w-0">
                {r.location || "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      <h3 className="mb-2 border-b-2 border-foreground/40 pb-0.5 text-base font-semibold">{t("Collecte")}</h3>
      {data.trucks === null ? (
        <p className="text-muted-foreground">{t("Aucun rapport de collecte enregistré pour cette date.")}</p>
      ) : (
        <div className="space-y-3">
          {data.trucks.map((tr) => (
            <article key={tr.key} className="break-inside-avoid rounded-lg border p-3">
              <div className="mb-1 border-b pb-1 font-bold">
                {tr.type} {t("N°")} {tr.number}
                {tr.matricule && tr.matricule !== tr.number && <span className="font-normal text-muted-foreground"> ({tr.matricule})</span>}
              </div>
              {tr.shifts.map((s, i) => (
                <div key={i} className="mb-1">
                  {s.shift && <div className="font-semibold">{s.shift === "matin" ? t("Matin") : t("Soir")}</div>}
                  <Field label={t("Chauffeur")}>{s.chauffeur || "—"}</Field>
                  <Field label={t("Équipe")}>
                    <Lines items={s.crew} />
                  </Field>
                </div>
              ))}
              <Field label={t("Lieux de travail")}>
                <Lines items={tr.locationList} />
              </Field>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
