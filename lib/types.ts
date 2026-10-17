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
  | "parametres";

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
};

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

export type Position = "balayeur" | "rippeur" | "chauffeur" | "chauffeur_remplacant" | "rippeur_remplacant";
/** Ordre d'affichage des postes */
export const POSITION_LABELS: Record<Position, string> = {
  balayeur: "Balayeur",
  rippeur: "Rippeur",
  chauffeur: "Chauffeur",
  chauffeur_remplacant: "Chauffeur remplaçant",
  rippeur_remplacant: "Rippeur remplaçant",
};
export const POSITIONS = Object.keys(POSITION_LABELS) as Position[];
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
  conge: "Congé",
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
