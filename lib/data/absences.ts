import "server-only";
import { createClient } from "@/lib/supabase/server";
import { employeeName, getEmployees, type Employee } from "@/lib/data/employees";
import { getPhotosFor } from "@/lib/data/photos";
import type { AbsenceAlert, AbsenceDay, CertificateStatus, CertificateVerification, EngagementStatus } from "@/lib/absence-types";
import type { PhotoItem } from "@/lib/photo-types";

export type AbsenceSummaryRow = {
  employee_id: string;
  employee: Employee;
  name: string;
  total: number;
  non_justifiee: number;
  maladie: number;
  justifiee: number;
  /** Absences non justifiées depuis le début (politique d'absences) */
  unjustified_all: number;
  certificates: number;
  certificates_pending: number;
  engagement_status: EngagementStatus | null;
  alert: AbsenceAlert;
};

/** Synthèse par employé sur une période (compteurs) et statut d'alerte (cumul). */
export async function getAbsenceSummary(from?: string, to?: string): Promise<AbsenceSummaryRow[]> {
  const supabase = await createClient();
  const [{ data, error }, employees] = await Promise.all([supabase.rpc("absence_summary", { p_from: from ?? null, p_to: to ?? null }), getEmployees()]);
  if (error) throw new Error(error.message);
  const byId = new Map(employees.map((e) => [e.id, e]));
  type Raw = Omit<AbsenceSummaryRow, "employee" | "name"> & { employee_id: string };
  return ((data ?? []) as Raw[])
    .map((r) => {
      const e = byId.get(r.employee_id);
      return e ? { ...r, employee: e, name: employeeName(e) } : null;
    })
    .filter((r): r is AbsenceSummaryRow => !!r)
    .sort((a, b) => a.employee.order_number - b.employee.order_number);
}

export type MedicalCertificate = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  submitted_on: string | null;
  status: CertificateStatus;
  verification: CertificateVerification;
  comment: string;
  created_at: string;
  photos: PhotoItem[];
};

export type AbsenceAction = {
  id: string;
  employee_id: string;
  kind: "engagement" | "decision";
  unjustified_count: number;
  status: EngagementStatus | null;
  signed_on: string | null;
  decision: string;
  decision_date: string | null;
  comment: string;
  created_at: string;
  photos: PhotoItem[];
};

export type AbsenceAuditEntry = { at: string; tbl: string; action: string; user_email: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null };

/** Historique complet d'un employé : jours d'absence, certificats, engagement, décisions, journal. */
export async function getEmployeeAbsences(employeeId: string, canSeeDocuments: boolean) {
  const supabase = await createClient();
  const [{ data: days, error }, { data: certs }, { data: actions }, { data: audit }] = await Promise.all([
    supabase.rpc("absence_days", { p_from: null, p_to: null, p_employee: employeeId }),
    supabase.from("medical_certificates").select("*").eq("employee_id", employeeId).order("start_date", { ascending: false }),
    supabase.from("absence_actions").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false }),
    supabase.rpc("absence_audit", { p_employee: employeeId }),
  ]);
  if (error) throw new Error(error.message);
  const certList = (certs ?? []) as Omit<MedicalCertificate, "photos">[];
  const actionList = (actions ?? []) as Omit<AbsenceAction, "photos">[];
  // Documents médicaux et engagements signés : utilisateurs autorisés uniquement (contrôle aussi en base)
  const [certPhotos, actionPhotos] = canSeeDocuments
    ? await Promise.all([getPhotosFor("medical_certificate", certList.map((c) => c.id)), getPhotosFor("absence_action", actionList.map((a) => a.id))])
    : [new Map<string, PhotoItem[]>(), new Map<string, PhotoItem[]>()];
  return {
    days: ((days ?? []) as AbsenceDay[]).sort((a, b) => b.activity_date.localeCompare(a.activity_date)),
    certificates: certList.map((c) => ({ ...c, photos: certPhotos.get(c.id) ?? [] })),
    actions: actionList.map((a) => ({ ...a, photos: actionPhotos.get(a.id) ?? [] })),
    audit: (audit ?? []) as AbsenceAuditEntry[],
  };
}

/** Rappels « Rappels et alertes » mis à jour d'après les absences (sans doublon). */
export async function syncAbsenceAlerts(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("sync_absence_alerts");
}
