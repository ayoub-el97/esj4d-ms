import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName, getTrucks } from "@/lib/data/employees";
import { getMonthlyReport } from "@/lib/data/monthly";
import { currentMonth, formatMonthFr, isMonth } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/config";
import { POSITION_LABELS, TEAM_LABELS, TEAM_SLUGS } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const generateMetadata = pageTitle("Rapport mensuel");

type SP = { mois?: string; categorie?: string; employe?: string; equipe?: string; camion?: string };
const CATEGORIES = { toutes: "Toutes", pointage: "Pointage", camions: "Camions", conges: "Congés", avertissements: "Avertissements", interventions: "Interventions" } as const;

export default async function RapportMensuelPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("rapport_mensuel"), getI18n()]);
  const sp = await searchParams;
  const month = isMonth(sp.mois) ? sp.mois : currentMonth();
  const cat = (sp.categorie && sp.categorie in CATEGORIES ? sp.categorie : "toutes") as keyof typeof CATEGORIES;
  const team = sp.equipe ? TEAM_SLUGS[sp.equipe] : undefined;
  const [report, employees, trucks] = await Promise.all([getMonthlyReport(month, { team, employee: sp.employe, truck: sp.camion }), getEmployees(), getTrucks()]);
  const show = (c: keyof typeof CATEGORIES) => cat === "toutes" || cat === c;
  const pdfParams: Record<string, string> = { mois: month, categorie: cat };
  if (sp.employe) pdfParams.employe = sp.employe;
  if (team) pdfParams.equipe = team;
  if (sp.camion) pdfParams.camion = sp.camion;

  return (
    <div>
      <ModuleHeader title={t("Rapport mensuel")} subtitle={formatMonthFr(month, locale)} />

      <form className="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="space-y-1">
          <Label htmlFor="mois">{t("Mois")}</Label>
          <Input id="mois" name="mois" type="month" defaultValue={month} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="categorie">{t("Catégorie")}</Label>
          <NativeSelect id="categorie" name="categorie" defaultValue={cat}>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {t(v)}
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
        <div className="space-y-1">
          <Label htmlFor="equipe">{t("Équipe")}</Label>
          <NativeSelect id="equipe" name="equipe" defaultValue={team ?? ""}>
            <option value="">{t("Toutes")}</option>
            <option value="collecte">{t("Collecte")}</option>
            <option value="nettoiement">{t("Nettoiement")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="camion">{t("Camion")}</Label>
          <NativeSelect id="camion" name="camion" defaultValue={sp.camion ?? ""}>
            <option value="">{t("Tous")}</option>
            {trucks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.matricule}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> {t("Afficher")}
          </Button>
        </div>
      </form>

      <div className="space-y-6">
        {show("pointage") && (
          <Card>
            <CardHeader>
              <CardTitle>{t("Pointage")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("NB")}</TableHead>
                    <TableHead>{t("Nom")}</TableHead>
                    <TableHead>{t("Poste")}</TableHead>
                    <TableHead>{t("Équipe")}</TableHead>
                    <TableHead className="text-end">{t("Travaillés")}</TableHead>
                    <TableHead className="text-end">{t("Repos travaillés")}</TableHead>
                    <TableHead className="text-end">{t("Absences")}</TableHead>
                    <TableHead className="text-end">{t("Maladie")}</TableHead>
                    <TableHead className="text-end">{t("Congés")}</TableHead>
                    <TableHead className="text-end">{t("Fériés trav.")}</TableHead>
                    <TableHead className="text-end">{t("Doublés")}</TableHead>
                    <TableHead className="text-end">{t("HS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.attendance.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground">
                        {t("Aucun pointage.")}
                      </TableCell>
                    </TableRow>
                  )}
                  {report.attendance.map((r) => (
                    <TableRow key={r.employee_id}>
                      <TableCell>{r.order_number}</TableCell>
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
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {show("camions") && !sp.employe && (
          <Card>
            <CardHeader>
              <CardTitle>{t("Camions")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Matricule")}</TableHead>
                    <TableHead>{t("Marque")}</TableHead>
                    <TableHead className="text-end">{t("Jours")}</TableHead>
                    <TableHead className="text-end">{t("Tickets")}</TableHead>
                    <TableHead className="text-end">{t("Tonnage (t)")}</TableHead>
                    <TableHead className="text-end">{t("Vidages")}</TableHead>
                    <TableHead className="text-end">{t("Km")}</TableHead>
                    <TableHead className="text-end">{t("Carburant")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.trucks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        {t("Aucune donnée camion.")}
                      </TableCell>
                    </TableRow>
                  )}
                  {report.trucks.map((tr) => (
                    <TableRow key={tr.truck?.id}>
                      <TableCell className="font-mono">{tr.truck?.matricule}</TableCell>
                      <TableCell>{tr.truck?.brand}</TableCell>
                      <TableCell className="text-end">{tr.days}</TableCell>
                      <TableCell className="text-end">{tr.tickets}</TableCell>
                      <TableCell className="text-end">{tr.tonnage.toFixed(2)}</TableCell>
                      <TableCell className="text-end">{tr.dumps}</TableCell>
                      <TableCell className="text-end">{tr.km.toFixed(1)}</TableCell>
                      <TableCell className="text-end">{tr.fuel.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {show("conges") && <CountCard t={t} title={t("Congés acceptés (jours dans le mois)")} rows={report.leaves} unit={t("j")} />}
          {show("avertissements") && user.permissions.avertissements.can_view && <CountCard t={t} title={t("Avertissements (incidents du mois)")} rows={report.warnings} unit="" />}
          {show("interventions") && (
            <Card>
              <CardHeader>
                <CardTitle>{t("Interventions")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-xl font-semibold">{report.greenWasteCount}</div>
                    <div className="text-xs text-muted-foreground">{t("Déchet vert")}</div>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-xl font-semibold">{report.tasksDone}</div>
                    <div className="text-xs text-muted-foreground">{t("Tâches réalisées")}</div>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-xl font-semibold">{report.tasksPlanned}</div>
                    <div className="text-xs text-muted-foreground">{t("Tâches planifiées")}</div>
                  </div>
                </div>
                <div>
                  <div className="mb-1 font-medium">{t("Jours de nettoiement rapportés par agent")}</div>
                  {report.cleaningDays.length === 0 ? (
                    <p className="text-muted-foreground">—</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {report.cleaningDays.map((r) => (
                        <li key={r.employee_id} className="flex justify-between">
                          <span>{r.name}</span>
                          <span>
                            {r.value} {t("j")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ModuleButtons pdfSlot={<PdfExportButton kind="rapport-mensuel" params={pdfParams} />} />
    </div>
  );
}

function CountCard({ t, title, rows, unit }: { t: TFunction; title: string; rows: { employee_id: string; name: string; value: number }[]; unit: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">{t("Aucun.")}</p>
        ) : (
          <ul className="space-y-0.5">
            {rows.map((r) => (
              <li key={r.employee_id} className="flex justify-between">
                <span>{r.name}</span>
                <span className="font-medium">
                  {r.value} {unit}
                </span>
              </li>
            ))}
            <li className="flex justify-between border-t pt-1 font-semibold">
              <span>{t("Total")}</span>
              <span>
                {rows.reduce((s, r) => s + r.value, 0)} {unit}
              </span>
            </li>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
