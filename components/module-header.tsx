import { ArrowLeft } from "lucide-react";
import { LinkButton } from "@/components/link-button";
import { getT } from "@/lib/i18n/server";

/**
 * En-tête de page : retour, titre, sous-titre et actions de la page.
 * L'accueil est toujours accessible par la navigation (barre latérale / onglets).
 * `title` et `subtitle` sont déjà traduits par la page appelante.
 */
export async function ModuleHeader({
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
  const t = await getT();
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {backHref && (
          <LinkButton href={backHref} variant="outline" size="icon-sm" className="mt-0.5 shrink-0 bg-card" aria-label={t("Retour")}>
            <ArrowLeft className="rtl:rotate-180" />
          </LinkButton>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{children}</div>}
    </div>
  );
}
