import "server-only";
import { createElement, type ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getOptionalUser } from "@/lib/auth";
import { getSettings, logoUrl } from "@/lib/data/settings";
import { buildSheet, getMonthlyAttendance } from "@/lib/data/attendance";
import { getCleaningReport, getCleaningSummary, getCollectionReports, getTruckMonthly, getTruckReports } from "@/lib/data/reports";
import { getLeaveBalances, getLeaveDetail, getLeaveRequests, getRecoveryBalances, getRecoveryDetail, getRecoveryRequests } from "@/lib/data/leaves";
import { getEmployee } from "@/lib/data/employees";
import { getWarnings } from "@/lib/data/warnings";
import { getGreenWasteEntries } from "@/lib/data/green-waste";
import { getTasks } from "@/lib/data/tasks";
import { costPivot, entriesTotals, getFuelEntries, getFuelEntry, getFuelSummary, type FuelPeriod } from "@/lib/data/fuel";
import { getMonthlyReport } from "@/lib/data/monthly";
import { getWorkerReport, getWorkersPeriodReport } from "@/lib/data/worker";
import { formatDateFr, isISODate, isMonth } from "@/lib/dates";
import { makeT, type TFunction } from "@/lib/i18n/config";
import { getLocale, getMessages, pdfLocale } from "@/lib/i18n/server";
import { TEAM_LABELS, TEAM_SLUGS, type AppModule } from "@/lib/types";
import { runWithPdfContext, type PdfContextValue } from "./context";
import { AttendanceSheetPdf, MonthlyAttendancePdf } from "./attendance-sheet";
import { CleaningReportPdf, CollectionReportPdf, GlobalDailyPdf, TruckMonthlyPdf, TruckReportsPdf } from "./reports";
import { GreenWastePdf, TasksPdf, WarningsPdf } from "./modules";
import { EmployeeLeavePdf, LeaveBalancesPdf, LeaveHistoryPdf, RecoveryBalancesPdf, RecoveryHistoryPdf, WorkersPeriodPdf } from "./leaves";
import { MonthlyReportPdf, WorkerReportPdf } from "./monthly";
import { FuelCostsPdf, FuelEntryPdf, FuelReportPdf } from "./fuel";

export type BuiltPdf = {
  element: ReactElement;
  filename: string;
  title: string;
  module: AppModule;
  context: PdfContextValue;
};

const dateOrUndef = (v: string | undefined) => (isISODate(v) ? v : undefined);

function periodLabel(t: TFunction, f: { date?: string; from?: string; to?: string }): string {
  if (f.date) return formatDateFr(f.date);
  if (f.from || f.to) return t("du {from} au {to}", { from: f.from ? formatDateFr(f.from) : "…", to: f.to ? formatDateFr(f.to) : "…" });
  return t("toutes dates");
}

/**
 * Registre des documents PDF : chaque "kind" construit son document à partir des paramètres d'URL.
 * Les données sont lues avec la session de l'utilisateur (RLS appliquée).
 * Langue : celle de l'utilisateur (l'arabe est rendu en français, voir pdfLocale).
 */
