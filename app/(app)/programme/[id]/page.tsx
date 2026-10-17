import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { getTask } from "@/lib/data/tasks";
import { TASK_STATUS_LABELS } from "@/lib/module-types";
import { formatDateLongFr } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { PhotoUploader } from "@/components/photo-uploader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompleteTaskPanel, TaskForm } from "../task-form";

export const generateMetadata = pageTitle("Tâche");

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("programme"), getI18n()]);
  const { id } = await params;
  const [task, employees] = await Promise.all([getTask(id), getEmployees()]);
  if (!task) notFound();
  const canEdit = user.permissions.programme.can_edit;
  const firstAgent = task.agents[0]?.id ?? null;

  return (
    <div>
      <ModuleHeader title={t("Tâche — {location}", { location: task.location || t("sans lieu") })} subtitle={formatDateLongFr(task.planned_date, locale)} backHref={`/programme?date=${task.planned_date}`}>
        <Badge variant={task.status === "realisee" ? "default" : "secondary"}>{t(TASK_STATUS_LABELS[task.status])}</Badge>
      </ModuleHeader>
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <TaskForm
          task={task}
          defaultDate={task.planned_date}
          employees={employees.filter((e) => e.is_active || task.agents.some((a) => a.id === e.id)).map((e) => ({ id: e.id, label: employeeName(e) }))}
          canEdit={canEdit}
        />
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("Avant l'intervention")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PhotoUploader entityType="work_task" entityId={task.id} phase="avant" activityDate={task.planned_date} employeeId={firstAgent} location={task.location} photos={task.photosAvant} canEdit={canEdit} title="Photo de l'endroit avant" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Photos après")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PhotoUploader entityType="work_task" entityId={task.id} phase="apres" activityDate={task.planned_date} employeeId={firstAgent} location={task.location} photos={task.photosApres} canEdit={canEdit} />
            </CardContent>
          </Card>
          <CompleteTaskPanel task={task} canEdit={canEdit} />
        </div>
      </div>
      <ModuleButtons pdfSlot={<PdfExportButton kind="programme" params={{ date: task.planned_date, id: task.id }} />} historyHref="/programme/historique" />
    </div>
  );
}
