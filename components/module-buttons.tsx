import { CalendarRange, History, Home } from "lucide-react";
import { LinkButton } from "@/components/link-button";
import { getT } from "@/lib/i18n/server";

/**
 * Rangée de boutons standard d'un module :
 * Export PDF · Historique · Rapport mensuel · Accueil (maquette).
 * Chaque bouton n'apparaît que si son lien est fourni.
 */
export async function ModuleButtons({
  pdfSlot,
  historyHref,
  monthlyHref,
  extra,
}: {
  pdfSlot?: React.ReactNode;
  historyHref?: string;
  monthlyHref?: string;
  extra?: React.ReactNode;
}) {
  const t = await getT();
  return (
    <div className="no-print mt-6 flex flex-wrap gap-2 border-t pt-4">
      {pdfSlot ?? null}
      {historyHref && (
        <LinkButton href={historyHref} variant="outline">
          <History /> {t("Historique")}
        </LinkButton>
      )}
      {monthlyHref && (
        <LinkButton href={monthlyHref} variant="outline">
          <CalendarRange /> {t("Rapport mensuel")}
        </LinkButton>
      )}
      {extra}
      <LinkButton href="/" variant="secondary" className="ms-auto">
        <Home /> {t("Accueil")}
      </LinkButton>
    </div>
  );
}