export async function buildPdf(kind: string, params: Record<string, string>): Promise<BuiltPdf | null> {
  const [user, settings, userLocale] = await Promise.all([getOptionalUser(), getSettings(), getLocale()]);
  if (!user) return null;
  const locale = pdfLocale(userLocale);
  const t = makeT(getMessages(locale));
  const projectStart = /^\d{4}-\d{2}-\d{2}$/.test(settings.project_start_date) ? settings.project_start_date : null;
  const context: PdfContextValue = { t, locale, logoUrl: logoUrl(settings.company_logo_path), projectStart };
  const common = { company: settings.company_name, generatedBy: user.fullName };
  const date = params.date;
  const range = { date: dateOrUndef(params.date), from: dateOrUndef(params.from), to: dateOrUndef(params.to) };
  const subtitle = periodLabel(t, range);
  const slug = range.date ?? range.from ?? "tout";
  const done = (module: AppModule, title: string, filename: string, element: ReactElement): BuiltPdf => ({ module, title, filename, element, context });

  switch (kind) {
    case "pointage": {
      const team = TEAM_SLUGS[params.equipe ?? ""];
      if (!isISODate(date) || !team) return null;
      const sheet = await buildSheet(date, team);
      return done(
        "pointage",
        t("Feuille de présence {team} du {date}", { team: t(TEAM_LABELS[team]), date: formatDateFr(date) }),
        `pointage-${team}-${date}.pdf`,
        createElement(AttendanceSheetPdf, { ...common, agency: settings.agency_name, teamLead: sheet.teamLead, date, team, rows: sheet.rows, trucks: sheet.trucks }),
      );
    }
    case "pointage-mensuel": {
      const month = params.mois;
      if (!isMonth(month)) return null;
      const team = params.equipe ? TEAM_SLUGS[params.equipe] : undefined;
      const rows = await getMonthlyAttendance(month, team);
      return done("pointage", `${t("Rapport mensuel de pointage")} ${month}`, `pointage-mensuel-${month}${team ? `-${team}` : ""}.pdf`, createElement(MonthlyAttendancePdf, { ...common, month, team, rows }));
    }
    case "rapport-nettoiement": {
      if (!isISODate(date)) return null;
      const { report, agents } = await getCleaningReport(date);
      if (!report) return null;
      return done("rapport_journalier", `${t("Rapport journalier — Nettoiement")} ${formatDateFr(date)}`, `rapport-nettoiement-${date}.pdf`, createElement(CleaningReportPdf, { ...common, date, agents, observations: report.observations }));
    }
    case "rapport-collecte": {
      if (!isISODate(date)) return null;
      let reports = await getCollectionReports({ date });
      if (params.id) reports = reports.filter((r) => r.id === params.id);
      if (!reports.length) return null;
      return done("rapport_journalier", `${t("Rapport journalier — Collecte")} ${formatDateFr(date)}`, `rapport-collecte-${date}.pdf`, createElement(CollectionReportPdf, { ...common, date, reports }));
    }
    case "rapport-global": {
      if (!isISODate(date)) return null;
      const [trucks, summary] = await Promise.all([getTruckReports({ date }), getCleaningSummary(date)]);
      return done("rapport_journalier", `${t("Rapport journalier global")} ${formatDateFr(date)}`, `rapport-global-${date}.pdf`, createElement(GlobalDailyPdf, { ...common, date, trucks, summary }));
    }
    case "camions": {
      const rows = await getTruckReports({ ...range, truck: params.truck || undefined });
      return done("rapport_camions", `${t("Rapport camions")} ${subtitle}`, `rapport-camions-${slug}.pdf`, createElement(TruckReportsPdf, { ...common, subtitle, rows }));
    }
    case "carburant": {
      if (params.id) {
        const entry = await getFuelEntry(params.id);
        if (!entry) return null;
        return done("rapport_camions", `${t("Plein de carburant")} ${entry.truck?.matricule ?? ""} ${formatDateFr(entry.activity_date)}`, `carburant-${entry.truck?.matricule ?? ""}-${entry.activity_date}.pdf`, createElement(FuelEntryPdf, { ...common, entry }));
      }
      const f = { from: range.from, to: range.to, truck: params.truck || undefined, driver: params.driver || undefined };
      const [entries, weekly, monthly] = await Promise.all([getFuelEntries(f), getFuelSummary("week", f), getFuelSummary("month", f)]);
      const parts = [subtitle, entries.find((e) => e.truck_id === f.truck)?.truck?.matricule, f.driver ? entries.find((e) => e.driver_id === f.driver)?.driver_name : undefined].filter(Boolean);
      const sub = parts.join(" · ");
      return done("rapport_camions", `${t("Rapport camions — Carburant")} ${sub}`, `carburant-${slug}.pdf`, createElement(FuelReportPdf, { ...common, subtitle: sub, entries, totals: entriesTotals(entries), weekly, monthly }));
    }
    case "carburant-couts": {
      const period = ({ jour: "day", semaine: "week", mois: "month" } as Record<string, FuelPeriod>)[params.vue ?? ""] ?? "month";
      const f = { from: range.from, to: range.to, truck: params.truck || undefined, driver: params.driver || undefined };
      const rows = await getFuelSummary(period, f);
      const viewLabel = { day: t("Par jour"), week: t("Par semaine"), month: t("Par mois") }[period];
      const sub = [viewLabel, subtitle, f.truck ? rows.find((r) => r.truck_id === f.truck)?.truck?.matricule : undefined].filter(Boolean).join(" · ");
      return done("rapport_camions", `${t("Statistiques des coûts carburant")} ${sub}`, `carburant-couts-${params.vue ?? "mois"}-${slug}.pdf`, createElement(FuelCostsPdf, { ...common, subtitle: sub, period, pivot: costPivot(rows) }));
    }
    case "camions-mensuel": {
      const month = params.mois;
      if (!isMonth(month)) return null;
      const rows = await getTruckMonthly(month);
      return done("rapport_camions", `${t("Rapport mensuel camions")} ${month}`, `rapport-camions-${month}.pdf`, createElement(TruckMonthlyPdf, { ...common, month, rows }));
    }
    case "conges-soldes": {
      const asOf = range.date ?? new Date().toISOString().slice(0, 10);
      const rows = await getLeaveBalances(asOf, { team: params.equipe || undefined, q: params.q || undefined });
      const filterLabel = [params.equipe ? t(TEAM_LABELS[params.equipe as keyof typeof TEAM_LABELS] ?? params.equipe) : "", params.q ? `« ${params.q} »` : ""].filter(Boolean).join(" · ");
      return done("conges", `${t("Solde de congés")} ${formatDateFr(asOf)}`, `conges-soldes-${asOf}.pdf`, createElement(LeaveBalancesPdf, { ...common, asOf, filterLabel, rows }));
    }
    case "recuperation-soldes": {
      const to = dateOrUndef(params.to) ?? new Date().toISOString().slice(0, 10);
      const from = dateOrUndef(params.from) ?? null;
      const rows = await getRecoveryBalances(from, to, { team: params.equipe || undefined, q: params.q || undefined });
      const sub = from ? periodLabel(t, { from, to }) : t("au {date}", { date: formatDateFr(to) });
      return done("conges", `${t("Solde de récupération")} ${sub}`, `recuperation-soldes-${to}.pdf`, createElement(RecoveryBalancesPdf, { ...common, subtitle: sub, rows }));
    }
    case "conges-historique": {
      const rows = await getLeaveRequests({ employee: params.employee || undefined, status: params.status || undefined, from: range.from, to: range.to, q: params.q || undefined });
      const sub = params.employee && rows[0] ? `${rows[0].name} — ${subtitle}` : subtitle;
      return done("conges", `${t("Historique des congés")} ${sub}`, `conges-historique-${slug}.pdf`, createElement(LeaveHistoryPdf, { ...common, subtitle: sub, rows }));
    }
    case "recuperation-historique": {
      const rows = await getRecoveryRequests({ employee: params.employee || undefined, status: params.status || undefined, from: range.from, to: range.to, q: params.q || undefined });
      const sub = params.employee && rows[0] ? `${rows[0].name} — ${subtitle}` : subtitle;
      return done("conges", `${t("Historique des récupérations")} ${sub}`, `recuperation-historique-${slug}.pdf`, createElement(RecoveryHistoryPdf, { ...common, subtitle: sub, rows }));
    }
    case "conges-employe": {
      if (!params.employee) return null;
      const asOf = range.date ?? new Date().toISOString().slice(0, 10);
      const employee = await getEmployee(params.employee);
      if (!employee) return null;
      const [lb, rb, ld, rd] = await Promise.all([
        getLeaveBalances(asOf, { includeInactive: true }),
        getRecoveryBalances(null, asOf, { includeInactive: true }),
        getLeaveDetail(employee.id, asOf),
        getRecoveryDetail(employee.id, asOf),
      ]);
      return done(
        "conges",
        `${t("Congé / Récupération")} ${employee.last_name} ${employee.first_name}`,
        `conge-recuperation-${employee.matricule}-${asOf}.pdf`,
        createElement(EmployeeLeavePdf, {
          ...common,
          employee,
          asOf,
          leave: lb.find((b) => b.employee_id === employee.id),
          recovery: rb.find((b) => b.employee_id === employee.id),
          schedule: ld.schedule,
          leaveTaken: ld.taken,
          recoveryTaken: rd.taken,
          credits: rd.credits,
          adjustments: [...ld.adjustments, ...rd.adjustments],
        }),
      );
    }
    case "travailleurs-periode": {
      if (!isISODate(params.from) || !isISODate(params.to)) return null;
      const rows = await getWorkersPeriodReport(params.from, params.to, { categorie: params.categorie, employe: params.employe, poste: params.poste, equipe: params.equipe, q: params.q });
      const sub = periodLabel(t, { from: params.from, to: params.to });
      return done("rapports_travailleurs", `${t("Rapports travailleurs")} ${sub}`, `rapport-travailleurs-${params.from}-${params.to}.pdf`, createElement(WorkersPeriodPdf, { ...common, subtitle: sub, rows }));
    }
    case "avertissements": {
      let rows = await getWarnings({ employee: params.employee || undefined, status: params.status || undefined, from: range.from, to: range.to });
      if (params.id) rows = rows.filter((w) => w.id === params.id);
      return done("avertissements", `${t("Avertissements")} ${subtitle}`, `avertissements-${params.id ? params.id.slice(0, 8) : slug}.pdf`, createElement(WarningsPdf, { ...common, subtitle, rows, detailed: Boolean(params.id) }));
    }
    case "dechet-vert": {
      let rows = await getGreenWasteEntries(range);
      if (params.id) rows = rows.filter((e) => e.id === params.id);
      if (!rows.length) return null;
      return done("dechet_vert", `${t("Déchet vert")} ${subtitle}`, `dechet-vert-${slug}.pdf`, createElement(GreenWastePdf, { ...common, subtitle, rows }));
    }
    case "programme": {
      let rows = await getTasks({ ...range, status: params.status || undefined });
      if (params.id) rows = rows.filter((task) => task.id === params.id);
      if (!rows.length) return null;
      const detailed = Boolean(params.id) || Boolean(range.date);
      return done("programme", `${t("Programme de travail")} ${subtitle}`, `programme-${slug}.pdf`, createElement(TasksPdf, { ...common, subtitle, rows, detailed }));
    }
    case "rapport-mensuel": {
      const month = params.mois;
      if (!isMonth(month)) return null;
      const team = params.equipe ? TEAM_SLUGS[params.equipe] : undefined;
      const report = await getMonthlyReport(month, { team, employee: params.employe || undefined, truck: params.camion || undefined });
      return done("rapport_mensuel", `${t("Rapport mensuel")} ${month}`, `rapport-mensuel-${month}.pdf`, createElement(MonthlyReportPdf, { ...common, report, category: params.categorie || "toutes" }));
    }
    case "travailleur": {
      if (!params.employe || !isISODate(params.from) || !isISODate(params.to)) return null;
      const report = await getWorkerReport(params.employe, params.from, params.to, user.permissions.avertissements.can_view);
      if (!report) return null;
      return done(
        "rapports_travailleurs",
        `${t("Rapport travailleur")} ${report.employee.last_name} ${report.employee.first_name}`,
        `travailleur-${report.employee.matricule}-${params.from}.pdf`,
        createElement(WorkerReportPdf, { ...common, report }),
      );
    }
    default:
      return null;
  }
}

/** Rend le document avec le contexte PDF (traduction + logo). */
export async function renderPdf(built: BuiltPdf): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return runWithPdfContext(built.context, () => renderToBuffer(built.element as any));
}
