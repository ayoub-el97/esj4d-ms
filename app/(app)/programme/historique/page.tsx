import Link from "next/link";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { agentNames, getTasks, TASK_STATUS_LABELS } from "@/lib/data/tasks";
import { formatDateFr } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Historique — Programme de travail" };

export default async function ProgrammeHistoriquePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string }> }) {
  await requireModule("programme");
  const sp = await searchParams;
  const tasks = await getTasks(sp);
  const pdfParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v) pdfParams[k] = v;

  return (
    <div>
      <ModuleHeader title="Historique des tâches" subtitle={`${tasks.length} tâche(s)`} backHref="/programme" />
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="from">Du</Label>
          <Input id="from" name="from" type="date" defaultValue={sp.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Au</Label>
          <Input id="to" name="to" type="date" defaultValue={sp.to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">Statut</Label>
          <NativeSelect id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">Tous</option>
            <option value="planifiee">Planifiée</option>
            <option value="realisee">Réalisée</option>
          </NativeSelect>
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> Filtrer
          </Button>
        </div>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date prévue</TableHead>
              <TableHead>Lieu</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Agents</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Photos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Aucune tâche.
                </TableCell>
              </TableRow>
            )}
            {tasks.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <Link href={`/programme/${t.id}`} className="font-medium hover:underline">
                    {formatDateFr(t.planned_date)}
                  </Link>
                </TableCell>
                <TableCell>{t.location || "—"}</TableCell>
                <TableCell className="max-w-64 truncate">{t.description}</TableCell>
                <TableCell className="max-w-48 truncate">{agentNames(t)}</TableCell>
                <TableCell>
                  <Badge variant={t.status === "realisee" ? "default" : "secondary"}>{TASK_STATUS_LABELS[t.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">{t.photosAvant.length + t.photosApres.length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ModuleButtons pdfSlot={tasks.length ? <PdfExportButton kind="programme" params={pdfParams} /> : undefined} />
    </div>
  );
}
