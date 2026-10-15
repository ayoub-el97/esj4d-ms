import { Suspense } from "react";
import { requireModule } from "@/lib/auth";
import { getMonthlyAttendance } from "@/lib/data/attendance";
import { currentMonth, formatMonthFr } from "@/lib/dates";
import { POSITION_LABELS, TEAM_LABELS, TEAM_SLUGS } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { PdfExportButton } from "@/components/pdf-export-button";
import { TeamFilter } from "@/components/team-filter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Rapport mensuel de pointage" };

export default async function MensuelPage({ searchParams }: { searchParams: Promise<{ mois?: string; equipe?: string }> }) {
  await requireModule("pointage");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.mois ?? "") ? sp.mois! : currentMonth();
  const team = sp.equipe ? TEAM_SLUGS[sp.equipe] : undefined;
  const rows = await getMonthlyAttendance(month, team);

  const totals = rows.reduce(
    (acc, r) => ({
      worked: acc.worked + r.worked_days,
      absences: acc.absences + r.absences,
      sick: acc.sick + r.sick_days,
      leave: acc.leave + r.leave_days,
      holidays: acc.holidays + r.holidays_worked,
      double: acc.double + r.double_days,
      ot: acc.ot + r.overtime_total,
    }),
    { worked: 0, absences: 0, sick: 0, leave: 0, holidays: 0, double: 0, ot: 0 },
  );

  return (
    <div>
      <ModuleHeader title="Rapport mensuel de pointage" subtitle={formatMonthFr(month)} backHref="/pointage">
        <Suspense>
          <DateField value={month} param="mois" type="month" label="Mois" />
          <TeamFilter value={team ?? ""} />
        </Suspense>
      </ModuleHeader>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>NB</TableHead>
              <TableHead>Nom et prénom</TableHead>
              <TableHead>Poste</TableHead>
              <TableHead>Équipe</TableHead>
              <TableHead className="text-right">Jours travaillés</TableHead>
              <TableHead className="text-right">Absences</TableHead>
              <TableHead className="text-right">Maladie</TableHead>
              <TableHead className="text-right">Congés</TableHead>
              <TableHead className="text-right">Fériés travaillés</TableHead>
              <TableHead className="text-right">Jours doublés</TableHead>
              <TableHead className="text-right">Total HS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  Aucun pointage enregistré pour ce mois.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.employee_id}>
                <TableCell>{r.order_number}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.position ? POSITION_LABELS[r.position] : ""}</TableCell>
                <TableCell>{r.team_type ? TEAM_LABELS[r.team_type] : ""}</TableCell>
                <TableCell className="text-right">{r.worked_days}</TableCell>
                <TableCell className="text-right">{r.absences}</TableCell>
                <TableCell className="text-right">{r.sick_days}</TableCell>
                <TableCell className="text-right">{r.leave_days}</TableCell>
                <TableCell className="text-right">{r.holidays_worked}</TableCell>
                <TableCell className="text-right">{r.double_days}</TableCell>
                <TableCell className="text-right">{r.overtime_total}</TableCell>
              </TableRow>
            ))}
            {rows.length > 0 && (
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={4}>Total</TableCell>
                <TableCell className="text-right">{totals.worked}</TableCell>
                <TableCell className="text-right">{totals.absences}</TableCell>
                <TableCell className="text-right">{totals.sick}</TableCell>
                <TableCell className="text-right">{totals.leave}</TableCell>
                <TableCell className="text-right">{totals.holidays}</TableCell>
                <TableCell className="text-right">{totals.double}</TableCell>
                <TableCell className="text-right">{totals.ot}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Jour doublé : jour travaillé le jour de repos habituel ou deux services le même jour (règle modifiable dans Paramètres › Réglages).
      </p>

      <ModuleButtons
        pdfSlot={<PdfExportButton kind="pointage-mensuel" params={{ mois: month, ...(team ? { equipe: team } : {}) }} />}
        historyHref="/pointage/historique"
      />
    </div>
  );
}
