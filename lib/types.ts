// Types et libellés partagés (interface en français)

export type AppRole = "admin" | "secretaire" | "controleur" | "lecture";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Directeur / Administrateur",
  secretaire: "Secrétaire",
  controleur: "Contrôleur / Superviseur",
  lecture: "Lecture seule",
};

export const ROLES = Object.keys(ROLE_LABELS) as AppRole[];

export type AppModule =
  | "pointage"
  | "rapport_journalier"
  | "rapport_mensuel"
  | "rapport_camions"
  | "conges"
  | "avertissements"
  | "programme"
  | "dechet_vert"
  | "rapports_travailleurs"
  | "cloture"
  | "employes"
  | "parametres"
  | "achats";

export const MODULE_LABELS: Record<AppModule, string> = {
  pointage: "Pointage",
  rapport_journalier: "Rapport journalier",
  rapport_mensuel: "Rapport mensuel",
  rapport_camions: "Rapport camions",
  conges: "Congé / Récupération",
  avertissements: "Avertissements",
  programme: "Programme de travail",
  dechet_vert: "Déchet vert",
  rapports_travailleurs: "Rapports travailleurs",
  cloture: "Clôturer la journée",
  employes: "Employés",
  parametres: "Paramètres",
  achats: "Achats de matériel",
};

/**
 * Droits par défaut d'un module ajouté après coup, tant qu'aucune ligne n'est enregistrée dans
 * Paramètres › Permissions (même règle que la fonction SQL module_default_permission).
 */
export function defaultPermission(module: AppModule, role: AppRole): { can_view: boolean; can_edit: boolean } {
  if (module === "achats") {
    if (role === "admin" || role === "secretaire") return { can_view: true, can_edit: true };
    if (role === "lecture") return { can_view: true, can_edit: false };
  }
  return { can_view: false, can_edit: false };
}

export const MODULES = Object.keys(MODULE_LABELS) as AppModule[];

export type Permission = { can_view: boolean; can_edit: boolean };
export type PermissionMap = Record<AppModule, Permission>;

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
};

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  permissions: PermissionMap;
};

export type TeamType = "collecte" | "nettoiement";
export const TEAM_LABELS: Record<TeamType, string> = {
  collecte: "Collecte",
  nettoiement: "Nettoiement",
};
export const TEAM_SLUGS: Record<string, TeamType> = { collecte: "collecte", nettoiement: "nettoiement" };

export type Position =
  | "balayeur"
  | "rippeur"
  | "chauffeur"
  | "chauffeur_remplacant"
  | "rippeur_remplacant"
  | "superviseur"
  | "chef_equipe"
  | "agent_securite"
  | "mecanicien"
  | "gardien"
  | "directeur"
  | "autre"
  | "secretaire"
  | "responsable";
/** Ordre d'affichage des postes */
export const POSITION_LABELS: Record<Position, string> = {
  balayeur: "Balayeur",
  rippeur: "Rippeur",
  chauffeur: "Chauffeur",
  chauffeur_remplacant: "Chauffeur remplaçant",
  rippeur_remplacant: "Rippeur remplaçant",
  superviseur: "Superviseur",
  chef_equipe: "Chef d'équipe",
  agent_securite: "Agent de sécurité",
  mecanicien: "Mécanicien",
  gardien: "Gardien",
  directeur: "Directeur",
  secretaire: "Secrétaire",
  responsable: "Responsable",
  autre: "Autre fonction",
};
/** Postes de la collecte pointés en groupes dédiés (hors équipes chauffeur + rippeurs), dans cet ordre */
export const COLLECTE_STAFF_GROUPS: { position: Position; title: string; placement: "top" | "after" }[] = [
  { position: "chef_equipe", title: "Chef d'équipe", placement: "top" },
  { position: "superviseur", title: "Superviseur", placement: "top" },
  { position: "agent_securite", title: "Sécurité", placement: "after" },
  { position: "mecanicien", title: "Mécanicien", placement: "after" },
  { position: "gardien", title: "Gardien", placement: "after" },
  { position: "directeur", title: "Direction", placement: "after" },
  { position: "responsable", title: "Responsable", placement: "after" },
  { position: "secretaire", title: "Secrétariat", placement: "after" },
  { position: "autre", title: "Autres fonctions", placement: "after" },
];
/** Tous les postes, y compris ceux retirés (historique, filtres, pointages passés). */
export const ALL_POSITIONS = Object.keys(POSITION_LABELS) as Position[];
/** Postes retirés : plus proposés ni attribuables, conservés pour l'historique. */
export const RETIRED_POSITIONS: Position[] = ["agent_securite"];
/** Postes proposés à la sélection (fiches employés, saisie groupée, fonction du jour). */
export const POSITIONS = ALL_POSITIONS.filter((p) => !RETIRED_POSITIONS.includes(p));
/** Postes de conduite (titulaire ou remplaçant) : peuvent conduire un camion */
export const DRIVER_POSITIONS: Position[] = ["chauffeur", "chauffeur_remplacant"];
/** Remplaçant attendu pour un titulaire */
export const SUBSTITUTE_POSITION: Partial<Record<Position, Position>> = { chauffeur: "chauffeur_remplacant", rippeur: "rippeur_remplacant" };
export const isSubstitutePosition = (p: Position) => p === "chauffeur_remplacant" || p === "rippeur_remplacant";
export const teamOfPosition = (p: Position): TeamType => (p === "balayeur" ? "nettoiement" : "collecte");

export type AttendanceStatus = "present" | "repos_travaille" | "absent" | "absent_maladie" | "conge" | "recuperation" | "repos" | "ferie";
/** Ordre d'affichage des statuts dans la feuille de présence */
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Présent",
  repos_travaille: "Jour de repos travaillé",
  absent: "Absent",
  absent_maladie: "Absent maladie",
  conge: "Congé payé",
  recuperation: "Récupération",
  repos: "Repos",
  ferie: "Jour férié",
};
/** Statuts où l'employé a travaillé (heures, HS) */
export const WORKED_STATUSES: AttendanceStatus[] = ["present", "repos_travaille"];
export const ATTENDANCE_STATUSES = Object.keys(ATTENDANCE_STATUS_LABELS) as AttendanceStatus[];

export const WEEKDAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
export const WEEKDAY_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export type DayStatus = "open" | "closed";

/** Résultat standard d'une Server Action. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string };
