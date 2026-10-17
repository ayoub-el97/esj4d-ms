import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tuile d'action (ex. "Feuille de présence des équipes de collecte").
 * Téléphone : ligne compacte (icône, texte, flèche). Ordinateur : carte.
 */
export function ActionTile({
  href,
  label,
  description,
  icon,
  className,
}: {
  href: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border bg-card p-4 text-start shadow-sm transition hover:border-primary/30 hover:shadow-md sm:min-h-32 sm:flex-col sm:items-start sm:justify-between",
        className,
      )}
    >
      {icon && <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">{icon}</span>}
      <span className="min-w-0 flex-1 sm:flex-none">
        <span className="block font-semibold">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary sm:hidden rtl:rotate-180" />
    </Link>
  );
}

export function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
