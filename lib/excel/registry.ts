import "server-only";
import { getSettings } from "@/lib/data/settings";
import { buildSheet, getAttendanceHistory, type HistoryFilters } from "@/lib/data/attendance";
import { getCleaningReport, getCollectionReports, getTruckReports, SHIFT_LABELS } from "@/lib/data/reports";
import { employeeName } from "@/lib/data/employees";
import { COLLECTION_STATUS_LABELS } from "@/lib/collection-status";
import { formatDateFr, isISODate } from "@/lib/dates";
import { makeT, type TFunction } from "@/lib/i18n/config";
import { getLocale, getMessages, pdfLocale } from "@/lib/i18n/server";
import { ATTENDANCE_STATUS_LABELS, POSITION_LABELS, TEAM_LABELS, TEAM_SLUGS, type AppModule, type TeamType } from "@/lib/types";
import type { XlsxCell, XlsxSheet } from "@/lib/xlsx";
import { sheetTitle } from "@/lib/sheet-title";

export type BuiltXlsx = { module: AppModule; filename: string; sheets: XlsxSheet[] };

const d = (v: string | undefined) => (isISODate(v) ? v : undefined);
const hours = (v: unknown) => (Number(v) ? Number(v) : null);
const time = (v: string | null | undefined) => (v ? v.slice(0, 5) : "");

function periodLabel(t: TFunction, f: { date?: string; from?: string; to?: string }) {
  if (f.date) return formatDateFr(f.date);
  if (f.from || f.to) return t("du {from} au {to}", { from: f.from ? formatDateFr(f.from) : "…", to: f.to ? formatDateFr(f.to) : "…" });
  return t("toutes dates");
}

async function attendanceSheet(t: TFunction, date: string, team: TeamType, company: string): Promise<XlsxSheet> {
  const sheet = await buildSheet(date, team);
  const names = new Map(sheet.rows.map((r) => [r.employee_id, r.name]));
  const plates = new Map(sheet.trucks.map((x) => [x.id, x.matricule]));
  const header = [t("NB"), t("Nom"), t("Matricule"), t("Fonction du jour"), ...(team === "collecte" ? [t("Équipe (chauffeur)"), t("Camion")] : []), t("Service"), t("Statut"), t("Entrée"), t("Sortie"), t("HS auto"), t("HS manuelles"), t("HS total"), t("Remplace"), t("Observation")];
  const rows: XlsxCell[][] = sheet.rows.map((r, i) => [
    i + 1,
    r.name,
    r.matricule,
    t(POSITION_LABELS[r.position]),
    ...(team === "collecte" ? [r.position === "chauffeur" ? r.name : r.chauffeur_id ? (names.get(r.chauffeur_id) ?? "") : "", r.truck_id ? (plates.get(r.truck_id) ?? "") : ""] : []),
    r.shift,
    t(ATTENDANCE_STATUS_LABELS[r.status]),
    r.time_in,
    r.time_out,
    hours(r.overtime_auto),
    hours(r.overtime_manual),
    hours(Number(r.overtime_auto) + Number(r.overtime_manual)),
    r.replacing_employee_id ? (names.get(r.replacing_employee_id) ?? "") : "",
    r.observation,
  ]);
  const name = team === "collecte" ? t("Collecte") : t("Nettoiement");
  return { name, title: [company, sheetTitle(t, team, date), ...(sheet.teamLead ? [`${t("Chef d'équipe")} : ${sheet.teamLead}`] : [])], header, rows };
}

