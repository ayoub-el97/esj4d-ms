import type { AttendanceStatus, Position, TeamType } from "@/lib/types";

/** Ligne d'une feuille de présence (côté client et serveur). */
export type SheetRow = {
  id: string | null;
  employee_id: string;
  shift: number;
  status: AttendanceStatus;
  time_in: string;
  time_out: string;
  overtime_hours: number;
  observation: string;
  replacing_employee_id: string | null;
  chauffeur_id: string | null;
  position: Position;
  team_type: TeamType;
  // Affichage
  order_number: number;
  name: string;
  matricule: string;
  rest_day: number | null;
  /** Agent ajouté pour la journée (remplaçant / renfort) */
  is_extra: boolean;
};

export type SheetPayload = {
  activity_date: string;
  team_type: TeamType;
  team_lead: string;
  rows: SheetRow[];
};

export type EmployeeOption = {
  id: string;
  order_number: number;
  name: string;
  matricule: string;
  position: Position;
  team_type: TeamType;
  rest_day: number | null;
  chauffeur_id: string | null;
};
