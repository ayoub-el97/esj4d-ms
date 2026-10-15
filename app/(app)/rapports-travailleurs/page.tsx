import Link from "next/link";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { getWorkerReport } from "@/lib/data/worker";
import { currentMonth, formatDateFr, formatDateTimeFr, isISODate, monthRange } from "@/lib/dates";
import { ATTENDANCE_STATUS_LABELS, POSITION_LABELS, TEAM_LABELS, type AttendanceStatus } from "@/lib/types";
import { LEAVE_STATUS_LABELS, TASK_STATUS_LABELS, WARNING_STATUS_LABELS } from "@/lib/module-types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PhotoGallery } from "@/components/photo-gallery";

export const metadata = { title: "Rapports travailleurs" };

export default async function RapportsTravailleursPage({ searchParams }: { searchParams: Promise<{ employe?: string; from?: string; to?: string }> }) {
  const user = await requireModule("rapports_travailleurs");
  const sp = await searchParams;
  const defaults = monthRange(currentMonth());
  const from = isISODate(sp.from) ? sp.from : defaults.from;
  const to = isISODate(sp.to) ? sp.to : defaults.to;
  const employees = await getEmployees();
  const report = sp.employe ? await getWorkerReport(sp.employe, from, to, user.permissions.avertissements.can_view) : null;

  return (
    <div>
      <ModuleHeader title="Rapports travailleurs" subtitle={report ? `${employeeName(report.employee)} — du ${formatDateFr(from)} au ${formatDateFr(to)}` : "Choisissez un employé et une période"} />

      <form className="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="employe">Employé</Label>
          <NativeSelect id="employe" name="employe" defaultValue={sp.employe ?? ""} required>
            <option value="">— Choisir —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.order_number}. {employeeName(e)} ({POSITION_LABELS[e.position]})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">Du</Label>
          <Input id="from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Au</Label>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> Consulter
          </Button>
        </div>
      </form>

      {report && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Jours travaillés", report.summary.worked],
              ["Absences", report.summary.absent],
              ["Maladie", report.summary.sick],
              ["Congé (pointage)", report.summary.leave],
              ["Repos", report.summary.rest],
              ["Heures sup.", report.summary.overtime],
            ].map(([label, value]) => (
              <Card key={String(label)}>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-2xl font-semibold">{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                Fiche — {employeeName(report.employee)} · {POSITION_LABELS[report.employee.position]} · {TEAM_LABELS[report.employee.team_type]} · NB {report.employee.order_number} · matricule {report.employee.matricule}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <h3 className="mb-2 font-medium">Pointages ({report.attendance.length})</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Entrée</TableHead>
                    <TableHead>Sortie</TableHead>
                    <TableHead>HS</TableHead>
                    <TableHead>Observation</TableHead>
                    <TableHead>Saisi le</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.attendance.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Aucun pointage sur la période.
                      </TableCell>
                    </TableRow>
                  )}
                  {report.attendance.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link href={`/pointage/${a.team_type}?date=${a.activity_date}`} className="hover:underline">
                          {formatDateFr(a.activity_date)}
                        </Link>
                        {a.shift > 1 && <Badge variant="outline" className="ml-1">service {a.shift}</Badge>}
                      </TableCell>
                      <TableCell>{ATTENDANCE_STATUS_LABELS[a.status as AttendanceStatus]}</TableCell>
                      <TableCell>{a.time_in?.slice(0, 5)}</TableCell>
                      <TableCell>{a.time_out?.slice(0, 5)}</TableCell>
                      <TableCell>{Number(a.overtime_hours) || ""}</TableCell>
                      <TableCell className="max-w-48 truncate">{a.observation}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTimeFr(a.updated_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Congés ({report.leaves.length})</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {report.leaves.length === 0 ? (
                  <p className="text-muted-foreground">Aucune demande sur la période.</p>
                ) : (
                  <ul className="space-y-1">
                    {report.leaves.map((l) => (
                      <li key={l.id} className="flex justify-between">
                        <span>
                          {formatDateFr(l.start_date)} → {formatDateFr(l.end_date)} ({l.days} j)
                        </span>
                        <Badge variant={l.status === "acceptee" ? "default" : l.status === "refusee" ? "destructive" : "secondary"}>{LEAVE_STATUS_LABELS[l.status]}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lieux de travail ({report.cleaningPlaces.length + report.collections.length})</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {report.cleaningPlaces.length + report.collections.length === 0 ? (
                  <p className="text-muted-foreground">Aucun rapport journalier sur la période.</p>
                ) : (
                  <ul className="space-y-1">
                    {report.cleaningPlaces.map((c) => (
                      <li key={c.id}>
                        <Link href={`/rapport-journalier/nettoiement?date=${c.activity_date}`} className="hover:underline">
                          {formatDateFr(c.activity_date)}
                        </Link>{" "}
                        — Nettoiement : {c.location || "lieu non précisé"} {c.comment && <span className="text-muted-foreground">({c.comment})</span>}
                      </li>
                    ))}
                    {report.collections.map((c) => (
                      <li key={c.id}>
                        <Link href={`/rapport-journalier/collecte/${c.id}`} className="hover:underline">
                          {formatDateFr(c.activity_date)}
                        </Link>{" "}
                        — Collecte camion {c.truck?.matricule} : {c.sectors || "secteurs non précisés"}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Interventions réalisées ({report.tasks.length})</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {report.tasks.length === 0 ? (
                  <p className="text-muted-foreground">Aucune tâche sur la période.</p>
                ) : (
                  <ul className="space-y-1">
                    {report.tasks.map((t) => (
                      <li key={t.id} className="flex justify-between gap-2">
                        <span>
                          <Link href={`/programme/${t.id}`} className="hover:underline">
                            {formatDateFr(t.planned_date)}
                          </Link>{" "}
                          — {t.location || t.description}
                        </span>
                        <Badge variant={t.status === "realisee" ? "default" : "secondary"}>{TASK_STATUS_LABELS[t.status]}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {user.permissions.avertissements.can_view && (
              <Card>
                <CardHeader>
                  <CardTitle>Avertissements ({report.warnings.length})</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  {report.warnings.length === 0 ? (
                    <p className="text-muted-foreground">Aucun avertissement sur la période.</p>
                  ) : (
                    <ul className="space-y-1">
                      {report.warnings.map((w) => (
                        <li key={w.id} className="flex justify-between gap-2">
                          <span>
                            <Link href={`/avertissements/${w.id}`} className="hover:underline">
                              {formatDateFr(w.incident_date)}
                            </Link>{" "}
                            — {w.description}
                          </span>
                          <Badge variant="outline">{WARNING_STATUS_LABELS[w.status]}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Photos avant / après ({report.photos.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <PhotoGallery photos={report.photos.map((p) => ({ id: p.id, url: p.url, caption: `${formatDateFr(p.activity_date)} · ${p.phase.toUpperCase()}${p.location ? ` · ${p.location}` : ""}` }))} />
            </CardContent>
          </Card>
        </div>
      )}

      <ModuleButtons pdfSlot={report ? <PdfExportButton kind="travailleur" params={{ employe: report.employee.id, from, to }} /> : undefined} />
    </div>
  );
}
