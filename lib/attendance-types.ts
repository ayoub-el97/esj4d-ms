import type { AttendanceStatus, Position, TeamType } from "@/lib/types";

/** Ligne d'une feuille de présence (côté client et serveur). */
export type SheetRow = {
  id: string | null;
  employee_id: string;
  shift: number;
  status: AttendanceStatus;
  time_in: string;
  time_out: string;
  /** Heures sup. saisies par le responsable (ajoutées en totalité) */
  overtime_manual: number;
  /** Heures sup. automatiques (calculées par la base depuis l'heure de sortie) */
  overtime_auto: number;
  /** Départ anticipé pour maladie (statut « Absent maladie ») : 0 h standard, heures travaillées en HS manuelles */
  sick_departure?: boolean;
  observation: string;
  replacing_employee_id: string | null;
  chauffeur_id: string | null;
  /** Camion conduit ce jour-là (chauffeurs titulaires et remplaçants) */
  truck_id: string | null;
  /** Fonction du jour (enregistrée dans le pointage de cette date) */
  position: Position;
  team_type: TeamType;
  /** Fonction habituelle (fiche de l'employé) : jamais modifiée par le pointage */
  usual_position?: Position;
  // Affichage
  order_number: number;
  name: string;
  matricule: string;
  rest_day: number | null;
  /** Agent ajouté pour la journée (remplaçant / renfort) */
  is_extra: boolean;
  /** Date/heure de la dernière saisie (distincte de la date d'activité) */
  entered_at: string | null;
  /** Congé ou récupération accepté pour cette date */
  planned: "conge" | "recuperation" | null;
  /** Remplaçant attitré du titulaire (jours de repos) */
  substitute_id: string | null;
  /** Congé approuvé couvrant cette date : le statut est verrouillé sur « Congé » */
  leave_lock?: { request_id: string } | null;
  /** Modification autorisée (dérogation motivée) sur une date de congé approuvé */
  leave_override?: { id: string; reason: string; at: string } | null;
  /** Affectation temporaire du jour dans une autre équipe que l'équipe permanente */
  assignment?: DayAssignment | null;
};

/** Affectation temporaire d'un employé à une équipe pour une date (la fiche n'est pas modifiée). */
export type DayAssignment = { team: TeamType; usual_team: TeamType; position: Position; chauffeur_id: string | null; source: "manuel" | "pointage" };

export type SheetPayload = {
  activity_date: string;
  team_type: TeamType;
  team_lead: string;
  rows: SheetRow[];
  /** Confirmation explicite : transférer les employés déjà pointés dans une autre équipe / accepter un camion en double */
  confirm_conflicts?: boolean;
};

/** Employé déjà pointé ce jour dans une autre équipe (affiché sur la feuille). */
export type ElsewhereRow = { employee_id: string; name: string; team_type: TeamType; position: Position; shift: number; /** affectation temporaire du jour */ assigned?: boolean };

export type EmployeeOption = {
  id: string;
  order_number: number;
  name: string;
  matricule: string;
  position: Position;
  team_type: TeamType;
  rest_day: number | null;
  chauffeur_id: string | null;
  substitute_id: string | null;
};
