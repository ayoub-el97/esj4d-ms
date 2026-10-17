import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { employeeName } from "@/lib/data/employees";
import { getWorkerReport } from "@/lib/data/worker";
import { currentMonth, formatDateFr, formatDateTimeFr, isISODate, monthRange } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ATTENDANCE_STATUS_LABELS, POSITION_LABELS, TEAM_LABELS, type AttendanceStatus } from "@/lib/types";
import { LEAVE_STATUS_LABELS, TASK_STATUS_LABELS, WARNING_STATUS_LABELS } from "@/lib/module-types";
import { PHOTO_PHASE_LABELS, type PhotoPhase } from "@/lib/photo-types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PhotoGallery } from "@/components/photo-gallery";

export const generateMetadata = pageTitle("Fiche travailleur");

export default async function WorkerFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const [user, t] = await Promise.all([requireModule("rapports_travailleurs"), getT()]);
  const { id } = await params;
  const sp = await searchParams;
  const defaults = monthRange(currentMonth());
  const from = isISODate(sp.from) ? sp.from : defaults.from;
  const to = isISODate(sp.to) ? sp.to : defaults.to;
  const report = await getWorkerReport(id, from, to, user.permissions.avertissements.can_view);
  if (!report) notFound();
  const period = t("du {from} au {to}", { from: formatDateFr(from), to: formatDateFr(to) });

  return (
    <div>
      <ModuleHeader title={t("Fiche travailleur")} subtitle={`${employeeName(report.employee)} — ${period}`} backHref={`/rapports-travailleurs?from=${from}&to=${to}`} />

      <form className="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> {t("Consulter")}
          </Button>
        </div>
      </form>

      {report && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:grid-cols-10">
            {(
              [
                ["Jours travaillés", report.summary.worked],
                ["Repos travaillés", report.summary.restWorked],
                ["Heures sup.", report.summary.overtime],
                ["Absences", report.summary.absent],
                ["Maladie", report.summary.sick],
                ["Total congés", report.summary.leaveAccrued],
                ["Congés pris", report.summary.leave],
                ["Congé restant", report.summary.leaveBalance],
                ["Récupérations prises", report.summary.recovery],
                ["Récupération restante", report.summary.recoveryBalance],
              ] as const
            ).map(([label, value]) => (
              <Card key={label}>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">{t(label)}</div>
                  <div className="text-2xl font-semibold">{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {t("Fiche — {name}", { name: employeeName(report.employee) })} · {t(POSITION_LABELS[report.employee.position])} · {t(TEAM_LABELS[report.employee.team_type])} · {t("NB")} {report.employee.order_number} · {t("Matricule")} {report.employee.matricule}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <h3 className="mb-2 font-medium">{t("Pointages ({count})", { count: report.attendance.length })}</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead>{t("Statut")}</TableHead>
                    <TableHead>{t("Entrée")}</TableHead>
                    <TableHead>{t("Sortie")}</TableHead>
                    <TableHead>{t("HS")}</TableHead>
                    <TableHead>{t("Observation")}</TableHead>
                    <TableHead>{t("Saisi le")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.attendance.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        {t("Aucun pointage sur la période.")}
                      </TableCell>
                    </TableRow>
                  )}
                  {report.attendance.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link href={`/pointage/${a.team_type}?date=${a.activity_date}`} className="hover:underline">
                          {formatDateFr(a.activity_date)}
                        </Link>
                        {a.shift > 1 && (
                          <Badge variant="outline" className="ms-1">
                            {t("service {n}", { n: a.shift })}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{t(ATTENDANCE_STATUS_LABELS[a.status as AttendanceStatus])}</TableCell>
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
                <CardTitle>{t("Congés ({count})", { count: report.leaves.length })}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {report.leaves.length === 0 ? (
                  <p className="text-muted-foreground">{t("Aucune demande sur la période.")}</p>
                ) : (
                  <ul className="space-y-1">
                    {report.leaves.map((l) => (
                      <li key={l.id} className="flex justify-between">
                        <span>
                          {formatDateFr(l.start_date)} → {formatDateFr(l.end_date)} ({l.days} {t("j")})
                        </span>
                        <Badge variant={l.status === "acceptee" ? "default" : l.status === "refusee" ? "destructive" : "secondary"}>{t(LEAVE_STATUS_LABELS[l.status])}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Lieux de travail ({count})", { count: report.cleaningPlaces.length + report.collections.length })}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {report.cleaningPlaces.length + report.collections.length === 0 ? (
                  <p className="text-muted-foreground">{t("Aucun rapport journalier sur la période.")}</p>
                ) : (
                  <ul className="space-y-1">
                    {report.cleaningPlaces.map((c) => (
                      <li key={c.id}>
                        <Link href={`/rapport-journalier/nettoiement?date=${c.activity_date}`} className="hover:underline">
                          {formatDateFr(c.activity_date)}
                        </Link>{" "}
                        — {t("Nettoiement")} : {c.location || t("lieu non précisé")} {c.comment && <span className="text-muted-foreground">({c.comment})</span>}
                      </li>
                    ))}
                    {report.collections.map((c) => (
                      <li key={c.id}>
                        <Link href={`/rapport-journalier/collecte/${c.id}`} className="hover:underline">
                          {formatDateFr(c.activity_date)}
                        </Link>{" "}
                        — {t("Collecte camion {matricule}", { matricule: c.truck?.matricule ?? "" })} : {c.sectors || t("secteurs non précisés")}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Interventions réalisées ({count})", { count: report.tasks.length })}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {report.tasks.length === 0 ? (
                  <p className="text-muted-foreground">{t("Aucune tâche sur la période.")}</p>
                ) : (
                  <ul className="space-y-1">
                    {report.tasks.map((task) => (
                      <li key={task.id} className="flex justify-between gap-2">
                        <span>
                          <Link href={`/programme/${task.id}`} className="hover:underline">
                            {formatDateFr(task.planned_date)}
                          </Link>{" "}
                          — {task.location || task.description}
                        </span>
                        <Badge variant={task.status === "realisee" ? "default" : "secondary"}>{t(TASK_STATUS_LABELS[task.status])}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {user.permissions.avertissements.can_view && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("Avertissements ({count})", { count: report.warnings.length })}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  {report.warnings.length === 0 ? (
                    <p className="text-muted-foreground">{t("Aucun avertissement sur la période.")}</p>
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
                          <Badge variant="outline">{t(WARNING_STATUS_LABELS[w.status])}</Badge>
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
              <CardTitle>{t("Photos avant / après ({count})", { count: report.photos.length })}</CardTitle>
            </CardHeader>
            <CardContent>
              <PhotoGallery
                photos={report.photos.map((p) => ({
                  id: p.id,
                  url: p.url,
                  caption: `${formatDateFr(p.activity_date)} · ${t(PHOTO_PHASE_LABELS[p.phase as PhotoPhase] ?? p.phase)}${p.location ? ` · ${p.location}` : ""}`,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <ModuleButtons pdfSlot={<PdfExportButton kind="travailleur" params={{ employe: report.employee.id, from, to }} />} />
    </div>
  );
}
