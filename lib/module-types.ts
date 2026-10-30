// Types et libellés partagés client/serveur pour les modules Congés, Avertissements et Programme.

export type LeaveStatus = "en_attente" | "acceptee" | "refusee" | "annulee";
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = { en_attente: "En attente", acceptee: "Acceptée", refusee: "Refusée", annulee: "Annulée" };

/** Libellé affiché d'une demande : « Approuvée automatiquement – depuis Pointage » si créée par le pointage. */
export function leaveStatusLabel(status: LeaveStatus, source?: string | null): string {
  return status === "acceptee" && source === "pointage" ? "Approuvée automatiquement – depuis Pointage" : LEAVE_STATUS_LABELS[status];
}

export type WarningStatus = "ouvert" | "en_cours" | "clos";
export const WARNING_STATUS_LABELS: Record<WarningStatus, string> = { ouvert: "Ouvert", en_cours: "En cours", clos: "Clos" };

export type TaskStatus = "planifiee" | "realisee";
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { planifiee: "Planifiée", realisee: "Réalisée" };
