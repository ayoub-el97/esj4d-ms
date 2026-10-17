export type PhotoPhase = "avant" | "apres" | "justificatif";
export const PHOTO_PHASE_LABELS: Record<PhotoPhase, string> = {
  avant: "AVANT",
  apres: "APRÈS",
  justificatif: "Justificatif",
};

export type PhotoEntityType = "cleaning_report_agent" | "collection_report" | "warning" | "green_waste" | "work_task" | "fuel_entry";

export type PhotoItem = {
  id: string;
  storage_path: string;
  phase: PhotoPhase;
  caption: string;
  created_at: string;
  /** URL signée (valide ~1 h) */
  url: string;
};

export const PHOTO_BUCKET = "photos";
