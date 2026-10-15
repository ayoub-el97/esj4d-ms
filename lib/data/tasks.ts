import "server-only";
import { createClient } from "@/lib/supabase/server";
import { employeeName, getEmployees, type Employee } from "@/lib/data/employees";
import { getPhotosFor } from "@/lib/data/photos";
import type { PhotoItem } from "@/lib/photo-types";
import type { TaskStatus } from "@/lib/module-types";
export { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/module-types";

export type WorkTask = {
  id: string;
  planned_date: string;
  location: string;
  description: string;
  status: TaskStatus;
  completed_at: string | null;
  comments: string;
  created_at: string;
  agents: Employee[];
  photosAvant: PhotoItem[];
  photosApres: PhotoItem[];
};

export type TaskFilters = { date?: string; from?: string; to?: string; status?: string; employee?: string };

export async function getTasks(f: TaskFilters = {}, limit = 300): Promise<WorkTask[]> {
  const supabase = await createClient();
  let q = supabase.from("work_tasks").select("*").order("planned_date", { ascending: false }).order("created_at").limit(limit);
  if (f.date) q = q.eq("planned_date", f.date);
  if (f.from) q = q.gte("planned_date", f.from);
  if (f.to) q = q.lte("planned_date", f.to);
  if (f.status) q = q.eq("status", f.status);
  const [{ data }, employees] = await Promise.all([q, getEmployees()]);
  const rows = data ?? [];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [{ data: agents }, photos] = await Promise.all([supabase.from("work_task_agents").select("task_id, employee_id").in("task_id", ids), getPhotosFor("work_task", ids)]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const result = rows.map((r) => {
    const ph = photos.get(r.id) ?? [];
    return {
      ...r,
      agents: (agents ?? []).filter((a) => a.task_id === r.id).map((a) => byId.get(a.employee_id)).filter((e): e is Employee => !!e),
      photosAvant: ph.filter((p) => p.phase === "avant"),
      photosApres: ph.filter((p) => p.phase === "apres"),
    } as WorkTask;
  });
  return f.employee ? result.filter((t) => t.agents.some((a) => a.id === f.employee)) : result;
}

export async function getTask(id: string): Promise<WorkTask | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("work_tasks").select("planned_date").eq("id", id).maybeSingle();
  if (!data) return null;
  const list = await getTasks({ date: data.planned_date });
  return list.find((t) => t.id === id) ?? null;
}

export function agentNames(task: WorkTask): string {
  return task.agents.map(employeeName).join(", ");
}
