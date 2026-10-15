import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AppSettings = {
  company_name: string;
  agency_name: string;
  director_email: string;
  timezone: string;
  leave_days_per_month: number;
  double_day_on_rest_day: boolean;
  double_day_two_shifts: boolean;
};

const DEFAULTS: AppSettings = {
  company_name: "ESJ-4D",
  agency_name: "Agence principale",
  director_email: "",
  timezone: "Africa/Casablanca",
  leave_days_per_month: 1.5,
  double_day_on_rest_day: true,
  double_day_two_shifts: true,
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

/** Indique si l'envoi d'e-mail est configuré (clé Resend + e-mail du directeur). */
export function isEmailConfigured(settings: AppSettings): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && settings.director_email);
}
