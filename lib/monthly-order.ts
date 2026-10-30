// Ordre du rapport mensuel de pointage (écran et PDF) — module pur.
import type { Position } from "@/lib/types";

/**
 * Ordre hiérarchique : les remplaçants sont avec leur fonction (chauffeurs, rippeurs) ;
 * les fonctions hors de cette liste (superviseur, agent de sécurité, autre) viennent à la fin.
 */
const MONTHLY_ORDER: Position[][] = [["directeur"], ["responsable"], ["secretaire"], ["chef_equipe"], ["mecanicien"], ["gardien"], ["chauffeur", "chauffeur_remplacant"], ["rippeur", "rippeur_remplacant"], ["balayeur"]];

export function monthlyRank(position: string | null | undefined): number {
  const i = MONTHLY_ORDER.findIndex((g) => g.includes(position as Position));
  return i < 0 ? MONTHLY_ORDER.length : i;
}

type Sortable = { position?: string | null; usual_position?: string | null; last_name?: string; first_name?: string };

/**
 * Fonction permanente (fiche de l'employé), puis nom et prénom : une affectation temporaire
 * ne déplace pas l'employé. Versions finalisées anciennes sans fonction permanente : fonction affichée.
 */
export function compareMonthly(a: Sortable, b: Sortable): number {
  const name = (x?: string, y?: string) => (x ?? "").localeCompare(y ?? "", "fr", { sensitivity: "base" });
  return monthlyRank(a.usual_position ?? a.position) - monthlyRank(b.usual_position ?? b.position) || name(a.last_name, b.last_name) || name(a.first_name, b.first_name);
}
