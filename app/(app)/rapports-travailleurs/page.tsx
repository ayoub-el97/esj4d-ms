import Link from "next/link";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { getWorkersPeriodReport } from "@/lib/data/worker";
import { formatDateFr, isISODate, isMonth, todayISO, workMonthOf, workMonthRange } from "@/lib/dates";
import { getProjectStart } from "@/lib/data/settings";
import { getT, pageTitle } from "@/lib/i18n/server";
import { POSITION_LABELS, TEAM_LABELS, ALL_POSITIONS } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableFooter, TableRow } from "@/components/ui/table";

export const generateMetadata = pageTitle("Rapports travailleurs");

type SP = { mois?: string; from?: string; to?: string; categorie?: string; employe?: string; poste?: string; equipe?: string; q?: string };

/** Période choisie : du/au si renseignés, sinon le mois sélectionné (mois courant par défaut). */
function resolvePeriod(sp: SP, projectStart: string | null): { from: string; to: string; month: string | null } {
  if (isISODate(sp.from) && isISODate(sp.to) && sp.from <= sp.to) return { from: sp.from, to: sp.to, month: null };
  const month = isMonth(sp.mois) ? sp.mois : workMonthOf(todayISO(), projectStart);
  return { ...workMonthRange(month, projectStart), month };
}

