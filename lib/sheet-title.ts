import { formatDateFr } from "@/lib/dates";
import type { TFunction } from "@/lib/i18n/config";
import type { TeamType } from "@/lib/types";

/** Titre exact d'une feuille de présence : « Feuille de présence des équipes de collecte – 28/10/2026 ». */
export function sheetTitle(t: TFunction, team: TeamType, date: string) {
  return team === "collecte" ? t("Feuille de présence des équipes de collecte – {date}", { date: formatDateFr(date) }) : t("Feuille de présence des équipes de nettoiement – {date}", { date: formatDateFr(date) });
}
