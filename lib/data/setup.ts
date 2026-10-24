import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data/settings";

/** Matricules des données de démonstration (supabase/seed.sql) : à supprimer avant le pilote. */
export const DEMO_EMPLOYEE_MATRICULES = ["C001", "C002", "C003", "R001", "R002", "R003", "R004", "R005", "R006", "CR01", "RR01", "B001", "B002", "B003", "B004", "B005"];
export const DEMO_TRUCK_MATRICULES = ["77027-A-1", "77035-A-1", "77041-A-1"];

/** Tables de données d'exploitation comptées sur la page de mise en route (libellés en français). */
const DATA_TABLES: { table: string; label: string }[] = [
  { table: "attendance", label: "Lignes de pointage" },
  { table: "cleaning_reports", label: "Rapports de nettoiement" },
  { table: "collection_reports", label: "Rapports de collecte" },
  { table: "truck_daily_reports", label: "Lignes du rapport camions" },
  { table: "fuel_entries", label: "Pleins de carburant" },
  { table: "truck_repairs", label: "Pannes et réparations" },
  { table: "material_purchases", label: "Achats de matériel" },
  { table: "leave_requests", label: "Demandes de congé" },
  { table: "warnings", label: "Avertissements" },
  { table: "work_tasks", label: "Tâches du programme" },
  { table: "green_waste_entries", label: "Déchet vert" },
  { table: "photos", label: "Photos" },
  { table: "work_days", label: "Journées ouvertes / clôturées" },
];

export type SetupStatus = {
  company: { name: string; hasLogo: boolean; hasDetails: boolean };
  periodStartDay: number;
  projectStart: string;
  employees: { active: number; total: number; byPosition: Record<string, number> };
  trucks: { active: number; total: number };
  accounts: number;
  teamLeads: number;
  holidaysThisYear: number;
  demo: { employees: string[]; trucks: string[] };
  data: { label: string; count: number }[];
};

export async function getSetupStatus(): Promise<SetupStatus> {
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const count = async (table: string) => {
    const { count: n } = await supabase.from(table).select("*", { count: "exact", head: true });
    return n ?? 0;
  };
  const [settings, { data: employees }, { data: trucks }, accounts, teamLeads, { count: holidays }, data] = await Promise.all([
    getSettings(),
    supabase.from("employees").select("matricule, position, is_active"),
    supabase.from("trucks").select("matricule, is_active"),
    count("profiles"),
    count("team_leads"),
    supabase.from("holidays").select("*", { count: "exact", head: true }).gte("date", `${year}-01-01`).lte("date", `${year}-12-31`),
    Promise.all(DATA_TABLES.map(async (d) => ({ label: d.label, count: await count(d.table) }))),
  ]);
  const byPosition: Record<string, number> = {};
  for (const e of employees ?? []) if (e.is_active) byPosition[e.position] = (byPosition[e.position] ?? 0) + 1;
  return {
    company: {
      name: settings.company_name.trim(),
      hasLogo: !!settings.company_logo_path,
      hasDetails: !!(settings.company_address || settings.company_phone || settings.company_email),
    },
    periodStartDay: Number(settings.pointage_period_start_day) || 8,
    projectStart: settings.project_start_date,
    employees: { active: (employees ?? []).filter((e) => e.is_active).length, total: (employees ?? []).length, byPosition },
    trucks: { active: (trucks ?? []).filter((t) => t.is_active).length, total: (trucks ?? []).length },
    accounts,
    teamLeads,
    holidaysThisYear: holidays ?? 0,
    demo: {
      employees: (employees ?? []).map((e) => e.matricule as string).filter((m) => DEMO_EMPLOYEE_MATRICULES.includes(m)),
      trucks: (trucks ?? []).map((t) => t.matricule as string).filter((m) => DEMO_TRUCK_MATRICULES.includes(m)),
    },
    data,
  };
}

/** Indication légère pour le tableau de bord : configuration minimale incomplète ? */
export async function getSetupHint(): Promise<{ incomplete: boolean; demo: boolean }> {
  const supabase = await createClient();
  const [{ data: name }, { count: employees }, { count: trucks }, { count: demo }] = await Promise.all([
    supabase.from("settings").select("value").eq("key", "company_name").maybeSingle(),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("trucks").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("employees").select("id", { count: "exact", head: true }).in("matricule", DEMO_EMPLOYEE_MATRICULES),
  ]);
  const companyName = typeof name?.value === "string" ? name.value.trim() : "";
  return { incomplete: !companyName || !employees || !trucks, demo: (demo ?? 0) > 0 };
}
