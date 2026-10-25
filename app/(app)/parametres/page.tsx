import { Building2, CalendarDays, KeyRound, MessageCircle, ScrollText, Settings2, Users } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ActionTile, TileGrid } from "@/components/action-tile";
import { ModuleButtons } from "@/components/module-buttons";

export const generateMetadata = pageTitle("Paramètres");

export default async function ParametresPage() {
  const [user, t] = await Promise.all([requireModule("parametres"), getT()]);
  return (
    <div>
      <ModuleHeader title={t("Paramètres")} subtitle={t("Administration du système")} />
      <TileGrid>
        <ActionTile href="/profil" label={t("Profil de l'entreprise")} description={t("Logo, nom, chefs d'équipe, employés")} icon={<Building2 />} />
        {user.role === "admin" && <ActionTile href="/parametres/audit" label={t("Journal d'audit")} description={t("Historique des créations, modifications, suppressions, clôtures")} icon={<ScrollText />} />}
        <ActionTile href="/parametres/comptes" label={t("Comptes utilisateurs")} description={t("Créer des comptes, attribuer les rôles")} icon={<Users />} />
        <ActionTile href="/parametres/permissions" label={t("Permissions")} description={t("Droits de consultation et de modification par rôle")} icon={<KeyRound />} />
        {user.role === "admin" && <ActionTile href="/parametres/whatsapp" label={t("Configuration WhatsApp")} description={t("Envoi des rapports au directeur par WhatsApp")} icon={<MessageCircle />} />}
        <ActionTile href="/parametres/reglages" label={t("Réglages")} description={t("E-mail du directeur, règles de calcul")} icon={<Settings2 />} />
        <ActionTile href="/parametres/feries" label={t("Jours fériés")} description={t("Calendrier des jours fériés")} icon={<CalendarDays />} />
      </TileGrid>
      <ModuleButtons />
    </div>
  );
}
