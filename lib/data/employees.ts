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
  hire_date: string | null;
  phone: string;
  is_active: boolean;
};

export const EMPLOYEE_COLUMNS =
  "id, order_number, matricule, last_name, first_name, position, team_type, rest_day, truck_id, chauffeur_id, hire_date, phone, is_active";

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
