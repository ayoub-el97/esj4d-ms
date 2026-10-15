"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator, Pencil, Plus, Trash2 } from "lucide-react";
import { computeCleaningSummary, deleteCleaningSummaryRow, saveCleaningSummaryRow } from "@/lib/actions/reports";
import type { CleaningSummaryRow } from "@/lib/data/reports";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

const FIELDS: { key: keyof CleaningSummaryRow; label: string }[] = [
  { key: "planned_headcount", label: "Effectif prévu" },
  { key: "active_count", label: "Agents actifs" },
  { key: "sick_count", label: "Malades" },
  { key: "paid_leave_count", label: "Congés payés" },
  { key: "absent_count", label: "Absents" },
  { key: "holiday_count", label: "Jours fériés" },
  { key: "rest_count", label: "Repos" },
  { key: "total_count", label: "Total" },
];

export function CleaningSummaryUI({ date, rows, canEdit }: { date: string; rows: CleaningSummaryRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CleaningSummaryRow | "new" | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Nettoiement — tableau récapitulatif</CardTitle>
        {canEdit && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await computeCleaningSummary(date);
                  if (r.ok) {
                    toast.success(r.message);
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              <Calculator /> Calculer depuis le pointage
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
              <Plus /> Ajouter une ligne
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zone / effectif</TableHead>
              <TableHead>Durée de travail</TableHead>
              {FIELDS.map((f) => (
                <TableHead key={f.key} className="text-right">
                  {f.label}
                </TableHead>
              ))}
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  Aucune ligne. Utilisez « Calculer depuis le pointage » ou ajoutez une ligne.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.zone || "—"}</TableCell>
                <TableCell>{r.work_duration}</TableCell>
                {FIELDS.map((f) => (
                  <TableCell key={f.key} className="text-right">
                    {String(r[f.key])}
                  </TableCell>
                ))}
                {canEdit && (
                  <TableCell className="whitespace-nowrap">
                    <Button variant="ghost" size="icon-xs" onClick={() => setEditing(r)} aria-label="Modifier">
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Supprimer"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const res = await deleteCleaningSummaryRow(r.id);
                          if (res.ok) {
                            toast.success(res.message);
                            router.refresh();
                          } else toast.error(res.error);
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {editing && <SummaryRowDialog date={date} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function SummaryRowDialog({ date, row, onClose }: { date: string; row: CleaningSummaryRow | null; onClose: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof saveCleaningSummaryRow>> | null, fd: FormData) => {
    const r = await saveCleaningSummaryRow(prev, fd);
    if (r.ok) {
      toast.success(r.message);
      router.refresh();
      onClose();
    }
    return r;
  }, null);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? "Modifier la ligne" : "Nouvelle ligne"}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={row?.id ?? ""} />
          <input type="hidden" name="activity_date" value={date} />
          <ActionMessage state={state} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="zone">Zone / effectif</Label>
              <Input id="zone" name="zone" defaultValue={row?.zone ?? ""} placeholder="Ex. Zone Nord" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="work_duration">Durée de travail</Label>
              <Input id="work_duration" name="work_duration" defaultValue={row?.work_duration ?? ""} placeholder="Ex. 8h" />
            </div>
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input id={f.key} name={f.key} type="number" min="0" defaultValue={row ? String(row[f.key]) : "0"} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <SubmitButton>Enregistrer</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
