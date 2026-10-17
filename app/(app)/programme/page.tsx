import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { agentNames, getTasks } from "@/lib/data/tasks";
import { TASK_STATUS_LABELS } from "@/lib/module-types";
import { formatDateLongFr, isISODate, todayISO } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { PhotoStatusBadge } from "@/components/photo-status-badge";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskForm } from "./task-form";

export const generateMetadata = pageTitle("Programme de travail");

export default async function ProgrammePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("programme"), getI18n()]);
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const [tasks, employees] = await Promise.all([getTasks({ date }), getEmployees({ onlyActive: true })]);
  const canEdit = user.permissions.programme.can_edit;

  return (
    <div>
      <ModuleHeader title={t("Programme de travail")} subtitle={formatDateLongFr(date, locale)}>
        <Suspense>
          <DateField value={date} label="Date prévue" />
        </Suspense>
      </ModuleHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {tasks.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("Aucune tâche prévue pour cette date.")}</p>}
          {tasks.map((task) => (
            <Link key={task.id} href={`/programme/${task.id}`} className="block">
              <Card className="transition hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {task.status === "realisee" ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Clock className="size-4 text-amber-600" />}
                    {task.location || t("Lieu non précisé")}
                    <Badge variant={task.status === "realisee" ? "default" : "secondary"} className="ms-auto">
                      {t(TASK_STATUS_LABELS[task.status])}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>{task.description}</p>
                  <p className="text-muted-foreground">
                    {t("Agents")} : {agentNames(task) || "—"}
                  </p>
                  <PhotoStatusBadge before={task.photosAvant.length} after={task.photosApres.length} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        {canEdit && <TaskForm task={null} defaultDate={date} employees={employees.map((e) => ({ id: e.id, label: employeeName(e) }))} canEdit />}
      </div>

      <ModuleButtons pdfSlot={tasks.length ? <PdfExportButton kind="programme" params={{ date }} /> : undefined} historyHref="/programme/historique" />
    </div>
  );
}
