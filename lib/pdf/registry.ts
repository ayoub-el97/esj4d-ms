import "server-only";
import { createElement, type ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getOptionalUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { buildSheet, getMonthlyAttendance } from "@/lib/data/attendance";
import { getCleaningReport, getCleaningSummary, getCollectionReports, getTruckMonthly, getTruckReports } from "@/lib/data/reports";
import { getLeaveBalances, getLeaveRequests } from "@/lib/data/leaves";
import { getWarnings } from "@/lib/data/warnings";
import { getGreenWasteEntries } from "@/lib/data/green-waste";
import { getTasks } from "@/lib/data/tasks";
import { getMonthlyReport } from "@/lib/data/monthly";
import { getWorkerReport } from "@/lib/data/worker";
import { formatDateFr, isISODate, isMonth } from "@/lib/dates";
import { TEAM_SLUGS, type AppModule } from "@/lib/types";
import { AttendanceSheetPdf, MonthlyAttendancePdf } from "./attendance-sheet";
import { CleaningReportPdf, CollectionReportPdf, GlobalDailyPdf, TruckMonthlyPdf, TruckReportsPdf } from "./reports";
import { GreenWastePdf, LeaveBalancesPdf, LeaveHistoryPdf, TasksPdf, WarningsPdf } from "./modules";
import { MonthlyReportPdf, WorkerReportPdf } from "./monthly";

export type BuiltPdf = {
  element: ReactElement;
  filename: string;
  title: string;
  module: AppModule;
};

const dateOrUndef = (v: string | undefined) => (isISODate(v) ? v : undefined);

function periodLabel(f: { date?: string; from?: string; to?: string }): string {
  if (f.date) return formatDateFr(f.date);
  if (f.from || f.to) return `du ${f.from ? formatDateFr(f.from) : "…"} au ${f.to ? formatDateFr(f.to) : "…"}`;
  return "toutes dates";
}

/**
 * Registre des documents PDF : chaque "kind" construit son document à partir des paramètres d'URL.
 * Les données sont lues avec la session de l'utilisateur (RLS appliquée).
 */
export async function buildPdf(kind: string, params: Record<string, string>): Promise<BuiltPdf | null> {
  const [user, settings] = await Promise.all([getOptionalUser(), getSettings()]);
  if (!user) return null;
  const common = { company: settings.company_name, generatedBy: user.fullName };
  const date = params.date;
  const range = { date: dateOrUndef(params.date), from: dateOrUndef(params.from), to: dateOrUndef(params.to) };
  const subtitle = periodLabel(range);
  const slug = range.date ?? range.from ?? "tout";

  switch (kind) {
    case "pointage": {
      const team = TEAM_SLUGS[params.equipe ?? ""];
      if (!isISODate(date) || !team) return null;
      const sheet = await buildSheet(date, team);
      return {
        module: "pointage",
        title: `Feuille de présence ${team} du ${formatDateFr(date)}`,
        filename: `pointage-${team}-${date}.pdf`,
        element: createElement(AttendanceSheetPdf, { ...common, agency: settings.agency_name, teamLead: sheet.teamLead, date, team, rows: sheet.rows }),
      };
    }
    case "pointage-mensuel": {
      const month = params.mois;
      if (!isMonth(month)) return null;
      const team = params.equipe ? TEAM_SLUGS[params.equipe] : undefined;
      const rows = await getMonthlyAttendance(month, team);
      return { module: "pointage", title: `Rapport mensuel de pointage ${month}`, filename: `pointage-mensuel-${month}${team ? `-${team}` : ""}.pdf`, element: createElement(MonthlyAttendancePdf, { ...common, month, team, rows }) };
    }
    case "rapport-nettoiement": {
      if (!isISODate(date)) return null;
      const { report, agents } = await getCleaningReport(date);
      if (!report) return null;
      return { module: "rapport_journalier", title: `Rapport journalier nettoiement du ${formatDateFr(date)}`, filename: `rapport-nettoiement-${date}.pdf`, element: createElement(CleaningReportPdf, { ...common, date, agents, observations: report.observations }) };
    }
    case "rapport-collecte": {
      if (!isISODate(date)) return null;
      let reports = await getCollectionReports({ date });
      if (params.id) reports = reports.filter((r) => r.id === params.id);
      if (!reports.length) return null;
      return { module: "rapport_journalier", title: `Rapport journalier collecte du ${formatDateFr(date)}`, filename: `rapport-collecte-${date}.pdf`, element: createElement(CollectionReportPdf, { ...common, date, reports }) };
    }
    case "rapport-global": {
      if (!isISODate(date)) return null;
      const [trucks, summary] = await Promise.all([getTruckReports({ date }), getCleaningSummary(date)]);
      return { module: "rapport_journalier", title: `Rapport journalier global du ${formatDateFr(date)}`, filename: `rapport-global-${date}.pdf`, element: createElement(GlobalDailyPdf, { ...common, date, trucks, summary }) };
    }
    case "camions": {
      const rows = await getTruckReports({ ...range, truck: params.truck || undefined });
      return { module: "rapport_camions", title: `Rapport camions ${subtitle}`, filename: `rapport-camions-${slug}.pdf`, element: createElement(TruckReportsPdf, { ...common, subtitle, rows }) };
    }
    case "camions-mensuel": {
      const month = params.mois;
      if (!isMonth(month)) return null;
      const rows = await getTruckMonthly(month);
      return { module: "rapport_camions", title: `Rapport mensuel camions ${month}`, filename: `rapport-camions-${month}.pdf`, element: createElement(TruckMonthlyPdf, { ...common, month, rows }) };
    }
    case "conges-soldes": {
      const asOf = range.date ?? new Date().toISOString().slice(0, 10);
      const rows = (await getLeaveBalances(asOf)).filter((r) => r.is_active);
      return { module: "conges", title: `Soldes de congés au ${formatDateFr(asOf)}`, filename: `conges-soldes-${asOf}.pdf`, element: createElement(LeaveBalancesPdf, { ...common, asOf, rows }) };
    }
    case "conges-historique": {
      const rows = await getLeaveRequests({ employee: params.employee || undefined, status: params.status || undefined, from: range.from, to: range.to });
      const sub = params.employee && rows[0] ? `${rows[0].name} — ${subtitle}` : subtitle;
      return { module: "conges", title: `Historique des congés ${sub}`, filename: `conges-historique-${slug}.pdf`, element: createElement(LeaveHistoryPdf, { ...common, subtitle: sub, rows }) };
    }
    case "avertissements": {
      let rows = await getWarnings({ employee: params.employee || undefined, status: params.status || undefined, from: range.from, to: range.to });
      if (params.id) rows = rows.filter((w) => w.id === params.id);
      const detailed = Boolean(params.id);
      return { module: "avertissements", title: `Avertissements ${subtitle}`, filename: `avertissements-${params.id ? params.id.slice(0, 8) : slug}.pdf`, element: createElement(WarningsPdf, { ...common, subtitle, rows, detailed }) };
    }
    case "dechet-vert": {
      let rows = await getGreenWasteEntries(range);
      if (params.id) rows = rows.filter((e) => e.id === params.id);
      if (!rows.length) return null;
      return { module: "dechet_vert", title: `Déchet vert ${subtitle}`, filename: `dechet-vert-${slug}.pdf`, element: createElement(GreenWastePdf, { ...common, subtitle, rows }) };
    }
    case "programme": {
      let rows = await getTasks({ ...range, status: params.status || undefined });
      if (params.id) rows = rows.filter((t) => t.id === params.id);
      if (!rows.length) return null;
      const detailed = Boolean(params.id) || Boolean(range.date);
      return { module: "programme", title: `Programme de travail ${subtitle}`, filename: `programme-${slug}.pdf`, element: createElement(TasksPdf, { ...common, subtitle, rows, detailed }) };
    }
    case "rapport-mensuel": {
      const month = params.mois;
      if (!isMonth(month)) return null;
      const team = params.equipe ? TEAM_SLUGS[params.equipe] : undefined;
      const report = await getMonthlyReport(month, { team, employee: params.employe || undefined, truck: params.camion || undefined });
      const category = params.categorie || "toutes";
      return { module: "rapport_mensuel", title: `Rapport mensuel ${month}`, filename: `rapport-mensuel-${month}.pdf`, element: createElement(MonthlyReportPdf, { ...common, report, category }) };
    }
    case "travailleur": {
      if (!params.employe || !isISODate(params.from) || !isISODate(params.to)) return null;
      const report = await getWorkerReport(params.employe, params.from, params.to, user.permissions.avertissements.can_view);
      if (!report) return null;
      return { module: "rapports_travailleurs", title: `Rapport travailleur ${report.employee.last_name} ${report.employee.first_name}`, filename: `travailleur-${report.employee.matricule}-${params.from}.pdf`, element: createElement(WorkerReportPdf, { ...common, report }) };
    }
    default:
      return null;
  }
}

export async function renderPdf(element: ReactElement): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(element as any);
}
