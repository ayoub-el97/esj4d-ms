import { CalendarDays, KeyRound, Settings2, Users } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { ModuleHeader } from "@/components/module-header";
import { ActionTile, TileGrid } from "@/components/action-tile";
import { ModuleButtons } from "@/components/module-buttons";

export const metadata = { title: "Paramètres" };

export default async function ParametresPage() {
  await requireModule("parametres");
  return (
    <div>
      <ModuleHeader title="Paramètres" subtitle="Administration du système" />
      <TileGrid>
        <ActionTile href="/parametres/comptes" label="Comptes utilisateurs" description="Créer des comptes, attribuer les rôles" icon={<Users />} />
        <ActionTile href="/parametres/permissions" label="Permissions" description="Droits de consultation et de modification par rôle" icon={<KeyRound />} />
        <ActionTile href="/parametres/reglages" label="Réglages" description="Société, agence, e-mail du directeur, règles de calcul" icon={<Settings2 />} />
        <ActionTile href="/parametres/feries" label="Jours fériés" description="Calendrier des jours fériés" icon={<CalendarDays />} />
      </TileGrid>
      <ModuleButtons />
    </div>
  );
}
