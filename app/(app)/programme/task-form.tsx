"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw, Trash2 } from "lucide-react";
import { completeTask, deleteTask, reopenTask, saveTask } from "@/lib/actions/tasks";
import type { WorkTask } from "@/lib/data/tasks";
import { formatDateTimeFr } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import type { ActionResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { PendingPhotosPicker, uploadPendingPhotos, type PendingPhoto } from "@/components/pending-photos";

export function TaskForm({ task, defaultDate, employees, canEdit }: { task: WorkTask | null; defaultDate: string; employees: { id: string; label: string }[]; canEdit: boolean }) {
  const { t } = useT();
  const router = useRouter();
  // Photos « avant » choisies à la création : envoyées juste après l'enregistrement de la tâche
  const [newPhotos, setNewPhotos] = useState<PendingPhoto[]>([]);
  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof saveTask>> | null, formData: FormData) => {
    const r = await saveTask(prev, formData);
    if (task || !r.ok || !r.data) return r;
    const id = r.data.id;
    const failed = await uploadPendingPhotos(newPhotos, {
      entityType: "work_task",
      entityId: id,
      phase: "avant",
      activityDate: String(formData.get("planned_date") ?? "") || null,
      employeeId: String(formData.getAll("agents")[0] ?? "") || null,
      location: String(formData.get("location") ?? ""),
    });
    if (failed) toast.error(t("{count} photo(s) non envoyée(s) : ajoutez-les à nouveau sur la fiche.", { count: failed }));
    else if (newPhotos.length) toast.success(t("{count} photo(s) enregistrée(s).", { count: newPhotos.length }));
    router.push(`/programme/${id}`);
    return r;
  }, null);
  const [pending, start] = useTransition();
  const selected = new Set(task?.agents.map((a) => a.id) ?? []);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={task?.id ?? ""} />
      <Card>
        <CardHeader>
          <CardTitle>{task ? t("Tâche") : t("Nouvelle tâche")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ActionMessage state={state} />
          <fieldset disabled={!canEdit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="planned_date">{t("Date prévue")}</Label>
              <Input id="planned_date" name="planned_date" type="date" defaultValue={task?.planned_date ?? defaultDate} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="location">{t("Lieu")}</Label>
              <Input id="location" name="location" defaultValue={task?.location ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">{t("Description")}</Label>
              <Textarea id="description" name="description" defaultValue={task?.description ?? ""} rows={3} required />
            </div>
            <div className="space-y-1">
              <Label>{t("Agents affectés")}</Label>
              <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border p-2">
                {employees.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="agents" value={e.id} defaultChecked={selected.has(e.id)} className="size-4 accent-indigo-600" />
                    {e.label}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
          {!task && canEdit && <PendingPhotosPicker photos={newPhotos} onChange={setNewPhotos} title="Photo de l'endroit avant" />}
          {canEdit && (
            <div className="flex gap-2">
              <SubmitButton className="flex-1">{task ? t("Enregistrer") : t("Créer la tâche")}</SubmitButton>
              {task && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  aria-label={t("Supprimer")}
                  onClick={() => {
                    if (!window.confirm(t("Supprimer cette tâche et ses photos ?"))) return;
                    start(async () => {
                      const r = await deleteTask(task.id);
                      if (r && !r.ok) toast.error(r.error);
                    });
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </form>
  );
}

export function CompleteTaskPanel({ task, canEdit }: { task: WorkTask; canEdit: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [comments, setComments] = useState(task.comments);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Après le travail")}</CardTitle>
        <CardDescription>
          {task.status === "realisee" ? t("Réalisée le {date}", { date: formatDateTimeFr(task.completed_at) }) : t("Ajoutez les photos après, vos commentaires, puis marquez la tâche comme réalisée.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="comments">{t("Commentaires")}</Label>
          <Textarea id="comments" value={comments} disabled={!canEdit} onChange={(e) => setComments(e.target.value)} rows={3} />
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {task.status === "planifiee" ? (
              <Button disabled={pending} onClick={() => run(() => completeTask(task.id, comments))}>
                <CheckCircle2 /> {t("Marquer comme réalisée")}
              </Button>
            ) : (
              <>
                <Button variant="outline" disabled={pending} onClick={() => run(() => completeTask(task.id, comments))}>
                  {t("Enregistrer les commentaires")}
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => run(() => reopenTask(task.id))}>
                  <RotateCcw /> {t("Remettre en planifiée")}
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
