import type { AppModule } from "@/lib/types";

export type ModuleDef = {
  key: AppModule;
  label: string;
  href: string;
  description: string;
  /** Classes Tailwind de la tuile du tableau de bord */
  color: string;
};

/** Les 10 modules du tableau de bord (ordre du cahier des charges). */
export const DASHBOARD_MODULES: ModuleDef[] = [
  { key: "pointage", label: "Pointage", href: "/pointage", description: "Feuilles de présence des équipes", color: "bg-indigo-600 hover:bg-indigo-700" },
  { key: "rapport_journalier", label: "Rapport journalier", href: "/rapport-journalier", description: "Nettoiement, collecte et récapitulatif global", color: "bg-indigo-600 hover:bg-indigo-700" },
  { key: "rapport_mensuel", label: "Rapport mensuel", href: "/rapport-mensuel", description: "Synthèse mensuelle", color: "bg-indigo-600 hover:bg-indigo-700" },
  { key: "rapport_camions", label: "Rapport camions", href: "/rapport-camions", description: "Suivi journalier des véhicules", color: "bg-indigo-600 hover:bg-indigo-700" },
  { key: "conges", label: "Congés", href: "/conges", description: "Demandes et soldes de congés", color: "bg-indigo-600 hover:bg-indigo-700" },
  { key: "avertissements", label: "Avertissements", href: "/avertissements", description: "Incidents et sanctions", color: "bg-indigo-600 hover:bg-indigo-700" },
  { key: "programme", label: "Programme de travail", href: "/programme", description: "Tâches planifiées", color: "bg-indigo-600 hover:bg-indigo-700" },
  { key: "dechet_vert", label: "Déchet vert", href: "/dechet-vert", description: "Branches, feuilles et résidus végétaux", color: "bg-indigo-600 hover:bg-indigo-700" },
  { key: "rapports_travailleurs", label: "Rapports travailleurs", href: "/rapports-travailleurs", description: "Historique par employé", color: "bg-indigo-600 hover:bg-indigo-700" },
  { key: "cloture", label: "Clôturer la journée", href: "/cloture", description: "Close System", color: "bg-red-600 hover:bg-red-700" },
];

export const ADMIN_MODULES: ModuleDef[] = [
  { key: "employes", label: "Employés", href: "/employes", description: "Agents, postes et équipes", color: "bg-slate-700 hover:bg-slate-800" },
  { key: "parametres", label: "Paramètres", href: "/parametres", description: "Comptes, permissions, réglages", color: "bg-slate-700 hover:bg-slate-800" },
];
