import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ADMIN_MODULES, DASHBOARD_MODULES } from "@/lib/modules";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  const { error } = await searchParams;

  const visible = DASHBOARD_MODULES.filter((m) => user.permissions[m.key].can_view);
  const admin = ADMIN_MODULES.filter((m) => user.permissions[m.key].can_view);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">Bonjour {user.fullName}. Choisissez un module.</p>
      </div>

      {error === "acces_refuse" && (
        <Alert variant="destructive">
          <AlertDescription>Accès refusé : vous n&apos;avez pas la permission d&apos;ouvrir ce module.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {visible.map((m) => (
          <Link
            key={m.key}
            href={m.href}
            className={cn(
              "flex aspect-[4/3] flex-col items-center justify-center rounded-xl p-3 text-center text-white shadow-sm transition-colors",
              m.color,
            )}
          >
            <span className="text-base font-semibold leading-tight sm:text-lg">{m.label}</span>
            <span className="mt-1 hidden text-xs text-white/80 sm:block">{m.description}</span>
          </Link>
        ))}
      </div>

      {admin.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Administration</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {admin.map((m) => (
              <Link
                key={m.key}
                href={m.href}
                className={cn(
                  "flex h-20 flex-col items-center justify-center rounded-xl p-3 text-center text-white shadow-sm transition-colors",
                  m.color,
                )}
              >
                <span className="font-semibold">{m.label}</span>
                <span className="hidden text-xs text-white/80 sm:block">{m.description}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
