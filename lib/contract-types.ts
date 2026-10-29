// Contrats de la société — libellés et calculs de période (module pur, navigateur et serveur).

export type ContractStatus = "brouillon" | "actif" | "termine" | "archive";
export const CONTRACT_STATUSES: ContractStatus[] = ["brouillon", "actif", "termine", "archive"];
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = { brouillon: "Brouillon", actif: "Actif", termine: "Terminé", archive: "Archivé" };
export const CONTRACT_STATUS_STYLES: Record<ContractStatus, string> = {
  brouillon: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  actif: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  termine: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  archive: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
};

export type Contract = {
  id: string;
  reference: string;
  description: string;
  start_date: string;
  end_date: string;
  status: ContractStatus;
  closed_on: string | null;
  closure_note: string;
  alert_days: string;
  created_at: string;
  updated_at: string;
};

/** Période couverte par le contrat : début → clôture effective (sinon fin prévue). */
export const contractPeriod = (c: Pick<Contract, "start_date" | "end_date" | "closed_on">) => ({ from: c.start_date, to: c.closed_on ?? c.end_date });

/** Contrats dont la période chevauche [from, to] (hors contrat exclu). */
export function overlapping<T extends Pick<Contract, "id" | "start_date" | "end_date" | "closed_on" | "status">>(list: T[], from: string, to: string, exceptId?: string): T[] {
  return list.filter((c) => c.id !== exceptId && c.start_date <= to && contractPeriod(c).to >= from);
}
