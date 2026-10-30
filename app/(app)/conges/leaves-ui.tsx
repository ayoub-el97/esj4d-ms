"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CalendarPlus, Check, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { addLeaveAdjustment, createLeaveRequest, createRecoveryRequest, decideLeaveRequest, decideRecoveryRequest, deleteLeaveRequest, previewLeaveRequest, updateLeaveRequest } from "@/lib/actions/leaves";
import type { LeaveSegment } from "@/lib/leave-segments";
import { formatDateFr } from "@/lib/dates";
import { LEAVE_STATUS_LABELS, leaveStatusLabel, type LeaveStatus } from "@/lib/module-types";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <CalendarPlus /> {t("Nouvelle demande de congé")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Fenêtre centrée : largeur ~576 px sur ordinateur, écran entier moins les marges sur téléphone ;
            en-tête fixe, contenu défilant si la fenêtre est trop haute */}
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="border-b px-4 py-3 pe-12">
            <DialogTitle>{t("Nouvelle demande de congé")}</DialogTitle>
            <DialogDescription>{t("Le solde n'est réduit que par les jours de congé effectivement pris (pointage « Congé », ou demande acceptée pour un jour passé non pointé).")}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {/* Formulaire remonté à chaque ouverture : champs vides */}
            {open && <LeaveRequestFields employees={employees} defaultEmployee={defaultEmployee} onSaved={() => setOpen(false)} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Valeurs d'une demande existante (modification). */
export type EditableLeave = { id: string; employee_id: string; request_date: string; start_date: string; end_date: string; requested_days: number; reason: string };

/** « Modifier » : même formulaire que la création, enregistré sur la même demande. */
export function EditLeaveRequestButton({ request, employees }: { request: EditableLeave; employees: Option[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil /> {t("Modifier")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-full flex-col gap-0 overflow-hidden p-0 text-start whitespace-normal sm:max-w-xl">
          <DialogHeader className="border-b px-4 py-3 pe-12">
            <DialogTitle>{t("Modifier la demande de congé")}</DialogTitle>
            <DialogDescription>{t("La demande existante est mise à jour (aucun doublon) ; le solde et le pointage sont recalculés.")}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{open && <LeaveRequestFields employees={employees} request={request} onSaved={() => setOpen(false)} />}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** « Supprimer » : confirmation avec l'employé et les dates ; demande automatique : sort du pointage à choisir. */
export function DeleteLeaveRequestButton({ request }: { request: { id: string; name: string; start_date: string; end_date: string; status: LeaveStatus; source?: string | null } }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [fate, setFate] = useState("");
  const [pending, start] = useTransition();
  const fromPointage = request.source === "pointage" && request.status === "acceptee";
  const dates = request.start_date === request.end_date ? formatDateFr(request.start_date) : t("du {from} au {to}", { from: formatDateFr(request.start_date), to: formatDateFr(request.end_date) });
  const fates: [string, string][] = [
    ["absent", "Corriger le pointage : Absent (le jour est rendu au solde)"],
    ["present", "Corriger le pointage : Présent, heures à compléter (le jour est rendu au solde)"],
    ["repos", "Corriger le pointage : Repos (le jour est rendu au solde)"],
    ["garder", "Garder « Congé » au pointage (le jour reste déduit du solde)"],
  ];
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
        <Trash2 /> {t("Supprimer")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="text-start whitespace-normal">
          <DialogHeader>
            <DialogTitle>{t("Supprimer la demande de congé")}</DialogTitle>
            <DialogDescription>{t("Voulez-vous vraiment supprimer cette demande de congé ? Cette action supprimera la demande sélectionnée.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="rounded-lg border bg-muted/40 p-3">
              <span className="font-semibold">{request.name}</span> — {dates}
              <span className="mt-0.5 block text-xs text-muted-foreground">{t(leaveStatusLabel(request.status, request.source))}</span>
            </p>
            {request.status === "acceptee" && !fromPointage && <p className="text-xs text-muted-foreground">{t("Le congé sera retiré du pointage (statut d'origine restauré) et les jours seront rendus au solde.")}</p>}
            {fromPointage && (
              <fieldset className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                <legend className="px-1 text-xs font-semibold">{t("Attention : le pointage de cette date contient toujours le statut « Congé ».")}</legend>
                {fates.map(([value, label]) => (
                  <label key={value} className="flex items-start gap-2 text-xs">
                    <input type="radio" name="fate" value={value} checked={fate === value} onChange={() => setFate(value)} className="mt-0.5 size-4" />
                    <span>{t(label)}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <div className="space-y-1">
              <Label htmlFor={`del-reason-${request.id}`}>{t("Motif (facultatif)")}</Label>
              <Input id={`del-reason-${request.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("Annuler")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || (fromPointage && !fate)}
              onClick={() =>
                start(async () => {
                  const r = await deleteLeaveRequest(request.id, reason, fromPointage ? fate : undefined);
                  if (r.ok) {
                    toast.success(r.message, { duration: 7000 });
                    setOpen(false);
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              {t("Confirmer la suppression")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LeaveRequestFields({ employees, defaultEmployee, request, onSaved }: { employees: Option[]; defaultEmployee?: string; request?: EditableLeave; onSaved: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(request ? updateLeaveRequest : createLeaveRequest, null);
  const [employee, setEmployee] = useState(request?.employee_id ?? defaultEmployee ?? "");
  const [start, setStart] = useState(request?.start_date ?? "");
  const [end, setEnd] = useState(request?.end_date ?? "");
  const [days, setDays] = useState(request ? String(request.requested_days) : "");
  // Aperçu : jours de repos exclus, périodes de congé, total déduit
  const [preview, setPreview] = useState<{ key: string; segments: LeaveSegment[]; restDays: string[]; total: number; restUnknown: boolean; calendarDays: number } | null>(null);
  const previewKey = employee && start && end && end >= start ? `${employee}|${start}|${end}` : "";
  useEffect(() => {
    if (!previewKey) return;
    let live = true;
    const [emp, s, e] = previewKey.split("|");
    previewLeaveRequest(emp, s, e).then((r) => {
      if (live && r.ok && r.data) setPreview({ key: previewKey, ...r.data });
    });
    return () => {
      live = false;
    };
  }, [previewKey]);
  const shown = preview && preview.key === previewKey ? preview : null;
  const computed = shown ? shown.total : daysBetween(start, end);
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      router.refresh();
      onSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
        <form action={action} className="space-y-4">
          {request && <input type="hidden" name="id" value={request.id} />}
          <ActionMessage state={state} />
          <div className="space-y-1">
            <Label htmlFor="employee_id">{t("Employé")}</Label>
            <NativeSelect id="employee_id" name="employee_id" value={employee} onChange={(e) => setEmployee(e.target.value)} required>
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
            <Input id="request_date" name="request_date" type="date" defaultValue={request?.request_date ?? todayISO()} required />
          </div>
          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">{t("Période")}</legend>
            <div className="space-y-1">
              <Label htmlFor="start_date">{t("Du")}</Label>
              <Input id="start_date" name="start_date" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end_date">{t("Au")}</Label>
              <Input id="end_date" name="end_date" type="date" required value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </fieldset>
          {shown && (
            <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-xs">
              <p>
                {t("Période demandée : du {from} au {to} ({count} jour(s))", { from: formatDateFr(start), to: formatDateFr(end), count: shown.calendarDays })}
              </p>
              {shown.restDays.length > 0 && (
                <p className="text-indigo-800 dark:text-indigo-300">
                  {t("Jours de repos exclus : {days}", { days: shown.restDays.map((d) => formatDateFr(d)).join(", ") })}
                </p>
              )}
              <p>
                {t("Périodes de congé :")}{" "}
                {shown.segments.length
                  ? shown.segments.map((s) => (s.from === s.to ? formatDateFr(s.from) : t("du {from} au {to}", { from: formatDateFr(s.from), to: formatDateFr(s.to) })) + ` (${s.days} ${t("j")})`).join(" ; ")
                  : t("aucune (uniquement des jours de repos)")}
              </p>
              <p className="font-semibold">{t("Total déduit du solde : {count} jour(s)", { count: shown.total })}</p>
              {shown.restUnknown && (
                <label className="mt-1 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <input type="checkbox" name="confirm_rest_unknown" className="mt-0.5 size-4" required />
                  <span>{t("Jour de repos de l'employé non défini : aucun jour n'est exclu. Je confirme la demande telle quelle.")}</span>
                </label>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="requested_days">{t("Nombre de jours demandés")}</Label>
              <Input id="requested_days" name="requested_days" type="number" step="0.5" min="0.5" required value={days || (computed ? String(computed) : "")} onChange={(e) => setDays(e.target.value)} />
            </div>
            {!request && (
              <div className="space-y-1">
                <Label htmlFor="status">{t("Statut")}</Label>
                <StatusSelect />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="reason">{t("Commentaire (facultatif)")}</Label>
            <Textarea id="reason" name="reason" rows={2} defaultValue={request?.reason ?? ""} />
          </div>
          {request ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={onSaved}>
                {t("Annuler")}
              </Button>
              <SubmitButton className="h-11 sm:h-9">{t("Enregistrer")}</SubmitButton>
            </div>
          ) : (
            <SubmitButton className="h-11 w-full sm:h-9">{t("Enregistrer la demande")}</SubmitButton>
          )}
        </form>
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
export function StatusBadge({ status, source }: { status: LeaveStatus; source?: string | null }) {
  const { t } = useT();
  const variant = status === "acceptee" ? "default" : status === "refusee" ? "destructive" : status === "annulee" ? "outline" : "secondary";
  return <Badge variant={variant} className="h-auto whitespace-normal">{t(leaveStatusLabel(status, source))}</Badge>;
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
      {kind === "conge" && status === "acceptee" && (
        <Button
          size="icon-sm"
          variant="outline"
          title={t("Annuler la demande")}
          aria-label={t("Annuler la demande")}
          disabled={pending}
          onClick={() => {
            const reason = window.prompt(t("Motif de l'annulation (obligatoire) — le congé sera retiré du pointage, la demande reste dans l'historique :"));
            if (reason && reason.trim()) run(() => decide(id, "annulee", reason));
          }}
        >
          <Ban />
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
