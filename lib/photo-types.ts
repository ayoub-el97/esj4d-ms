export type PhotoPhase = "avant" | "apres" | "justificatif" | "vehicule";
export const PHOTO_PHASE_LABELS: Record<PhotoPhase, string> = {
  avant: "AVANT",
  apres: "APRÈS",
  justificatif: "Justificatif",
  vehicule: "Camion",
};

export type PhotoEntityType = "cleaning_report_agent" | "collection_report" | "warning" | "green_waste" | "work_task" | "fuel_entry" | "truck_repair" | "truck_report";

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
/** Durée de validité des liens signés : une journée de travail (la page peut rester ouverte de 6 h à 10 h). */
export const PHOTO_URL_TTL = 6 * 3600;
