"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { deletePhotosOfEntity } from "@/lib/actions/photos";
import type { ActionResult } from "@/lib/types";

const schema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  planned_date: z.string().date("Date prévue invalide."),
  location: z.string().trim().max(200).default(""),
  description: z.string().trim().min(3, "Décrivez la tâche."),
  agents: z.array(z.string().uuid()).default([]),
});

/** Enregistre une tâche. À la création, renvoie l'id pour que le formulaire envoie ensuite les photos choisies. */
export async function saveTask(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const auth = await assertModule("programme", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = schema.safeParse({
    id: formData.get("id") ?? undefined,
    planned_date: formData.get("planned_date"),
    location: formData.get("location") ?? "",
    description: formData.get("description"),
    agents: formData.getAll("agents"),
  });
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, agents, ...values } = parsed.data;
  const supabase = await createClient();

  let taskId = id;
  if (taskId) {
    const { error } = await supabase.from("work_tasks").update(values).eq("id", taskId);
    if (error) return { ok: false, error: t(friendlyError(error.message)) };
  } else {
    const { data, error } = await supabase.from("work_tasks").insert(values).select("id").single();
    if (error) return { ok: false, error: t(friendlyError(error.message)) };
    taskId = data.id;
  }
  await supabase.from("work_task_agents").delete().eq("task_id", taskId);
  if (agents.length) {
    const { error } = await supabase.from("work_task_agents").insert(agents.map((employee_id) => ({ task_id: taskId, employee_id })));
    if (error) return { ok: false, error: t(friendlyError(error.message)) };
  }
  revalidatePath("/programme");
  return { ok: true, message: t("Tâche enregistrée."), data: id ? undefined : { id: taskId! } };
}

export async function completeTask(id: string, comments: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("programme", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("work_tasks").update({ status: "realisee", completed_at: new Date().toISOString(), comments: comments.slice(0, 2000) }).eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/programme");
  return { ok: true, message: t("Tâche marquée comme réalisée.") };
}

export async function reopenTask(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("programme", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("work_tasks").update({ status: "planifiee", completed_at: null }).eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/programme");
  return { ok: true, message: t("Tâche remise en planifiée.") };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("programme", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { data: row } = await supabase.from("work_tasks").select("planned_date").eq("id", id).maybeSingle();
  const { error } = await supabase.from("work_tasks").delete().eq("id", id);
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  await deletePhotosOfEntity("work_task", id);
  revalidatePath("/programme");
  redirect(`/programme?date=${row?.planned_date ?? ""}`);
}
