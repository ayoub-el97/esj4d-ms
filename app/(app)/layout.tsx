import Link from "next/link";
import { Home, LogOut, Settings, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/link-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white">
              E
            </span>
            <span className="hidden sm:inline">ESJ-4D</span>
          </Link>

          <nav className="ml-2 flex items-center gap-1">
            <LinkButton href="/" variant="ghost" size="sm">
              <Home /> <span className="hidden sm:inline">Accueil</span>
            </LinkButton>
            {user.permissions.employes.can_view && (
              <LinkButton href="/employes" variant="ghost" size="sm">
                <Users /> <span className="hidden sm:inline">Employés</span>
              </LinkButton>
            )}
            {user.permissions.parametres.can_view && (
              <LinkButton href="/parametres" variant="ghost" size="sm">
                <Settings /> <span className="hidden sm:inline">Paramètres</span>
              </LinkButton>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{user.fullName}</div>
              <Badge variant="secondary" className="text-[10px]">
                {ROLE_LABELS[user.role]}
              </Badge>
            </div>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm" title="Se déconnecter">
                <LogOut /> <span className="hidden sm:inline">Déconnexion</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
