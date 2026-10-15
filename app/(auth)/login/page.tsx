import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const notice =
    error === "inactif" ? "Votre compte est désactivé. Contactez l'administrateur." : undefined;

  return (
    <main className="flex flex-1 items-center justify-center p-4 bg-muted/40">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow">
            <Truck className="size-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">ESJ-4D</h1>
          <p className="text-sm text-muted-foreground">Gestion Collecte &amp; Nettoiement</p>
        </div>
        <LoginForm notice={notice} />
      </div>
    </main>
  );
}
