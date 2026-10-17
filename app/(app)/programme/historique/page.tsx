import Link from "next/link";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { agentNames, getTasks } from "@/lib/data/tasks";
import { TASK_STATUS_LABELS } from "@/lib/module-types";
import { formatDateFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const generateMetadata = pageTitle("Historique des tâches");

export default async function ProgrammeHistoriquePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string }> }) {
  const [, t] = await Promise.all([requireModule("programme"), getT()]);
  const sp = await searchParams;
  const tasks = await getTasks(sp);
  const pdfParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v) pdfParams[k] = v;

  return (
    <div>
      <ModuleHeader title={t("Historique des tâches")} subtitle={t("{count} tâche(s)", { count: tasks.length })} backHref="/programme" />
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={sp.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={sp.to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">{t("Statut")}</Label>
          <NativeSelect id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">{t("Tous")}</option>
            <option value="planifiee">{t("Planifiée")}</option>
            <option value="realisee">{t("Réalisée")}</option>
          </NativeSelect>
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> {t("Filtrer")}
          </Button>
        </div>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Date prévue")}</TableHead>
              <TableHead>{t("Lieu")}</TableHead>
              <TableHead>{t("Description")}</TableHead>
              <TableHead>{t("Agents")}</TableHead>
              <TableHead>{t("Statut")}</TableHead>
              <TableHead className="text-end">{t("Photos")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t("Aucune tâche.")}
                </TableCell>
              </TableRow>
            )}
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell>
                  <Link href={`/programme/${task.id}`} className="font-medium hover:underline">
                    {formatDateFr(task.planned_date)}
                  </Link>
                </TableCell>
                <TableCell>{task.location || "—"}</TableCell>
                <TableCell className="max-w-64 truncate">{task.description}</TableCell>
                <TableCell className="max-w-48 truncate">{agentNames(task)}</TableCell>
                <TableCell>
                  <Badge variant={task.status === "realisee" ? "default" : "secondary"}>{t(TASK_STATUS_LABELS[task.status])}</Badge>
                </TableCell>
                <TableCell className="text-end">{task.photosAvant.length + task.photosApres.length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ModuleButtons pdfSlot={tasks.length ? <PdfExportButton kind="programme" params={pdfParams} /> : undefined} />
    </div>
  );
}
