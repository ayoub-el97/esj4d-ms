// Filtres de la vue « État de la flotte » (page et PDF).
import type { FleetTruck } from "@/lib/data/repairs";

export const FLEET_FILTERS = [
  { key: "tous", label: "Tous les camions" },
  { key: "hors_service", label: "Hors service" },
  { key: "en_reparation", label: "En réparation" },
  { key: "frequents", label: "Pannes fréquentes" },
  { key: "en_retard", label: "Réparation en retard" },
  { key: "repares", label: "Réparés sur la période" },
] as const;

export function applyFleetFilter(list: FleetTruck[], etat: string): FleetTruck[] {
  switch (etat) {
    case "hors_service":
      return list.filter((tr) => tr.state !== "en_service");
    case "en_reparation":
      return list.filter((tr) => tr.state === "en_reparation");
    case "frequents":
      return list.filter((tr) => tr.alertReasons.some((r) => r.startsWith("frequence")));
    case "en_retard":
      return list.filter((tr) => tr.overdue);
    case "repares":
      return list.filter((tr) => tr.repairedInPeriod > 0);
    default:
      return list;
  }
}

