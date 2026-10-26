import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { TeamType } from "@/lib/types";

export type AppSettings = {
  company_name: string;
  agency_name: string;
  director_email: string;
  timezone: string;
  leave_days_per_month: number;
  double_day_on_rest_day: boolean;
  double_day_two_shifts: boolean;
  company_logo_path: string;
  /** Coordonnées affichées dans les en-têtes des documents */
  company_address: string;
  company_phone: string;
  company_email: string;
  /** Identifiants légaux (ICE, RC, IF…), texte libre */
  company_legal: string;
  /** Date de début du projet (aaaa-mm-jj) : base du calcul des « mois » ; vide = mois calendaire */
  project_start_date: string;
  /** Jour de début de la période de pointage (1 à 28) : du 8 au 7 par défaut */
  pointage_period_start_day: number;
  /** Heure de fin normale de l'entreprise (« HH:MM ») pour les heures sup. automatiques ; vide = désactivé */
  normal_end_time: string;
  /** Alertes camions : seuils (jours d'immobilisation, nombre de pannes sur la fenêtre) */
  truck_alert_orange_days: number;
  truck_alert_red_days: number;
  truck_alert_orange_count: number;
  truck_alert_red_count: number;
  truck_alert_window_days: number;
};

const DEFAULTS: AppSettings = {
  company_name: "",
  agency_name: "",
  director_email: "",
  timezone: "Africa/Casablanca",
  leave_days_per_month: 1.5,
  double_day_on_rest_day: true,
  double_day_two_shifts: true,
  company_logo_path: "",
  company_address: "",
  company_phone: "",
  company_email: "",
  company_legal: "",
  project_start_date: "",
  pointage_period_start_day: 8,
  normal_end_time: "",
  truck_alert_orange_days: 3,
  truck_alert_red_days: 7,
  truck_alert_orange_count: 3,
  truck_alert_red_count: 5,
  truck_alert_window_days: 30,
};

/** Lit les réglages (table settings) en appliquant les valeurs par défaut. */
export async function getSettings(): Promise<AppSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key, value");
  const result: AppSettings = { ...DEFAULTS };
  for (const row of data ?? []) {
    if (row.key in result) {
      (result as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return result;
}

/** Date de début du projet (ou null) : les mois vont du jour de début au veille du même jour le mois suivant. */
export const getProjectStart = cache(async (): Promise<string | null> => {
  const s = await getSettings();
  return /^\d{4}-\d{2}-\d{2}$/.test(s.project_start_date) ? s.project_start_date : null;
});

export const BRANDING_BUCKET = "branding";

/** URL publique du logo (bucket "branding" public), ou null si aucun logo. */
export function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BRANDING_BUCKET}/${path}`;
}

/** Nom et logo de la société (lisibles aussi sans connexion, pour la page de connexion). */
export async function getBranding(): Promise<{ companyName: string; logoUrl: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key, value").in("key", ["company_name", "company_logo_path"]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value as string]));
  return { companyName: map.get("company_name") || "", logoUrl: logoUrl(map.get("company_logo_path")) };
}

/** Indique si l'envoi d'e-mail est configuré (clé Resend + e-mail du directeur). */
export function isEmailConfigured(settings: AppSettings): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && settings.director_email);
}

export type TeamLead = {
  id: string;
  full_name: string;
  team_type: TeamType | null;
  phone: string;
  employee_id: string | null;
  is_active: boolean;
};

export async function getTeamLeads(onlyActive = false): Promise<TeamLead[]> {
  const supabase = await createClient();
  let q = supabase.from("team_leads").select("id, full_name, team_type, phone, employee_id, is_active").order("full_name");
  if (onlyActive) q = q.eq("is_active", true);
  const { data } = await q.returns<TeamLead[]>();
  return data ?? [];
}

/** Lignes de coordonnées de l'entreprise (en-têtes des PDF) : agence, adresse, téléphone / e-mail, identifiants. */
export function companyDetailLines(s: Pick<AppSettings, "agency_name" | "company_address" | "company_phone" | "company_email" | "company_legal">): string[] {
  return [s.agency_name, s.company_address, [s.company_phone, s.company_email].filter(Boolean).join(" · "), s.company_legal].map((x) => (x ?? "").trim()).filter(Boolean);
}
