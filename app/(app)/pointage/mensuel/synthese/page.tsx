import { Suspense } from "react";
import { requireModule } from "@/lib/auth";
import { getMonthlyAttendance } from "@/lib/data/attendance";
import { formatWorkMonth, isMonth, todayISO, workMonthOf } from "@/lib/dates";
import { getProjectStart } from "@/lib/data/settings";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { POSITION_LABELS, TEAM_LABELS, TEAM_SLUGS } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { PdfExportButton } from "@/components/pdf-export-button";
import { TeamFilter } from "@/components/team-filter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const generateMetadata = pageTitle("Synthèse mensuelle du pointage");

export default async function MensuelPage({ searchParams }: { searchParams: Promise<{ mois?: string; equipe?: string }> }) {
  const [, { t, locale }] = await Promise.all([requireModule("pointage"), getI18n()]);
  const sp = await searchParams;
  const projectStart = await getProjectStart();
  const month = isMonth(sp.mois) ? sp.mois : workMonthOf(todayISO(), projectStart);
  const team = sp.equipe ? TEAM_SLUGS[sp.equipe] : undefined;
  const rows = await getMonthlyAttendance(month, team);

  const totals = rows.reduce(
    (acc, r) => ({
      worked: acc.worked + r.worked_days,
      restWorked: acc.restWorked + r.rest_days_worked,
      absences: acc.absences + r.absences,
      sick: acc.sick + r.sick_days,
      leave: acc.leave + r.leave_days,
      holidays: acc.holidays + r.holidays_worked,
      double: acc.double + r.double_days,
      ot: acc.ot + r.overtime_total,
    }),
    { worked: 0, restWorked: 0, absences: 0, sick: 0, leave: 0, holidays: 0, double: 0, ot: 0 },
  );

  return (
    <div>
      <ModuleHeader title={t("Synthèse mensuelle du pointage")} subtitle={formatWorkMonth(month, projectStart, locale)} backHref="/pointage/mensuel">
        <Suspense>
          <DateField value={month} param="mois" type="month" label="Mois" />
          <TeamFilter value={team ?? ""} />
        </Suspense>
      </ModuleHeader>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("NB")}</TableHead>
              <TableHead>{t("Nom et prénom")}</TableHead>
              <TableHead>{t("Poste")}</TableHead>
              <TableHead>{t("Équipe")}</TableHead>
              <TableHead className="text-end">{t("Jours travaillés")}</TableHead>
              <TableHead className="text-end">{t("Repos travaillés")}</TableHead>
              <TableHead className="text-end">{t("Absences")}</TableHead>
              <TableHead className="text-end">{t("Maladie")}</TableHead>
              <TableHead className="text-end">{t("Congés")}</TableHead>
              <TableHead className="text-end">{t("Fériés travaillés")}</TableHead>
              <TableHead className="text-end">{t("Jours doublés")}</TableHead>
              <TableHead className="text-end">{t("Total HS")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground">
                  {t("Aucun pointage enregistré pour ce mois.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={r.employee_id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.position ? t(POSITION_LABELS[r.position]) : ""}</TableCell>
                <TableCell>{r.team_type ? t(TEAM_LABELS[r.team_type]) : ""}</TableCell>
                <TableCell className="text-end">{r.worked_days}</TableCell>
                <TableCell className="text-end">{r.rest_days_worked}</TableCell>
                <TableCell className="text-end">{r.absences}</TableCell>
                <TableCell className="text-end">{r.sick_days}</TableCell>
                <TableCell className="text-end">{r.leave_days}</TableCell>
                <TableCell className="text-end">{r.holidays_worked}</TableCell>
                <TableCell className="text-end">{r.double_days}</TableCell>
                <TableCell className="text-end">{r.overtime_total}</TableCell>
              </TableRow>
            ))}
            {rows.length > 0 && (
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={4}>{t("Total")}</TableCell>
                <TableCell className="text-end">{totals.worked}</TableCell>
                <TableCell className="text-end">{totals.restWorked}</TableCell>
                <TableCell className="text-end">{totals.absences}</TableCell>
                <TableCell className="text-end">{totals.sick}</TableCell>
                <TableCell className="text-end">{totals.leave}</TableCell>
                <TableCell className="text-end">{totals.holidays}</TableCell>
                <TableCell className="text-end">{totals.double}</TableCell>
                <TableCell className="text-end">{totals.ot}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("Jours travaillés = Présent + Jour de repos travaillé + Férié non travaillé (journée normale). Jour doublé : jour férié travaillé, jour de repos travaillé ou deux services le même jour.")}
      </p>

      <ModuleButtons pdfSlot={<PdfExportButton kind="pointage-mensuel" params={{ mois: month, ...(team ? { equipe: team } : {}) }} />} historyHref="/pointage/historique" />
    </div>
  );
}
