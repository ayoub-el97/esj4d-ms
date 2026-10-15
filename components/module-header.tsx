import { ArrowLeft, Home } from "lucide-react";
import { LinkButton } from "@/components/link-button";

/**
 * Bandeau de module (titre + bouton Accueil), repris de la maquette.
 * `backHref` affiche un bouton retour vers une page parente.
 */
export function ModuleHeader({
  title,
  subtitle,
  backHref,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-white shadow-sm">
        {backHref && (
          <LinkButton
            href={backHref}
            variant="ghost"
            size="icon-sm"
            className="text-white hover:bg-white/15 hover:text-white"
            aria-label="Retour"
          >
            <ArrowLeft />
          </LinkButton>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold sm:text-xl">{title}</h1>
          {subtitle && <p className="truncate text-xs text-white/80">{subtitle}</p>}
        </div>
        <LinkButton href="/" variant="secondary" size="sm">
          <Home /> Accueil
        </LinkButton>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
