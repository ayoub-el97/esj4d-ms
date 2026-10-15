import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName, getTrucks } from "@/lib/data/employees";
import { getMonthlyReport } from "@/lib/data/monthly";
import { currentMonth, formatMonthFr, isMonth } from "@/lib/dates";
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

export const metadata = { title: "Rapport mensuel" };

type SP = { mois?: string; categorie?: string; employe?: string; equipe?: string; camion?: string };
const CATEGORIES = { toutes: "Toutes", pointage: "Pointage", camions: "Camions", conges: "Congés", avertissements: "Avertissements", interventions: "Interventions" } as const;

export default async function RapportMensuelPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireModule("rapport_mensuel");
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
      <ModuleHeader title="Rapport mensuel" subtitle={formatMonthFr(month)} />

      <form className="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="space-y-1">
          <Label htmlFor="mois">Mois</Label>
          <Input id="mois" name="mois" type="month" defaultValue={month} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="categorie">Catégorie</Label>
          <NativeSelect id="categorie" name="categorie" defaultValue={cat}>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="employe">Employé</Label>
          <NativeSelect id="employe" name="employe" defaultValue={sp.employe ?? ""}>
            <option value="">Tous</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {employeeName(e)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="equipe">Équipe</Label>
          <NativeSelect id="equipe" name="equipe" defaultValue={team ?? ""}>
            <option value="">Toutes</option>
            <option value="collecte">Collecte</option>
            <option value="nettoiement">Nettoiement</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="camion">Camion</Label>
          <NativeSelect id="camion" name="camion" defaultValue={sp.camion ?? ""}>
            <option value="">Tous</option>
            {trucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.matricule}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> Afficher
          </Button>
        </div>
      </form>

      <div className="space-y-6">
        {show("pointage") && (
          <Card>
            <CardHeader>
              <CardTitle>Pointage</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NB</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Poste</TableHead>
                    <TableHead>Équipe</TableHead>
                    <TableHead className="text-right">Travaillés</TableHead>
                    <TableHead className="text-right">Absences</TableHead>
                    <TableHead className="text-right">Maladie</TableHead>
                    <TableHead className="text-right">Congés</TableHead>
                    <TableHead className="text-right">Fériés trav.</TableHead>
                    <TableHead className="text-right">Doublés</TableHead>
                    <TableHead className="text-right">HS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.attendance.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground">
                        Aucun pointage.
                      </TableCell>
                    </TableRow>
                  )}
                  {report.attendance.map((r) => (
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
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {show("camions") && !sp.employe && (
          <Card>
            <CardHeader>
              <CardTitle>Camions</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Matricule</TableHead>
                    <TableHead>Marque</TableHead>
                    <TableHead className="text-right">Jours</TableHead>
                    <TableHead className="text-right">Tickets</TableHead>
                    <TableHead className="text-right">Tonnage (t)</TableHead>
                    <TableHead className="text-right">Vidages</TableHead>
                    <TableHead className="text-right">Km</TableHead>
                    <TableHead className="text-right">Carburant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.trucks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        Aucune donnée camion.
                      </TableCell>
                    </TableRow>
                  )}
                  {report.trucks.map((t) => (
                    <TableRow key={t.truck?.id}>
                      <TableCell className="font-mono">{t.truck?.matricule}</TableCell>
                      <TableCell>{t.truck?.brand}</TableCell>
                      <TableCell className="text-right">{t.days}</TableCell>
                      <TableCell className="text-right">{t.tickets}</TableCell>
                      <TableCell className="text-right">{t.tonnage.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{t.dumps}</TableCell>
                      <TableCell className="text-right">{t.km.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{t.fuel.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {show("conges") && <CountCard title="Congés acceptés (jours dans le mois)" rows={report.leaves} unit="j" />}
          {show("avertissements") && user.permissions.avertissements.can_view && <CountCard title="Avertissements (incidents du mois)" rows={report.warnings} unit="" />}
          {show("interventions") && (
            <Card>
              <CardHeader>
                <CardTitle>Interventions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-xl font-semibold">{report.greenWasteCount}</div>
                    <div className="text-xs text-muted-foreground">Déchet vert</div>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-xl font-semibold">{report.tasksDone}</div>
                    <div className="text-xs text-muted-foreground">Tâches réalisées</div>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-xl font-semibold">{report.tasksPlanned}</div>
                    <div className="text-xs text-muted-foreground">Tâches planifiées</div>
                  </div>
                </div>
                <div>
                  <div className="mb-1 font-medium">Jours de nettoiement rapportés par agent</div>
                  {report.cleaningDays.length === 0 ? (
                    <p className="text-muted-foreground">—</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {report.cleaningDays.map((r) => (
                        <li key={r.employee_id} className="flex justify-between">
                          <span>{r.name}</span>
                          <span>{r.value} j</span>
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

function CountCard({ title, rows, unit }: { title: string; rows: { employee_id: string; name: string; value: number }[]; unit: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">Aucun.</p>
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
              <span>Total</span>
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
