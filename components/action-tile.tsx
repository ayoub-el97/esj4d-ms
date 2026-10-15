import Link from "next/link";
import { cn } from "@/lib/utils";

/** Grande tuile d'action (ex. "Feuille de présence des équipes de collecte"). */
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
        "flex min-h-28 flex-col items-center justify-center gap-1 rounded-xl border bg-card p-4 text-center shadow-sm transition-colors hover:bg-muted",
        className,
      )}
    >
      {icon && <span className="text-indigo-600">{icon}</span>}
      <span className="font-semibold">{label}</span>
      {description && <span className="text-xs text-muted-foreground">{description}</span>}
    </Link>
  );
}

export function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
