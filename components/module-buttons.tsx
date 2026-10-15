import { CalendarRange, FileDown, History, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";

/**
 * Rangée de boutons standard d'un module :
 * Export PDF · Historique · Rapport mensuel · Accueil (maquette).
 * Chaque bouton n'apparaît que si son lien est fourni.
 */
export function ModuleButtons({
  pdfSlot,
  historyHref,
  monthlyHref,
  extra,
}: {
  /** Composant bouton d'export PDF (client) */
  pdfSlot?: React.ReactNode;
  historyHref?: string;
  monthlyHref?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="no-print mt-6 flex flex-wrap gap-2 border-t pt-4">
      {pdfSlot ?? null}
      {historyHref && (
        <LinkButton href={historyHref} variant="outline">
          <History /> Historique
        </LinkButton>
      )}
      {monthlyHref && (
        <LinkButton href={monthlyHref} variant="outline">
          <CalendarRange /> Rapport mensuel
        </LinkButton>
      )}
      {extra}
      <LinkButton href="/" variant="secondary" className="ml-auto">
        <Home /> Accueil
      </LinkButton>
    </div>
  );
}

export function PdfButtonPlaceholder() {
  return (
    <Button variant="outline" disabled title="Disponible prochainement">
      <FileDown /> Export PDF
    </Button>
  );
}