/** Registre des exports Excel : données enregistrées, lues avec la session de l'utilisateur (RLS). */
export async function buildExcel(kind: string, params: Record<string, string>): Promise<BuiltXlsx | null> {
  const [settings, userLocale] = await Promise.all([getSettings(), getLocale()]);
  const t = makeT(getMessages(pdfLocale(userLocale)));
  const company = settings.company_name;
  const range = { date: d(params.date), from: d(params.from), to: d(params.to) };

  switch (kind) {
    case "pointage": {
      // Une équipe, ou les deux feuilles de la date (une feuille Excel par équipe)
      if (!range.date) return null;
      const one = TEAM_SLUGS[params.equipe ?? ""];
      const teams: TeamType[] = one ? [one] : ["collecte", "nettoiement"];
      const sheets = await Promise.all(teams.map((team) => attendanceSheet(t, range.date!, team, company)));
      return { module: "pointage", filename: `pointage-${one ?? "equipes"}-${range.date}.xlsx`, sheets };
    }
    case "pointage-historique": {
      const f: HistoryFilters = { from: range.from, to: range.to, employee: params.employee || undefined, team: params.team || undefined, position: params.position || undefined, status: params.status || undefined };
      const rows = await getAttendanceHistory(f, 5000);
      return {
        module: "pointage",
        filename: `historique-pointage-${range.from ?? "debut"}-${range.to ?? "fin"}.xlsx`,
        sheets: [
          {
            name: t("Historique du pointage"),
            title: [company, `${t("Historique du pointage")} — ${periodLabel(t, f)}`],
            header: [t("Date d'activité"), t("Équipe"), t("Nom"), t("Fonction du jour"), t("Service"), t("Statut"), t("Entrée"), t("Sortie"), t("HS auto"), t("HS manuelles"), t("Observation"), t("Dernière saisie"), t("Saisi par")],
            rows: rows.map((r) => [formatDateFr(r.activity_date), t(TEAM_LABELS[r.team_type as TeamType]), r.name, t(POSITION_LABELS[r.position]), r.shift, t(ATTENDANCE_STATUS_LABELS[r.status]), time(r.time_in), time(r.time_out), hours(r.overtime_auto), hours(r.overtime_manual), r.observation, r.updated_at ? r.updated_at.slice(0, 16).replace("T", " ") : "", r.updated_by_email]),
          },
        ],
      };
    }
    case "rapport-nettoiement": {
      if (!range.date) return null;
      const { report, agents } = await getCleaningReport(range.date);
      return {
        module: "rapport_journalier",
        filename: `rapport-nettoiement-${range.date}.xlsx`,
        sheets: [
          {
            name: t("Nettoiement"),
            title: [company, `${t("Rapport journalier — Nettoiement")} — ${formatDateFr(range.date)}`, ...(report?.observations ? [`${t("Observations")} : ${report.observations}`] : [])],
            header: [t("NB"), t("Agent"), t("Lieu de travail"), t("Commentaire"), t("Photos Avant"), t("Photos Après")],
            rows: agents.map((a, i) => [i + 1, a.name, a.location, a.comment, a.photosAvant.length, a.photosApres.length]),
          },
        ],
      };
    }
    case "rapport-collecte": {
      const reports = await getCollectionReports({ ...range, truck: params.truck || undefined }, 2000);
      return {
        module: "rapport_journalier",
        filename: `rapport-collecte-${range.date ?? `${range.from ?? "debut"}-${range.to ?? "fin"}`}.xlsx`,
        sheets: [
          {
            name: t("Collecte"),
            title: [company, `${t("Rapport journalier — Collecte")} — ${periodLabel(t, range)}`],
            header: [t("Date d'activité"), t("Camion"), t("Chauffeur"), t("Équipe (rippeurs)"), t("Lieux / secteurs"), t("Observations"), t("Statut"), t("Photos Avant"), t("Photos Après")],
            rows: reports.map((r) => [formatDateFr(r.activity_date), r.truck?.matricule ?? "", r.chauffeur ? employeeName(r.chauffeur) : "", r.rippers.map((e) => employeeName(e)).join(", "), r.sectors, r.observations, t(COLLECTION_STATUS_LABELS[r.status]), r.photosAvant.length, r.photosApres.length]),
          },
        ],
      };
    }
    case "camions": {
      const rows = await getTruckReports({ ...range, truck: params.truck || undefined }, 5000);
      const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
      return {
        module: "rapport_camions",
        filename: `rapport-camions-${range.date ?? `${range.from ?? "debut"}-${range.to ?? "fin"}`}.xlsx`,
        sheets: [
          {
            name: t("Rapport camions"),
            title: [company, `${t("Rapport camions")} — ${periodLabel(t, range)}`],
            header: [t("Date"), t("Matricule"), t("Poste"), t("Chauffeur"), t("Vidages (ticket — tonnage)"), t("Tonnage total"), t("Vidages"), t("Équipe (rippeurs)"), t("Km départ"), t("Km fin"), t("Km parcourus"), t("Carburant"), t("Observations")],
            rows: rows.map((r) => [
              formatDateFr(r.activity_date),
              r.truck?.matricule ?? "",
              t(SHIFT_LABELS[r.shift] ?? "Matin"),
              r.chauffeur_name,
              r.loads.map((l, i) => `${i + 1}. ${l.ticket || "—"} — ${l.tonnage ?? "—"} t`).join(" ; "),
              r.tonnage_total,
              r.dumps_count,
              r.crew.join(", "),
              r.km_start == null ? null : Number(r.km_start),
              r.km_end == null ? null : Number(r.km_end),
              r.km == null ? null : Number(r.km),
              r.fuel == null ? null : Number(r.fuel),
              r.observations,
            ]),
            footer: [t("Total ({count} ligne(s))", { count: rows.length }), "", "", "", "", Math.round(sum((r) => r.tonnage_total) * 100) / 100, sum((r) => r.dumps_count), "", "", "", Math.round(sum((r) => Number(r.km ?? 0)) * 10) / 10, Math.round(sum((r) => Number(r.fuel ?? 0)) * 100) / 100, ""],
          },
        ],
      };
    }
  }
  return null;
}