export default async function RapportsTravailleursPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [, t] = await Promise.all([requireModule("rapports_travailleurs"), getT()]);
  const sp = await searchParams;
  const projectStart = await getProjectStart();
  const { from, to, month } = resolvePeriod(sp, projectStart);
  const [rows, employees] = await Promise.all([getWorkersPeriodReport(from, to, sp), getEmployees()]);
  const chauffeurs = employees.filter((e) => e.position === "chauffeur");
  const period = t("du {from} au {to}", { from: formatDateFr(from), to: formatDateFr(to) });

  const totals = rows.reduce(
    (a, r) => ({ worked: a.worked + r.worked_days, rest: a.rest + r.rest_days_worked, ot: a.ot + r.overtime_total, abs: a.abs + r.absences + r.sick_days, accrued: a.accrued + r.leave_accrued, leave: a.leave + r.leave_days, leaveLeft: a.leaveLeft + r.leave_balance, recup: a.recup + r.recovery_days, owed: a.owed + r.recovery_balance, hol: a.hol + r.holidays_worked, pay: a.pay + r.holiday_pay_days }),
    { worked: 0, rest: 0, ot: 0, abs: 0, leave: 0, recup: 0, owed: 0, hol: 0, pay: 0, accrued: 0, leaveLeft: 0 },
  );
  const pdfParams: Record<string, string> = { from, to };
  for (const k of ["categorie", "employe", "poste", "equipe", "q"] as const) if (sp[k]) pdfParams[k] = sp[k]!;

  return (
    <div>
      <ModuleHeader title={t("Rapports travailleurs")} subtitle={t("Rapport des employés {period}", { period })} />

      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="mois">{t("Mois")}</Label>
          <Input id="mois" name="mois" type="month" defaultValue={month ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">{t("ou du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={month ? "" : from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={month ? "" : to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="categorie">{t("Catégorie")}</Label>
          <NativeSelect id="categorie" name="categorie" defaultValue={sp.categorie ?? ""}>
            <option value="">{t("Toutes")}</option>
            <option value="collecte">{t("Collecte")}</option>
            <option value="nettoiement">{t("Nettoiement")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="poste">{t("Poste")}</Label>
          <NativeSelect id="poste" name="poste" defaultValue={sp.poste ?? ""}>
            <option value="">{t("Tous")}</option>
            {ALL_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {t(POSITION_LABELS[p])}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="equipe">{t("Équipe (chauffeur)")}</Label>
          <NativeSelect id="equipe" name="equipe" defaultValue={sp.equipe ?? ""}>
            <option value="">{t("Toutes")}</option>
            {chauffeurs.map((c) => (
              <option key={c.id} value={c.id}>
                {t("Équipe {name}", { name: employeeName(c) })}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="employe">{t("Employé")}</Label>
          <NativeSelect id="employe" name="employe" defaultValue={sp.employe ?? ""}>
            <option value="">{t("Tous")}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {employeeName(e)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="q">{t("Recherche (nom ou matricule)")}</Label>
          <Input id="q" name="q" defaultValue={sp.q} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">
            <Search /> {t("Afficher")}
          </Button>
          <LinkButton href="/rapports-travailleurs" variant="outline">
            {t("Mois courant")}
          </LinkButton>
        </div>
      </form>

      <p className="mb-2 text-xs text-muted-foreground">{t("Calculé depuis les pointages : une même journée n'est jamais comptée deux fois, même avec plusieurs services. Jours travaillés = Présent + Jour de repos travaillé + Férié non travaillé.")} {t("Férié travaillé : compte double, 1 jour à récupérer demandé avant la fin du mois, sinon à payer.")} {t("Congés pris et récupérations prises : jours pointés, ou demande acceptée pour un jour passé non pointé. Récupération restante : repos travaillés pas encore récupérés.")}</p>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("NB")}</TableHead>
              <TableHead>{t("Matricule")}</TableHead>
              <TableHead>{t("Nom et prénom")}</TableHead>
              <TableHead>{t("Équipe")}</TableHead>
              <TableHead>{t("Poste")}</TableHead>
              <TableHead className="text-end">{t("Jours travaillés")}</TableHead>
              <TableHead className="text-end">{t("Repos travaillés")}</TableHead>
              <TableHead className="text-end">{t("Total HS")}</TableHead>
              <TableHead className="text-end">{t("Absences")}</TableHead>
              <TableHead className="text-end">{t("Fériés travaillés")}</TableHead>
              <TableHead className="text-end" title={t("Fériés travaillés dont la récupération n'a pas été demandée avant la fin du mois : à ajouter au salaire")}>{t("Fériés à payer")}</TableHead>
              <TableHead className="text-end" title={t("Congés acquis à la fin de la période (1,5 jour par mois complet de service)")}>{t("Total congés")}</TableHead>
              <TableHead className="text-end">{t("Congés pris")}</TableHead>
              <TableHead className="text-end" title={t("Congés acquis − congés pris + corrections, à la fin de la période")}>{t("Congé restant")}</TableHead>
              <TableHead className="text-end">{t("Récupérations prises")}</TableHead>
              <TableHead className="text-end" title={t("Jours de repos travaillés pas encore récupérés, à la fin de la période")}>{t("Récupération restante")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={15} className="text-center text-muted-foreground">
                  {t("Aucun employé ne correspond aux filtres.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.employee_id}>
                <TableCell>{r.order_number}</TableCell>
                <TableCell className="font-mono text-xs">{r.matricule}</TableCell>
                <TableCell>
                  <Link href={`/rapports-travailleurs/${r.employee_id}?from=${from}&to=${to}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {t(TEAM_LABELS[r.team_type])}
                  {r.crew && <div className="text-xs text-muted-foreground">{t("Équipe {name}", { name: r.crew })}</div>}
                </TableCell>
                <TableCell>{t(POSITION_LABELS[r.position])}</TableCell>
                <TableCell className="text-end font-medium">{r.worked_days}</TableCell>
                <TableCell className="text-end">{r.rest_days_worked}</TableCell>
                <TableCell className="text-end">{r.overtime_total}</TableCell>
                <TableCell className="text-end" title={t("dont maladie : {n}", { n: r.sick_days })}>
                  {r.absences + r.sick_days}
                </TableCell>
                <TableCell className="text-end">{r.holidays_worked}</TableCell>
                <TableCell className={`text-end ${r.holiday_pay_days > 0 ? "font-medium text-orange-700" : ""}`}>{r.holiday_pay_days}</TableCell>
                <TableCell className="text-end">{r.leave_accrued}</TableCell>
                <TableCell className="text-end">{r.leave_days}</TableCell>
                <TableCell className={`text-end ${r.leave_balance < 0 ? "font-medium text-destructive" : "font-medium"}`}>{r.leave_balance}</TableCell>
                <TableCell className="text-end">{r.recovery_days}</TableCell>
                <TableCell className={`text-end ${r.recovery_balance > 0 ? "font-medium text-violet-700" : ""}`}>{r.recovery_balance}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5}>{t("Total ({count} employés)", { count: rows.length })}</TableCell>
                <TableCell className="text-end">{totals.worked}</TableCell>
                <TableCell className="text-end">{totals.rest}</TableCell>
                <TableCell className="text-end">{totals.ot}</TableCell>
                <TableCell className="text-end">{totals.abs}</TableCell>
                <TableCell className="text-end">{totals.hol}</TableCell>
                <TableCell className="text-end">{totals.pay}</TableCell>
                <TableCell className="text-end">{totals.accrued}</TableCell>
                <TableCell className="text-end">{totals.leave}</TableCell>
                <TableCell className="text-end">{totals.leaveLeft}</TableCell>
                <TableCell className="text-end">{totals.recup}</TableCell>
                <TableCell className="text-end">{totals.owed}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      <ModuleButtons pdfSlot={<PdfExportButton kind="travailleurs-periode" params={pdfParams} />} />
    </div>
  );
}
