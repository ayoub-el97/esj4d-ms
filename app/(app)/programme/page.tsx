import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { agentNames, getTasks } from "@/lib/data/tasks";
import { formatDateLongFr, isISODate, todayISO } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { DateField } from "@/components/date-field";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskForm } from "./task-form";

export const metadata = { title: "Programme de travail" };

export default async function ProgrammePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireModule("programme");
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const [tasks, employees] = await Promise.all([getTasks({ date }), getEmployees({ onlyActive: true })]);
  const canEdit = user.permissions.programme.can_edit;

  return (
    <div>
      <ModuleHeader title="Programme de travail" subtitle={formatDateLongFr(date)}>
        <Suspense>
          <DateField value={date} label="Date prévue" />
        </Suspense>
      </ModuleHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {tasks.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aucune tâche prévue pour cette date.</p>}
          {tasks.map((t) => (
            <Link key={t.id} href={`/programme/${t.id}`} className="block">
              <Card className="transition hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {t.status === "realisee" ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Clock className="size-4 text-amber-600" />}
                    {t.location || "Lieu non précisé"}
                    <Badge variant={t.status === "realisee" ? "default" : "secondary"} className="ml-auto">
                      {t.status === "realisee" ? "Réalisée" : "Planifiée"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>{t.description}</p>
                  <p className="text-muted-foreground">Agents : {agentNames(t) || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.photosAvant.length} photo(s) avant · {t.photosApres.length} photo(s) après
                  </p>
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
