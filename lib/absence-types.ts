// Rapport des absents — libellés et regroupement en épisodes (module pur, navigateur et serveur).

export type AbsenceClass = "non_justifiee" | "maladie" | "justifiee";
export const ABSENCE_CLASSES: AbsenceClass[] = ["non_justifiee", "maladie", "justifiee"];
export const ABSENCE_CLASS_LABELS: Record<AbsenceClass, string> = {
  non_justifiee: "Absence non justifiée",
  maladie: "Absence maladie",
  justifiee: "Absence justifiée (autre motif)",
};
export const ABSENCE_CLASS_STYLES: Record<AbsenceClass, string> = {
  non_justifiee: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  maladie: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  justifiee: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
};

export type CertificateStatus = "en_attente" | "recu" | "a_verifier";
export const CERTIFICATE_STATUSES: CertificateStatus[] = ["en_attente", "recu", "a_verifier"];
export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatus, string> = { en_attente: "En attente", recu: "Reçu", a_verifier: "À vérifier" };

export type CertificateVerification = "non_verifiee" | "acceptee" | "refusee";
export const CERTIFICATE_VERIFICATIONS: CertificateVerification[] = ["non_verifiee", "acceptee", "refusee"];
export const CERTIFICATE_VERIFICATION_LABELS: Record<CertificateVerification, string> = {
  non_verifiee: "Non vérifié",
  acceptee: "Accepté (absence maladie justifiée)",
  refusee: "Refusé (jours comptés non justifiés)",
};

/**
 * Statut affiché d'un certificat médical (un seul choix pour l'utilisateur), enregistré dans les
 * deux colonnes existantes : status (remise) et verification (contrôle par un utilisateur autorisé).
 */
export type CertificateState = "en_attente" | "recu" | "a_verifier" | "valide" | "refuse";
export const CERTIFICATE_STATES: CertificateState[] = ["en_attente", "recu", "a_verifier", "valide", "refuse"];
export const CERTIFICATE_STATE_LABELS: Record<CertificateState, string> = {
  en_attente: "En attente de certificat",
  recu: "Certificat reçu",
  a_verifier: "À vérifier",
  valide: "Certificat validé",
  refuse: "Certificat refusé",
};
export const CERTIFICATE_STATE_STYLES: Record<CertificateState, string> = {
  en_attente: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  recu: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  a_verifier: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  valide: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  refuse: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};
export function certificateState(status: CertificateStatus, verification: CertificateVerification): CertificateState {
  if (verification === "acceptee") return "valide";
  if (verification === "refusee") return "refuse";
  return status;
}
/** Colonnes enregistrées pour un statut choisi. Validé / refusé : le certificat est forcément remis. */
export function certificateColumns(state: CertificateState): { status: CertificateStatus; verification: CertificateVerification } {
  if (state === "valide") return { status: "recu", verification: "acceptee" };
  if (state === "refuse") return { status: "recu", verification: "refusee" };
  return { status: state, verification: "non_verifiee" };
}

export type EngagementStatus = "a_preparer" | "en_attente_signature" | "signe";
export const ENGAGEMENT_STATUSES: EngagementStatus[] = ["a_preparer", "en_attente_signature", "signe"];
export const ENGAGEMENT_STATUS_LABELS: Record<EngagementStatus, string> = { a_preparer: "À préparer", en_attente_signature: "En attente de signature", signe: "Signé" };

export type AbsenceAlert = "aucune" | "engagement_requis" | "engagement_signe" | "decision_requise" | "decision_enregistree";
export const ABSENCE_ALERT_LABELS: Record<AbsenceAlert, string> = {
  aucune: "Aucune alerte",
  engagement_requis: "Deuxième absence non justifiée : engagement écrit requis",
  engagement_signe: "Engagement écrit signé",
  decision_requise: "Plus de quatre absences non justifiées : décision du responsable requise",
  decision_enregistree: "Décision du responsable enregistrée",
};
export const ABSENCE_ALERT_SHORT: Record<AbsenceAlert, string> = {
  aucune: "—",
  engagement_requis: "Engagement écrit requis",
  engagement_signe: "Engagement signé",
  decision_requise: "Décision requise",
  decision_enregistree: "Décision enregistrée",
};
export const ABSENCE_ALERT_STYLES: Record<AbsenceAlert, string> = {
  aucune: "text-muted-foreground",
  engagement_requis: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  engagement_signe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  decision_requise: "bg-red-600 text-white",
  decision_enregistree: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

/** Seuils de la politique d'absences (absences non justifiées, cumul). */
export const ENGAGEMENT_THRESHOLD = 2;
export const DECISION_THRESHOLD = 5;

export type AbsenceDay = {
  employee_id: string;
  activity_date: string;
  attendance_status: "absent" | "absent_maladie";
  classification: AbsenceClass;
  observation: string;
  review_comment: string;
  reviewed: boolean;
  certificate_id: string | null;
};

export type AbsenceEpisode = { from: string; to: string; days: AbsenceDay[]; classification: AbsenceClass };

const nextDay = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

/** Épisodes : jours d'absence consécutifs de même classement (ordre chronologique décroissant). */
export function absenceEpisodes(days: AbsenceDay[]): AbsenceEpisode[] {
  const sorted = [...days].sort((a, b) => a.activity_date.localeCompare(b.activity_date));
  const out: AbsenceEpisode[] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && last.classification === d.classification && nextDay(last.to) === d.activity_date) {
      last.to = d.activity_date;
      last.days.push(d);
    } else out.push({ from: d.activity_date, to: d.activity_date, days: [d], classification: d.classification });
  }
  return out.reverse();
}
