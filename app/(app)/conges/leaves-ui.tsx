"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, RotateCcw, X } from "lucide-react";
import { addLeaveAdjustment, createLeaveRequest, createRecoveryRequest, decideLeaveRequest, decideRecoveryRequest } from "@/lib/actions/leaves";
import { LEAVE_STATUS_LABELS, type LeaveStatus } from "@/lib/module-types";
import { todayISO } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import { creditLabel, type AvailableCredit } from "@/lib/recovery-credit";
import type { ActionResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

type Option = { id: string; label: string };

function StatusSelect({ name = "status" }: { name?: string }) {
  const { t } = useT();
  return (
    <NativeSelect id={name} name={name} defaultValue="en_attente">
      {(Object.keys(LEAVE_STATUS_LABELS) as LeaveStatus[]).map((s) => (
        <option key={s} value={s}>
          {t(LEAVE_STATUS_LABELS[s])}
        </option>
      ))}
    </NativeSelect>
  );
}

function daysBetween(start: string, end: string): number {
  if (!start || !end || end < start) return 0;
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
}

// ---------------------------------------------------------------------------
// Nouvelle demande congé
// ---------------------------------------------------------------------------
export function LeaveRequestForm({ employees, defaultEmployee }: { employees: Option[]; defaultEmployee?: string }) {
  const { t } = useT();
  const [state, action] = useActionState(createLeaveRequest, null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [days, setDays] = useState("");
  const computed = daysBetween(start, end);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Nouvelle demande congé")}</CardTitle>
        <CardDescription>{t("Le solde n'est réduit que par les jours de congé effectivement pris (pointage « Congé », ou demande acceptée pour un jour passé non pointé).")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-3">
          <ActionMessage state={state} />
          <div className="space-y-1">
            <Label htmlFor="employee_id">{t("Employé")}</Label>
            <NativeSelect id="employee_id" name="employee_id" defaultValue={defaultEmployee ?? ""} required>
              <option value="">{t("— Choisir —")}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="request_date">{t("Date de la demande")}</Label>
            <Input id="request_date" name="request_date" type="date" defaultValue={todayISO()} required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="start_date">{t("Date de début")}</Label>
              <Input id="start_date" name="start_date" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end_date">{t("Date de fin")}</Label>
              <Input id="end_date" name="end_date" type="date" required value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="requested_days">{t("Nombre de jours demandés")}</Label>
              <Input id="requested_days" name="requested_days" type="number" step="0.5" min="0.5" required value={days || (computed ? String(computed) : "")} onChange={(e) => setDays(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="status">{t("Statut")}</Label>
              <StatusSelect />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="reason">{t("Commentaire (facultatif)")}</Label>
            <Textarea id="reason" name="reason" rows={2} />
          </div>
          <SubmitButton className="w-full">{t("Enregistrer la demande")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Nouvelle demande récupération
// ---------------------------------------------------------------------------
export function RecoveryRequestForm({ employees, credits, defaultEmployee }: { employees: Option[]; credits: Record<string, AvailableCredit[]>; defaultEmployee?: string }) {
  const { t } = useT();
  const [state, action] = useActionState(createRecoveryRequest, null);
  const [employee, setEmployee] = useState(defaultEmployee ?? "");
  const [workedDate, setWorkedDate] = useState("");
  const available = useMemo(() => credits[employee] ?? [], [credits, employee]);
  const withCredits = employees.filter((e) => (credits[e.id] ?? []).length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Nouvelle demande récupération")}</CardTitle>
        <CardDescription>{t("Chaque jour de repos travaillé ou jour férié travaillé donne 1 jour de récupération. Un férié doit être demandé avant la fin de son mois, sinon il est payé avec le salaire.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-3">
          <ActionMessage state={state} />
          <div className="space-y-1">
            <Label htmlFor="rec_employee_id">{t("Employé")}</Label>
            <NativeSelect
              id="rec_employee_id"
              name="employee_id"
              value={employee}
              required
              onChange={(e) => {
                setEmployee(e.target.value);
                setWorkedDate("");
              }}
            >
              <option value="">{t("— Choisir —")}</option>
              {withCredits.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label} ({(credits[e.id] ?? []).length})
                </option>
              ))}
            </NativeSelect>
            {withCredits.length === 0 && <p className="text-xs text-muted-foreground">{t("Aucun employé n'a de crédit de récupération disponible.")}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="rec_request_date">{t("Date de la demande")}</Label>
            <Input id="rec_request_date" name="request_date" type="date" defaultValue={todayISO()} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="worked_rest_date">{t("Jour travaillé (crédit)")}</Label>
            <NativeSelect id="worked_rest_date" name="worked_rest_date" value={workedDate} required disabled={!employee} onChange={(e) => setWorkedDate(e.target.value)}>
              <option value="">{t("— Choisir —")}</option>
              {available.map((c) => (
                <option key={c.date} value={c.date}>
                  {creditLabel(c, t)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="recovery_date">{t("Date de récupération demandée")}</Label>
              <Input id="recovery_date" name="recovery_date" type="date" required min={workedDate || undefined} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rec_requested_days">{t("Nombre de jours demandés")}</Label>
              <Input id="rec_requested_days" name="requested_days" type="number" step="0.5" min="0.5" max="1" defaultValue="1" required />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rec_status">{t("Statut")}</Label>
            <StatusSelect name="status" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="comment">{t("Commentaire (facultatif)")}</Label>
            <Textarea id="comment" name="comment" rows={2} />
          </div>
          <SubmitButton className="w-full" disabled={!employee || !workedDate}>
            {t("Enregistrer la demande")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Statut et décision (aucune suppression : historique durable)
// ---------------------------------------------------------------------------
export function StatusBadge({ status }: { status: LeaveStatus }) {
  const { t } = useT();
  const variant = status === "acceptee" ? "default" : status === "refusee" ? "destructive" : "secondary";
  return <Badge variant={variant}>{t(LEAVE_STATUS_LABELS[status])}</Badge>;
}

export function DecisionButtons({ id, status, kind, canEdit }: { id: string; status: LeaveStatus; kind: "conge" | "recuperation"; canEdit: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!canEdit) return null;
  const decide = kind === "conge" ? decideLeaveRequest : decideRecoveryRequest;
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <div className="flex justify-end gap-1 whitespace-nowrap">
      {status !== "acceptee" && (
        <Button size="icon-sm" variant="default" title={t("Accepter")} aria-label={t("Accepter")} disabled={pending} onClick={() => run(() => decide(id, "acceptee", window.prompt(t("Commentaire de décision (facultatif) :")) ?? ""))}>
          <Check />
        </Button>
      )}
      {status !== "refusee" && (
        <Button size="icon-sm" variant="destructive" title={t("Refuser")} aria-label={t("Refuser")} disabled={pending} onClick={() => run(() => decide(id, "refusee", window.prompt(t("Motif du refus (facultatif) :")) ?? ""))}>
          <X />
        </Button>
      )}
      {status !== "en_attente" && (
        <Button size="icon-sm" variant="outline" title={t("Remettre en attente")} aria-label={t("Remettre en attente")} disabled={pending} onClick={() => run(() => decide(id, "en_attente"))}>
          <RotateCcw />
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Correction manuelle de solde (administrateur)
// ---------------------------------------------------------------------------
export function AdjustmentForm({ employeeId, kind }: { employeeId: string; kind: "conge" | "recuperation" }) {
  const { t } = useT();
  const [state, action] = useActionState(addLeaveAdjustment, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="kind" value={kind} />
      <ActionMessage state={state} />
      <div className="grid grid-cols-[100px_1fr] gap-2">
        <div className="space-y-1">
          <Label htmlFor={`days-${kind}`}>{t("Jours (+ / −)")}</Label>
          <Input id={`days-${kind}`} name="days" type="number" step="0.5" placeholder={t("Ex. 2 ou -1.5")} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`reason-${kind}`}>{t("Motif (obligatoire)")}</Label>
          <Input id={`reason-${kind}`} name="reason" required />
        </div>
      </div>
      <SubmitButton variant="outline" className="w-full">
        {t("Ajouter la correction")}
      </SubmitButton>
    </form>
  );
}
