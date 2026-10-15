import { Suspense } from "react";
import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getDaySummary, getRecentWorkDays, getWorkDay } from "@/lib/data/attendance";
import { formatDateFr, formatDateLongFr, formatDateTimeFr, isISODate, todayISO } from "@/lib/dates";
import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { DayStatusBadge } from "@/components/day-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CloseDayPanel } from "./close-day-panel";

export const metadata = { title: "Clôturer la journée" };

export default async function CloturePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireModule("cloture");
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const [workDay, summary, recent] = await Promise.all([getWorkDay(date), getDaySummary(date), getRecentWorkDays()]);
  const closed = workDay?.status === "closed";

  return (
    <div>
      <ModuleHeader title="Clôturer la journée" subtitle={formatDateLongFr(date)}>
        <Suspense>
          <DateField value={date} max={todayISO()} />
        </Suspense>
        <DayStatusBadge workDay={workDay} />
      </ModuleHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Résumé de la journée du {formatDateFr(date)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {(["nettoiement", "collecte"] as const).map((team) => {
              const s = summary.attendance[team];
              const total = Object.values(s).reduce((a, b) => a + b, 0);
              return (
                <div key={team}>
                  <div className="mb-1 flex items-center justify-between font-medium">
                    <span>Pointage {team}</span>
                    {total === 0 ? <Badge variant="outline">non pointé</Badge> : <Badge variant="secondary">{total} ligne(s)</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {Object.entries(s).map(([k, v]) => (
                      <span key={k} className="rounded border px-1.5 py-0.5">
                        {ATTENDANCE_STATUS_LABELS[k as AttendanceStatus]} : {v}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {summary.total === 0 && (
              <p className="text-muted-foreground">Aucune donnée de pointage pour cette date. Vous pouvez tout de même clôturer la journée.</p>
            )}
            {closed && workDay && (
              <div className="rounded-lg bg-muted p-3 text-xs">
                <div>Clôturée le {formatDateTimeFr(workDay.closed_at)}</div>
                {workDay.reopened_at && (
                  <div className="mt-1">
                    Dernière réouverture le {formatDateTimeFr(workDay.reopened_at)} — motif : « {workDay.reopen_reason} »
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <CloseDayPanel date={date} closed={closed} canClose={user.permissions.cloture.can_edit} canReopen={user.role === "admin"} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Journées récentes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Clôturée le</TableHead>
                <TableHead>Réouverture</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Aucune journée clôturée pour le moment.
                  </TableCell>
                </TableRow>
              )}
              {recent.map((d) => (
                <TableRow key={d.activity_date}>
                  <TableCell>
                    <Link href={`/cloture?date=${d.activity_date}`} className="font-medium hover:underline">
                      {formatDateFr(d.activity_date)}
                    </Link>
                  </TableCell>
                  <TableCell>{d.status === "closed" ? <Badge variant="destructive">Clôturée</Badge> : <Badge variant="secondary">Rouverte</Badge>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTimeFr(d.closed_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d.reopened_at ? `${formatDateTimeFr(d.reopened_at)} — ${d.reopen_reason}` : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ModuleButtons />
    </div>
  );
}
