import "server-only";
import { EMPLOYEE_COLUMNS, type Employee } from "@/lib/data/employees";
import { createClient } from "@/lib/supabase/server";
import { createElement, type ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getOptionalUser } from "@/lib/auth";
import { companyDetailLines, getSettings, logoUrl } from "@/lib/data/settings";
import { buildSheet, getAttendanceHistory, getMonthlyAttendance } from "@/lib/data/attendance";
import { getCleaningReport, getCleaningSummary, getCollectionReports, getTruckMonthly, getTruckReports } from "@/lib/data/reports";
import { getLeaveBalances, getLeaveDetail, getLeaveRequests, getRecoveryBalances, getRecoveryDetail, getRecoveryRequests } from "@/lib/data/leaves";
import { getEmployee, getTrucks } from "@/lib/data/employees";
import { getWarnings } from "@/lib/data/warnings";
import { getGreenWasteEntries } from "@/lib/data/green-waste";
import { getTasks } from "@/lib/data/tasks";
import { costPivot, entriesTotals, getFuelEntries, getFuelEntry, getFuelSummary, type FuelPeriod } from "@/lib/data/fuel";
import { getMonthlyReport } from "@/lib/data/monthly";
import { getWorkerReport, getWorkersPeriodReport } from "@/lib/data/worker";
import { formatDateFr, isISODate, isMonth, formatWorkMonth } from "@/lib/dates";
import { makeT, type TFunction } from "@/lib/i18n/config";
import { getLocale, getMessages, pdfLocale } from "@/lib/i18n/server";
import { TEAM_LABELS, TEAM_SLUGS, type AppModule, ALL_POSITIONS } from "@/lib/types";
import { runWithPdfContext, type PdfContextValue } from "./context";
import { embedPhotos } from "./embed-photos";
import { AttendanceHistoryPdf, AttendanceSheetPdf, MonthlyAttendancePdf } from "./attendance-sheet";
import { CleaningReportPdf, CollectionReportPdf, GlobalDailyPdf, TruckMonthlyPdf, TruckReportsPdf } from "./reports";
import { GreenWastePdf, TasksPdf, WarningsPdf } from "./modules";
import { EmployeeLeavePdf, LeaveBalancesPdf, LeaveHistoryPdf, RecoveryBalancesPdf, RecoveryHistoryPdf, WorkersPeriodPdf } from "./leaves";
import { MonthlyReportPdf, WorkerReportPdf } from "./monthly";
import { FuelCostsPdf, FuelEntryPdf, FuelReportPdf } from "./fuel";
import { FleetPdf, RepairExpensesPdf, RepairPdf, TruckRepairHistoryPdf } from "./repairs";
import { PurchaseListPdf, PurchasePdf, PurchaseReportPdf } from "./purchases";
import { AbsencesPeriodPdf, EngagementAbsencesPdf } from "./absences";
import { ContractReportPdf } from "./contracts";
import { CombinedReportPdf } from "./combined";
import { WORK_LOCATIONS_TITLE } from "@/lib/modules";
import { getCombinedReport } from "@/lib/data/combined-report";
import { getContract, getContractSummary } from "@/lib/data/contracts";
import { getAbsenceSummary } from "@/lib/data/absences";
import { getPurchase, getPurchaseReport, getPurchases } from "@/lib/data/purchases";
import { categoryLabel } from "@/lib/purchase-types";
import { resolvePurchasePeriod } from "@/app/(app)/achats/period";
import { getDowntimeReport, getFleetOverview, getRepair, getRepairExpenseReport, getRepairs } from "@/lib/data/repairs";
import { applyFleetFilter, FLEET_FILTERS } from "@/lib/fleet-filters";
import { workMonthRange } from "@/lib/dates";
import { getLiveGrid, getOvertimeGrid, getPeriodSnapshots, getPeriodStartDay } from "@/lib/data/attendance-grid";
import { OvertimePdf } from "./overtime";
import { filterGrid } from "@/lib/attendance-grid";
import { AttendanceGridPdf } from "./attendance-grid";
import { POSITION_LABELS, type Position } from "@/lib/types";
import { formatDateTimeFr, formatMonthFr, todayISO } from "@/lib/dates";

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
  const context: PdfContextValue = { t, locale, logoUrl: logoUrl(settings.company_logo_path), projectStart, companyDetails: companyDetailLines(settings) };
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
    case "contrat": {
      if (!params.id) return null;
      const [contract, summary] = await Promise.all([getContract(params.id), getContractSummary(params.id)]);
      if (!contract) return null;
      return done("parametres", `${t("Rapport du contrat")} ${contract.reference}`, `rapport-contrat-${contract.reference.replace(/[^\w.-]+/g, "-")}.pdf`, createElement(ContractReportPdf, { ...common, contract, summary }));
    }
    case "absences": {
      const rows = (await getAbsenceSummary(range.from, range.to)).filter((r) => r.total > 0 || r.alert !== "aucune").map((r) => ({ ...r, position: r.employee.position }));
      return done("pointage", `${t("Rapport des absents")} ${subtitle}`, `absences-${slug}.pdf`, createElement(AbsencesPeriodPdf, { ...common, subtitle, rows }));
    }
    case "engagement-absences": {
      if (!params.employee) return null;
      const supabase = await createClient();
      const [{ data: emp }, { data: days }] = await Promise.all([
        supabase.from("employees").select(EMPLOYEE_COLUMNS).eq("id", params.employee).maybeSingle(),
        supabase.rpc("absence_days", { p_from: null, p_to: null, p_employee: params.employee }),
      ]);
      if (!emp) return null;
      const employee = { ...(emp as unknown as Employee), matricule: (emp as unknown as Employee).matricule ?? "" };
      const unjustifiedDates = ((days ?? []) as { activity_date: string; classification: string }[]).filter((d) => d.classification === "non_justifiee").map((d) => d.activity_date).sort();
      return done("pointage", `${t("Engagement écrit relatif aux absences")} — ${employee.last_name} ${employee.first_name}`, `engagement-absences-${employee.last_name}.pdf`, createElement(EngagementAbsencesPdf, { ...common, employee, unjustifiedDates }));
    }
    case "pointage-historique": {
      const rows = await getAttendanceHistory({ from: range.from, to: range.to, employee: params.employee || undefined, team: params.team || undefined, position: params.position || undefined, status: params.status || undefined }, 3000);
      return done("pointage", `${t("Historique du pointage")} ${subtitle}`, `historique-pointage-${slug}.pdf`, createElement(AttendanceHistoryPdf, { ...common, subtitle, rows }));
    }
    case "pointage-mensuel": {
      const month = params.mois;
      if (!isMonth(month)) return null;
      const team = params.equipe ? TEAM_SLUGS[params.equipe] : undefined;
      const rows = await getMonthlyAttendance(month, team);
      return done("pointage", `${t("Rapport mensuel de pointage")} ${month}`, `pointage-mensuel-${month}${team ? `-${team}` : ""}.pdf`, createElement(MonthlyAttendancePdf, { ...common, month, team, rows }));
    }
    case "pointage-grille": {
      const month = params.mois;
      if (!isMonth(month)) return null;
      const startDay = await getPeriodStartDay();
      const [live, snapshots] = await Promise.all([getLiveGrid(month, startDay), getPeriodSnapshots(month)]);
      const latest = snapshots[0] ?? null;
      const selected = params.version === "actuel" ? null : params.version ? (snapshots.find((s) => String(s.revision) === params.version) ?? latest) : latest;
      const team = params.equipe ? TEAM_SLUGS[params.equipe] : undefined;
      const position = ALL_POSITIONS.includes(params.poste as Position) ? (params.poste as Position) : undefined;
      const q = (params.q ?? "").slice(0, 60);
      const grid = filterGrid(selected ? selected.data : live, { team, position, q });
      const monthName = formatMonthFr(month, locale).replace(/^./, (c) => c.toUpperCase());
      const versionLabel = selected
        ? t("Version finalisée {n} du {date}", { n: selected.revision, date: formatDateTimeFr(selected.created_at) })
        : t("Données actuelles du Pointage (non finalisées)");
      const filtersLabel = [team ? t(TEAM_LABELS[team]) : "", position ? t(POSITION_LABELS[position]) : "", q ? `« ${q} »` : ""].filter(Boolean).join(" · ");
      return done(
        "pointage",
        `${t("Rapport mensuel de pointage")} — ${monthName}`,
        `rapport-mensuel-pointage-${month}${team ? `-${team}` : ""}.pdf`,
        createElement(AttendanceGridPdf, { grid, company: settings.company_name, agency: settings.agency_name, generatedBy: user.fullName, today: todayISO(), monthName, versionLabel, filtersLabel }),
      );
    }
    case "pointage-hs": {
      const month = params.mois;
      if (!isMonth(month)) return null;
      const team = params.equipe ? TEAM_SLUGS[params.equipe] : undefined;
      const position = ALL_POSITIONS.includes(params.poste as Position) ? (params.poste as Position) : undefined;
      const q = (params.q ?? "").slice(0, 60);
      const grid = await getOvertimeGrid(month, { team, position, q });
      const monthName = formatMonthFr(month, locale).replace(/^./, (c) => c.toUpperCase());
      const filtersLabel = [team ? t(TEAM_LABELS[team]) : "", position ? t(POSITION_LABELS[position]) : "", q ? `« ${q} »` : ""].filter(Boolean).join(" · ");
      return done("pointage", `${t("Heures supplémentaires")} — ${monthName}`, `heures-supplementaires-${month}.pdf`, createElement(OvertimePdf, { grid, company: settings.company_name, generatedBy: user.fullName, today: todayISO(), monthName, filtersLabel }));
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
    case "lieux-de-travail": {
      if (!isISODate(date)) return null;
      return done("rapport_journalier", `${WORK_LOCATIONS_TITLE} ${formatDateFr(date)}`, `lieux-de-travail-${date}.pdf`, createElement(CombinedReportPdf, { ...common, data: await getCombinedReport(date) }));
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
    case "reparations-depenses": {
      if (!isISODate(params.from) || !isISODate(params.to)) return null;
      const [report, downtime] = await Promise.all([getRepairExpenseReport(params.from, params.to, params.truck || undefined), getDowntimeReport(params.from, params.to, params.truck || undefined)]);
      const sub =
        params.vue === "mois" && isMonth(params.mois)
          ? formatWorkMonth(params.mois, projectStart, locale)
          : params.vue === "annee" && params.annee
            ? t("Année {year}", { year: params.annee })
            : periodLabel(t, { from: params.from, to: params.to });
      const truckLabel = params.truck ? report.rows[0]?.truck?.matricule : undefined;
      const subtitle2 = [sub, truckLabel].filter(Boolean).join(" · ");
      return done("rapport_camions", `${t("Dépenses de réparation des camions")} ${subtitle2}`, `depenses-reparations-${params.from}-${params.to}.pdf`, createElement(RepairExpensesPdf, { ...common, subtitle: subtitle2, report, downtime: downtime.rows }));
    }
    case "flotte": {
      const mois = isMonth(params.mois) ? params.mois : null;
      if (!mois) return null;
      const { from, to } = workMonthRange(mois, projectStart);
      const fleet = await getFleetOverview(from, to);
      const etat = FLEET_FILTERS.some((f) => f.key === params.etat) ? params.etat! : "tous";
      const order = ["rouge", "orange", "vert"];
      const trucks = applyFleetFilter(fleet.trucks, etat).sort((a, b) => order.indexOf(a.alert) - order.indexOf(b.alert) || b.currentDays - a.currentDays || a.truck.matricule.localeCompare(b.truck.matricule));
      const label = FLEET_FILTERS.find((f) => f.key === etat)!.label;
      const subtitle = `${t("au {date}", { date: formatDateFr(fleet.today) })} · ${t(label)} · ${t("statistiques : {period}", { period: formatWorkMonth(mois, projectStart, locale) })}`;
      return done("rapport_camions", `${t("État de la flotte")} ${fleet.today}`, `etat-flotte-${fleet.today}.pdf`, createElement(FleetPdf, { ...common, subtitle, trucks, rules: fleet.rules }));
    }
    case "reparation": {
      if (!params.id) return null;
      const repair = await getRepair(params.id);
      if (!repair) return null;
      return done("rapport_camions", `${t("Dossier de réparation")} ${repair.truck?.matricule ?? ""}`, `reparation-${repair.truck?.matricule ?? ""}-${repair.reported_date}.pdf`, createElement(RepairPdf, { ...common, repair }));
    }
    case "reparations-camion": {
      if (!params.truck) return null;
      const [repairs, trucks] = await Promise.all([getRepairs({ truck: params.truck }), getTrucks()]);
      const truck = trucks.find((tr) => tr.id === params.truck);
      if (!truck) return null;
      return done("rapport_camions", `${t("Historique des réparations du camion")} ${truck.matricule}`, `historique-reparations-${truck.matricule}.pdf`, createElement(TruckRepairHistoryPdf, { ...common, matricule: truck.matricule, repairs }));
    }
    case "achat": {
      if (!params.id) return null;
      const purchase = await getPurchase(params.id);
      if (!purchase) return null;
      return done("achats", `${t("Achat")} ${purchase.label}`, `achat-${purchase.purchase_date}-${purchase.id.slice(0, 8)}.pdf`, createElement(PurchasePdf, { ...common, purchase, payments: purchase.payments }));
    }
    case "achats-rapport": {
      if (!isISODate(params.from) || !isISODate(params.to)) return null;
      const report = await getPurchaseReport(params.from, params.to, params.category || undefined);
      const title = params.vue === "mois" ? t("Rapport mensuel des achats") : params.vue === "annee" ? t("Rapport annuel des achats") : t("Rapport des achats");
      const sub =
        (params.vue === "mois" && isMonth(params.mois)
          ? formatWorkMonth(params.mois, projectStart, locale)
          : params.vue === "annee" && params.annee
            ? t("Année {year}", { year: params.annee })
            : periodLabel(t, { from: params.from, to: params.to })) + (params.category ? ` — ${categoryLabel(t, params.category)}` : "");
      return done("achats", `${title} ${sub}`, `achats-${params.from}-${params.to}.pdf`, createElement(PurchaseReportPdf, { ...common, title, subtitle: sub, report, withPhotos: params.photos === "1" }));
    }
    case "achats-liste": {
      // Même période que la page (mois, année ou dates)
      const range2 = resolvePurchasePeriod({ mois: params.mois, annee: params.annee, from: dateOrUndef(params.from), to: dateOrUndef(params.to) }, projectStart);
      const purchases = await getPurchases({ q: params.q, category: params.category || undefined, from: range2.from, to: range2.to });
      const sub2 = [range2.from || range2.to ? periodLabel(t, { from: range2.from, to: range2.to }) : subtitle, params.category ? categoryLabel(t, params.category) : ""].filter(Boolean).join(" — ");
      return done("achats", `${t("Historique des achats")} ${sub2}`, `achats-liste-${range2.from ?? slug}.pdf`, createElement(PurchaseListPdf, { ...common, subtitle: sub2, purchases }));
    }
    case "camions-mensuel": {
      const month = params.mois;
      if (!isMonth(month)) return null;
      const rows = await getTruckMonthly(month);
      return done("rapport_camions", `${t("Rapport mensuel camions")} ${month}`, `rapport-camions-${month}.pdf`, createElement(TruckMonthlyPdf, { ...common, month, rows }));
    }
    case "conges-soldes": {
      const asOf = range.date ?? new Date().toISOString().slice(0, 10);
      const rows = await getLeaveBalances(asOf, { team: params.equipe || undefined, q: params.q || undefined, position: params.poste || undefined, status: params.statut || undefined });
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
  // Photos intégrées au document (téléchargées depuis le stockage privé avant le rendu)
  const { element } = await embedPhotos(built.element);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return runWithPdfContext(built.context, () => renderToBuffer(element as any));
}
