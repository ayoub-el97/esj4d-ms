"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, RotateCcw, Trash2, X } from "lucide-react";
import { addLeaveAdjustment, createLeaveRequest, decideLeaveRequest, deleteLeaveRequest } from "@/lib/actions/leaves";
import type { LeaveRequest } from "@/lib/data/leaves";
import { LEAVE_STATUS_LABELS } from "@/lib/module-types";
import { formatDateFr } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

export function LeaveRequestForm({ employees, defaultEmployee }: { employees: { id: string; label: string }[]; defaultEmployee?: string }) {
  const [state, action] = useActionState(createLeaveRequest, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouvelle demande</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-3">
          <ActionMessage state={state} />
          <div className="space-y-1">
            <Label htmlFor="employee_id">Employé</Label>
            <NativeSelect id="employee_id" name="employee_id" defaultValue={defaultEmployee ?? ""} required>
              <option value="">— Choisir —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="start_date">Du</Label>
              <Input id="start_date" name="start_date" type="date" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end_date">Au</Label>
              <Input id="end_date" name="end_date" type="date" required />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="reason">Motif (facultatif)</Label>
            <Textarea id="reason" name="reason" rows={2} />
          </div>
          <SubmitButton className="w-full">Enregistrer la demande</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: LeaveRequest["status"] }) {
  const variant = status === "acceptee" ? "default" : status === "refusee" ? "destructive" : "secondary";
  return <Badge variant={variant}>{LEAVE_STATUS_LABELS[status]}</Badge>;
}

export function RequestActions({ request, canEdit }: { request: LeaveRequest; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!canEdit) return null;
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <div className="flex justify-end gap-1 whitespace-nowrap">
      {request.status !== "acceptee" && (
        <Button size="icon-sm" variant="default" title="Accepter" disabled={pending} onClick={() => run(() => decideLeaveRequest(request.id, "acceptee"))}>
          <Check />
        </Button>
      )}
      {request.status !== "refusee" && (
        <Button size="icon-sm" variant="destructive" title="Refuser" disabled={pending} onClick={() => run(() => decideLeaveRequest(request.id, "refusee", window.prompt("Motif du refus (facultatif) :") ?? ""))}>
          <X />
        </Button>
      )}
      {request.status !== "en_attente" && (
        <Button size="icon-sm" variant="outline" title="Remettre en attente" disabled={pending} onClick={() => run(() => decideLeaveRequest(request.id, "en_attente"))}>
          <RotateCcw />
        </Button>
      )}
      <Button size="icon-sm" variant="ghost" title="Supprimer" disabled={pending} onClick={() => window.confirm("Supprimer cette demande ?") && run(() => deleteLeaveRequest(request.id))}>
        <Trash2 />
      </Button>
    </div>
  );
}

export function PendingRequests({ requests, canEdit }: { requests: LeaveRequest[]; canEdit: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Demandes en attente ({requests.length})</CardTitle>
        <CardDescription>Une demande acceptée devient un congé pris et réduit le solde.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employé</TableHead>
              <TableHead>Du</TableHead>
              <TableHead>Au</TableHead>
              <TableHead className="text-right">Jours</TableHead>
              <TableHead>Motif</TableHead>
              {canEdit && <TableHead className="text-right">Décision</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Aucune demande en attente.
                </TableCell>
              </TableRow>
            )}
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{formatDateFr(r.start_date)}</TableCell>
                <TableCell>{formatDateFr(r.end_date)}</TableCell>
                <TableCell className="text-right">{r.days}</TableCell>
                <TableCell className="max-w-48 truncate">{r.reason}</TableCell>
                {canEdit && (
                  <TableCell>
                    <RequestActions request={r} canEdit={canEdit} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function AdjustmentForm({ employeeId }: { employeeId: string }) {
  const [state, action] = useActionState(addLeaveAdjustment, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="employee_id" value={employeeId} />
      <ActionMessage state={state} />
      <div className="space-y-1">
        <Label htmlFor="days">Jours (+ / −)</Label>
        <Input id="days" name="days" type="number" step="0.5" placeholder="Ex. 2 ou -1.5" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="adj_reason">Motif (obligatoire)</Label>
        <Input id="adj_reason" name="reason" required />
      </div>
      <SubmitButton variant="outline" className="w-full">
        Ajouter l&apos;ajustement
      </SubmitButton>
    </form>
  );
}
