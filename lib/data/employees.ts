import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Position, TeamType } from "@/lib/types";

export type Truck = {
  id: string;
  matricule: string;
  brand: string;
  is_active: boolean;
};

export type Employee = {
  id: string;
  order_number: number;
  matricule: string;
  last_name: string;
  first_name: string;
  position: Position;
  team_type: TeamType;
  rest_day: number | null;
  truck_id: string | null;
  chauffeur_id: string | null;
  /** Remplaçant attitré (chauffeur remplaçant ou rippeur remplaçant) */
  substitute_id: string | null;
  hire_date: string | null;
  phone: string;
  is_active: boolean;
};

export const EMPLOYEE_COLUMNS =
  "id, order_number, matricule, last_name, first_name, position, team_type, rest_day, truck_id, chauffeur_id, substitute_id, hire_date, phone, is_active";

export function employeeName(e: Pick<Employee, "last_name" | "first_name">): string {
  return `${e.last_name} ${e.first_name}`.trim();
}

export async function getTrucks(onlyActive = false): Promise<Truck[]> {
  const supabase = await createClient();
  let q = supabase.from("trucks").select("id, matricule, brand, is_active").order("matricule");
  if (onlyActive) q = q.eq("is_active", true);
  const { data } = await q.returns<Truck[]>();
  return data ?? [];
}

export async function getEmployees(opts: { team?: TeamType; onlyActive?: boolean } = {}): Promise<Employee[]> {
  const supabase = await createClient();
  let q = supabase.from("employees").select(EMPLOYEE_COLUMNS).order("order_number");
  if (opts.team) q = q.eq("team_type", opts.team);
  if (opts.onlyActive) q = q.eq("is_active", true);
  const { data } = await q.returns<Employee[]>();
  return data ?? [];
}

export async function getEmployee(id: string): Promise<Employee | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select(EMPLOYEE_COLUMNS).eq("id", id).maybeSingle<Employee>();
  return data;
}

export type EmployeeFilters = { equipe?: string; poste?: string; statut?: string; q?: string };
export type EmployeeRow = Employee & { truck_label: string; chauffeur_label: string; substitute_label: string };

/** Liste filtrée des employés avec libellés d'affectation (page Employés et Profil). */
export async function getEmployeeRows(f: EmployeeFilters): Promise<{ rows: EmployeeRow[]; total: number; active: number }> {
  const [employees, trucks] = await Promise.all([getEmployees(), getTrucks()]);
  const trucksById = new Map(trucks.map((t) => [t.id, t.matricule]));
  const namesById = new Map(employees.map((e) => [e.id, employeeName(e)]));
  const q = (f.q ?? "").toLowerCase();
  const rows = employees
    .filter((e) => !f.equipe || e.team_type === f.equipe)
    .filter((e) => !f.poste || e.position === f.poste)
    .filter((e) => (f.statut === "inactif" ? !e.is_active : f.statut === "tous" ? true : e.is_active))
    .filter((e) => !q || `${e.last_name} ${e.first_name} ${e.matricule}`.toLowerCase().includes(q))
    .map((e) => ({
      ...e,
      truck_label: e.truck_id ? (trucksById.get(e.truck_id) ?? "") : "",
      chauffeur_label: e.chauffeur_id ? (namesById.get(e.chauffeur_id) ?? "") : "",
      substitute_label: e.substitute_id ? (namesById.get(e.substitute_id) ?? "") : "",
    }));
  return { rows, total: employees.length, active: employees.filter((e) => e.is_active).length };
}

export type RestDayChange = { id: number; old_rest_day: number | null; new_rest_day: number | null; changed_by_email: string | null; changed_at: string };

/** Historique des changements du jour de repos habituel (alimenté par un trigger). */
export async function getRestDayHistory(employeeId: string): Promise<RestDayChange[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_rest_day_history")
    .select("id, old_rest_day, new_rest_day, changed_by_email, changed_at")
    .eq("employee_id", employeeId)
    .order("changed_at", { ascending: false })
    .returns<RestDayChange[]>();
  return data ?? [];
}

/** Chauffeurs avec leurs rippeurs rattachés (équipes de collecte). */
export type CollectionTeam = { chauffeur: Employee; truck: Truck | null; rippeurs: Employee[] };

export async function getCollectionTeams(onlyActive = true): Promise<{ teams: CollectionTeam[]; unassigned: Employee[] }> {
  const [employees, trucks] = await Promise.all([getEmployees({ team: "collecte", onlyActive }), getTrucks()]);
  const trucksById = new Map(trucks.map((t) => [t.id, t]));
  const chauffeurs = employees.filter((e) => e.position === "chauffeur");
  const rippeurs = employees.filter((e) => e.position === "rippeur");
  const teams: CollectionTeam[] = chauffeurs.map((c) => ({
    chauffeur: c,
    truck: c.truck_id ? (trucksById.get(c.truck_id) ?? null) : null,
    rippeurs: rippeurs.filter((r) => r.chauffeur_id === c.id),
  }));
  const unassigned = rippeurs.filter((r) => !r.chauffeur_id || !chauffeurs.some((c) => c.id === r.chauffeur_id));
  return { teams, unassigned };
}
