import type { AppModule } from "@/lib/types";

export type ModuleDef = {
  key: AppModule;
  /** Libellés en français : traduits à l'affichage avec t() */
  label: string;
  href: string;
  description: string;
  /** Classes Tailwind de la pastille d'icône (tableau de bord et menus) */
  accent: string;
};

/** Les 10 modules du tableau de bord (ordre du cahier des charges). */
export const DASHBOARD_MODULES: ModuleDef[] = [
  { key: "pointage", label: "Pointage", href: "/pointage", description: "Feuilles de présence des équipes", accent: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
  { key: "pointage", label: "Rapport mensuel de pointage", href: "/pointage/mensuel", description: "Grille du mois (P, R, CP…) générée depuis le Pointage", accent: "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300" },
  { key: "rapport_journalier", label: "Rapport journalier", href: "/rapport-journalier", description: "Nettoiement, collecte et récapitulatif global", accent: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  { key: "rapport_mensuel", label: "Rapport mensuel", href: "/rapport-mensuel", description: "Synthèse mensuelle", accent: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  { key: "rapport_camions", label: "Rapport camions", href: "/rapport-camions", description: "Suivi journalier des véhicules", accent: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  // Même permission que le rapport camions (lecture / modification)
  { key: "rapport_camions", label: "Problèmes et réparations", href: "/reparations", description: "Pannes, réparations, reçus et dépenses par camion", accent: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  { key: "achats", label: "Achats de matériel", href: "/achats", description: "Achats, reçus, paiements et dépenses mensuelles", accent: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300" },
  { key: "conges", label: "Congé / Récupération", href: "/conges", description: "Demandes, soldes de congés et de récupération", accent: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
  { key: "avertissements", label: "Avertissements", href: "/avertissements", description: "Incidents et sanctions", accent: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
  { key: "programme", label: "Programme de travail", href: "/programme", description: "Tâches planifiées", accent: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  { key: "dechet_vert", label: "Déchet vert", href: "/dechet-vert", description: "Branches, feuilles et résidus végétaux", accent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  { key: "rapports_travailleurs", label: "Rapports travailleurs", href: "/rapports-travailleurs", description: "Historique par employé", accent: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300" },
  { key: "cloture", label: "Clôturer la journée", href: "/cloture", description: "Close System", accent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
];

export const ADMIN_MODULES: ModuleDef[] = [
  { key: "parametres", label: "Profil de l'entreprise", href: "/profil", description: "Logo, nom, chefs d'équipe, employés", accent: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { key: "employes", label: "Employés", href: "/employes", description: "Agents, postes et équipes", accent: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { key: "parametres", label: "Paramètres", href: "/parametres", description: "Comptes, permissions, réglages", accent: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
];
