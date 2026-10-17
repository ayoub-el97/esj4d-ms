import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppModule, CurrentUser, PermissionMap, Profile } from "@/lib/types";
import { MODULES } from "@/lib/types";

/**
 * Couche d'accès aux données d'authentification.
 * Lit l'utilisateur connecté, son profil et ses permissions.
 * Renvoie null si aucune session valide.
 */
export async function getOptionalUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (!profile || !profile.is_active) return null;

  const { data: perms } = await supabase
    .from("role_permissions")
    .select("module, can_view, can_edit")
    .eq("role", profile.role);

  const permissions = Object.fromEntries(
    MODULES.map((m) => [m, { can_view: false, can_edit: false }]),
  ) as PermissionMap;
  for (const p of perms ?? []) {
    permissions[p.module as AppModule] = { can_view: p.can_view, can_edit: p.can_edit };
  }
  if (profile.role === "admin") {
    for (const m of MODULES) permissions[m] = { can_view: true, can_edit: true };
  }

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name || profile.email,
    role: profile.role,
    permissions,
  };
}

/** Utilisateur connecté ; redirige vers /login sinon. */
export async function getCurrentUser(): Promise<CurrentUser> {
  const user = await getOptionalUser();
  if (!user) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login?error=inactif");
  }
  return user;
}

export function hasPermission(user: CurrentUser, module: AppModule, level: "view" | "edit"): boolean {
  const perm = user.permissions[module];
  return level === "edit" ? perm.can_edit : perm.can_view;
}

/** Vérifie un droit d'accès ; redirige vers le tableau de bord si refusé. */
export async function requireModule(module: AppModule, level: "view" | "edit" = "view"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!hasPermission(user, module, level)) redirect("/?error=acces_refuse");
  return user;
}

/** Variante pour les Server Actions : renvoie une erreur au lieu de rediriger. */
export async function assertModule(
  module: AppModule,
  level: "view" | "edit" = "edit",
): Promise<{ user: CurrentUser } | { error: string }> {
  const user = await getOptionalUser();
  if (!user) return { error: "Session expirée : reconnectez-vous." };
  if (!hasPermission(user, module, level)) return { error: "Accès refusé : vous n'avez pas la permission nécessaire." };
  return { user };
}

/**
 * Traduit les erreurs levées par la base (triggers, RLS) en messages lisibles.
 * Le résultat est une clé de traduction (texte français) : l'appelant le passe à t().
 */
export function friendlyError(message: string): string {
  if (message.includes("JOURNEE_CLOTUREE")) return "Cette journée est clôturée : modification impossible.";
  if (message.includes("ACCES_REFUSE") && message.includes("rouvrir")) return "Seul un administrateur peut rouvrir une journée.";
  if (message.includes("ACCES_REFUSE")) return "Vous n'êtes pas autorisé à clôturer une journée.";
  if (message.includes("JUSTIFICATION_REQUISE")) return "Indiquez le motif de la réouverture.";
  if (message.includes("JOURNEE_OUVERTE")) return "Cette journée n'est pas clôturée.";
  if (message.includes("DATE_INVALIDE")) return "Impossible de clôturer une journée future.";
  if (message.includes("row-level security")) return "Accès refusé par la sécurité de la base de données.";
  if (message.includes("duplicate key")) return "Doublon : cet enregistrement existe déjà.";
  return message;
}
