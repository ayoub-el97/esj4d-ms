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
  conges: "Congés",
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

export type Position = "chauffeur" | "rippeur" | "balayeur";
export const POSITION_LABELS: Record<Position, string> = {
  chauffeur: "Chauffeur",
  rippeur: "Rippeur",
  balayeur: "Balayeur",
};

export type AttendanceStatus = "present" | "repos" | "ferie" | "absent" | "absent_maladie" | "conge";
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Présent",
  repos: "Repos",
  ferie: "Jour férié",
  absent: "Absent",
  absent_maladie: "Absent maladie",
  conge: "Congé",
};
export const ATTENDANCE_STATUSES = Object.keys(ATTENDANCE_STATUS_LABELS) as AttendanceStatus[];

export const WEEKDAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
export const WEEKDAY_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export type DayStatus = "open" | "closed";

/** Résultat standard d'une Server Action. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string };
