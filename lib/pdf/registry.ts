import "server-only";
import { createElement, type ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getOptionalUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { buildSheet, getMonthlyAttendance } from "@/lib/data/attendance";
import { isISODate } from "@/lib/dates";
import { TEAM_SLUGS, type AppModule } from "@/lib/types";
import { AttendanceSheetPdf, MonthlyAttendancePdf } from "./attendance-sheet";

export type BuiltPdf = {
  element: ReactElement;
  filename: string;
  title: string;
  module: AppModule;
};

/**
 * Registre des documents PDF : chaque "kind" construit son document à partir des paramètres d'URL.
 * Les données sont lues avec la session de l'utilisateur (RLS appliquée).
 */
export async function buildPdf(kind: string, params: Record<string, string>): Promise<BuiltPdf | null> {
  const [user, settings] = await Promise.all([getOptionalUser(), getSettings()]);
  if (!user) return null;
  const common = { company: settings.company_name, generatedBy: user.fullName };

  switch (kind) {
    case "pointage": {
      const date = params.date;
      const team = TEAM_SLUGS[params.equipe ?? ""];
      if (!isISODate(date) || !team) return null;
      const sheet = await buildSheet(date, team);
      return {
        module: "pointage",
        title: `Feuille de présence ${team} du ${date}`,
        filename: `pointage-${team}-${date}.pdf`,
        element: createElement(AttendanceSheetPdf, { ...common, agency: settings.agency_name, teamLead: sheet.teamLead, date, team, rows: sheet.rows }),
      };
    }
    case "pointage-mensuel": {
      const month = params.mois;
      if (!/^\d{4}-\d{2}$/.test(month ?? "")) return null;
      const team = params.equipe ? TEAM_SLUGS[params.equipe] : undefined;
      const rows = await getMonthlyAttendance(month, team);
      return {
        module: "pointage",
        title: `Rapport mensuel de pointage ${month}`,
        filename: `pointage-mensuel-${month}${team ? `-${team}` : ""}.pdf`,
        element: createElement(MonthlyAttendancePdf, { ...common, month, team, rows }),
      };
    }
    default:
      return null;
  }
}

export async function renderPdf(element: ReactElement): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(element as any);
}
