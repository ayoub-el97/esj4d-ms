"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw, Trash2 } from "lucide-react";
import { completeTask, deleteTask, reopenTask, saveTask } from "@/lib/actions/tasks";
import type { WorkTask } from "@/lib/data/tasks";
import { formatDateTimeFr } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

export function TaskForm({ task, defaultDate, employees, canEdit }: { task: WorkTask | null; defaultDate: string; employees: { id: string; label: string }[]; canEdit: boolean }) {
  const [state, action] = useActionState(saveTask, null);
  const [pending, start] = useTransition();
  const selected = new Set(task?.agents.map((a) => a.id) ?? []);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={task?.id ?? ""} />
      <Card>
        <CardHeader>
          <CardTitle>{task ? "Tâche" : "Nouvelle tâche"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ActionMessage state={state} />
          <fieldset disabled={!canEdit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="planned_date">Date prévue</Label>
              <Input id="planned_date" name="planned_date" type="date" defaultValue={task?.planned_date ?? defaultDate} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="location">Lieu</Label>
              <Input id="location" name="location" defaultValue={task?.location ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" defaultValue={task?.description ?? ""} rows={3} required />
            </div>
            <div className="space-y-1">
              <Label>Agents affectés</Label>
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
          {canEdit && (
            <div className="flex gap-2">
              <SubmitButton className="flex-1">{task ? "Enregistrer" : "Créer la tâche"}</SubmitButton>
              {task && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm("Supprimer cette tâche et ses photos ?")) return;
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
  const router = useRouter();
  const [comments, setComments] = useState(task.comments);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
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
        <CardTitle>Après le travail</CardTitle>
        <CardDescription>
          {task.status === "realisee" ? `Réalisée le ${formatDateTimeFr(task.completed_at)}` : "Ajoutez les photos après, vos commentaires, puis marquez la tâche comme réalisée."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="comments">Commentaires</Label>
          <Textarea id="comments" value={comments} disabled={!canEdit} onChange={(e) => setComments(e.target.value)} rows={3} />
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {task.status === "planifiee" ? (
              <Button disabled={pending} onClick={() => run(() => completeTask(task.id, comments))}>
                <CheckCircle2 /> Marquer comme réalisée
              </Button>
            ) : (
              <>
                <Button variant="outline" disabled={pending} onClick={() => run(() => completeTask(task.id, comments))}>
                  Enregistrer les commentaires
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => run(() => reopenTask(task.id))}>
                  <RotateCcw /> Remettre en planifiée
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
