"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Save, Trash2 } from "lucide-react";
import { deleteMedicalCertificate, saveDecision, saveEngagement, saveMedicalCertificate, setAbsenceClassification, setCertificateState } from "@/lib/actions/absences";
import type { AbsenceAction, MedicalCertificate } from "@/lib/data/absences";
import {
  ABSENCE_CLASSES,
  ABSENCE_CLASS_LABELS,
  CERTIFICATE_STATES,
  CERTIFICATE_STATE_LABELS,
  certificateState,
  type CertificateState,
  ENGAGEMENT_STATUSES,
  ENGAGEMENT_STATUS_LABELS,
  type AbsenceClass,
  type AbsenceDay,
} from "@/lib/absence-types";
import { todayISO } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import type { ActionResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

function useRefreshOnSuccess(state: ActionResult | null, after?: () => void) {
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      router.refresh();
      after?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

/** Classement d'un jour d'absence (révision par un utilisateur autorisé, journalisée). */
export function ClassificationEditor({ day }: { day: AbsenceDay }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<AbsenceClass | "">(day.reviewed ? day.classification : "");
  const [comment, setComment] = useState(day.review_comment);
  const fromPointage = day.attendance_status === "absent_maladie" ? "maladie" : "non_justifiee";
  if (!editing)
    return (
      <Button type="button" variant="ghost" size="icon-xs" title={t("Corriger le classement")} onClick={() => setEditing(true)}>
        <Pencil />
      </Button>
    );
  return (
    <div className="mt-1 space-y-1 rounded-md border bg-muted/40 p-2 text-xs">
      <NativeSelect value={value} onChange={(e) => setValue(e.target.value as AbsenceClass | "")} className="h-7 text-xs">
        <option value="">{t("Selon le pointage ({label})", { label: t(ABSENCE_CLASS_LABELS[fromPointage]) })}</option>
        {ABSENCE_CLASSES.map((c) => (
          <option key={c} value={c}>
            {t(ABSENCE_CLASS_LABELS[c])}
          </option>
        ))}
      </NativeSelect>
      <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("Motif de la correction (conservé dans le journal)")} className="h-7 text-xs" />
      <div className="flex gap-1">
        <Button
          type="button"
          size="xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setAbsenceClassification(day.employee_id, day.activity_date, value || null, comment);
              if (r.ok) {
                toast.success(r.message);
                setEditing(false);
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          <Save /> {t("Enregistrer")}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(false)}>
          {t("Annuler")}
        </Button>
      </div>
    </div>
  );
}

/** Ajout ou mise à jour d'un certificat médical (épisode d'un ou plusieurs jours). */
export function CertificateForm({ employeeId, certificate, defaultFrom, defaultTo, onDone }: { employeeId: string; certificate?: MedicalCertificate; defaultFrom?: string; defaultTo?: string; onDone?: () => void }) {
  const { t } = useT();
  const [state, action] = useActionState(saveMedicalCertificate, null);
  useRefreshOnSuccess(state, onDone);
  return (
    <form action={action} className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <input type="hidden" name="id" value={certificate?.id ?? ""} />
      <input type="hidden" name="employee_id" value={employeeId} />
      <ActionMessage state={state && !state.ok ? state : null} />
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>{t("Absence du")}</Label>
          <Input type="date" name="start_date" defaultValue={certificate?.start_date ?? defaultFrom ?? todayISO()} required />
        </div>
        <div className="space-y-1">
          <Label>{t("au")}</Label>
          <Input type="date" name="end_date" defaultValue={certificate?.end_date ?? defaultTo ?? defaultFrom ?? todayISO()} required />
        </div>
        <div className="space-y-1">
          <Label>{t("Date de remise du certificat")}</Label>
          <Input type="date" name="submitted_on" defaultValue={certificate?.submitted_on ?? ""} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>{t("Statut du certificat")}</Label>
          <NativeSelect name="state" defaultValue={certificate ? certificateState(certificate.status, certificate.verification) : "en_attente"}>
            {CERTIFICATE_STATES.map((s) => (
              <option key={s} value={s}>
                {t(CERTIFICATE_STATE_LABELS[s])}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-1">
        <Label>{t("Commentaire (documentation médicale)")}</Label>
        <Textarea name="comment" defaultValue={certificate?.comment ?? ""} rows={2} />
      </div>
      <p className="text-xs text-muted-foreground">{t("Un document ajouté ne justifie pas l'absence automatiquement : choisissez « Certificat validé » après vérification. « Certificat refusé » compte les jours couverts comme absences non justifiées.")}</p>
      <SubmitButton size="sm">
        <Save /> {certificate ? t("Enregistrer les modifications") : t("Enregistrer le certificat")}
      </SubmitButton>
    </form>
  );
}

/** Statut du certificat, modifiable directement (utilisateur autorisé, journalisé). */
export function CertificateStateSelect({ certificate }: { certificate: MedicalCertificate }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = certificateState(certificate.status, certificate.verification);
  return (
    <NativeSelect
      aria-label={t("Statut du certificat")}
      value={current}
      disabled={pending}
      className="h-8 w-auto text-xs"
      onChange={(e) => {
        const next = e.target.value as CertificateState;
        if (next === "refuse" && !window.confirm(t("Refuser ce certificat ? Les jours couverts seront comptés comme absences non justifiées."))) return;
        start(async () => {
          const r = await setCertificateState(certificate.id, next);
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      {CERTIFICATE_STATES.map((s) => (
        <option key={s} value={s}>
          {t(CERTIFICATE_STATE_LABELS[s])}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Absence maladie sans entrée de certificat : création de l'entrée, pour y joindre le document. */
export function CreateCertificateButton({ employeeId, from, to }: { employeeId: string; from: string; to: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("employee_id", employeeId);
          fd.set("start_date", from);
          fd.set("end_date", to);
          const r = await saveMedicalCertificate(null, fd);
          if (r.ok) router.refresh();
          else toast.error(r.error);
        })
      }
    >
      {t("Ajouter le certificat")}
    </Button>
  );
}

export function CertificateActions({ certificate, employeeId }: { certificate: MedicalCertificate; employeeId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <Button type="button" variant="outline" size="xs" onClick={() => setEditing((v) => !v)}>
          <Pencil /> {editing ? t("Fermer") : t("Modifier")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(t("Supprimer ce certificat ? (les dates d'absence et le pointage ne sont pas modifiés)"))) return;
            start(async () => {
              const r = await deleteMedicalCertificate(certificate.id);
              if (r.ok) {
                toast.success(r.message);
                router.refresh();
              } else toast.error(r.error);
            });
          }}
        >
          <Trash2 /> {t("Supprimer")}
        </Button>
      </div>
      {editing && <CertificateForm employeeId={employeeId} certificate={certificate} onDone={() => setEditing(false)} />}
    </div>
  );
}

/** Engagement écrit relatif aux absences : statut et date de signature (jamais « Signé » automatiquement). */
export function EngagementForm({ employeeId, engagement, unjustifiedCount }: { employeeId: string; engagement: AbsenceAction | null; unjustifiedCount: number }) {
  const { t } = useT();
  const [state, action] = useActionState(saveEngagement, null);
  const [status, setStatus] = useState(engagement?.status ?? "a_preparer");
  useRefreshOnSuccess(state);
  return (
    <form action={action} className="space-y-2 text-sm">
      <input type="hidden" name="id" value={engagement?.id ?? ""} />
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="unjustified_count" value={engagement?.unjustified_count ?? unjustifiedCount} />
      <ActionMessage state={state && !state.ok ? state : null} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{t("Statut de l'engagement")}</Label>
          <NativeSelect name="status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {ENGAGEMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(ENGAGEMENT_STATUS_LABELS[s])}
              </option>
            ))}
          </NativeSelect>
        </div>
        {status === "signe" && (
          <div className="space-y-1">
            <Label>{t("Date de signature")}</Label>
            <Input type="date" name="signed_on" defaultValue={engagement?.signed_on ?? todayISO()} required />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Label>{t("Commentaire")}</Label>
        <Textarea name="comment" defaultValue={engagement?.comment ?? ""} rows={2} />
      </div>
      <SubmitButton size="sm">
        <Save /> {t("Enregistrer")}
      </SubmitButton>
    </form>
  );
}

/** Décision du responsable (plus de quatre absences non justifiées). */
export function DecisionForm({ employeeId, unjustifiedCount }: { employeeId: string; unjustifiedCount: number }) {
  const { t } = useT();
  const [state, action] = useActionState(saveDecision, null);
  useRefreshOnSuccess(state);
  return (
    <form action={action} className="space-y-2 text-sm">
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="unjustified_count" value={unjustifiedCount} />
      <ActionMessage state={state && !state.ok ? state : null} />
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <Label>{t("Décision")}</Label>
          <Input name="decision" required placeholder={t("Ex. avertissement écrit, entretien, mise à pied…")} />
        </div>
        <div className="space-y-1">
          <Label>{t("Date de la décision")}</Label>
          <Input type="date" name="decision_date" defaultValue={todayISO()} required />
        </div>
      </div>
      <div className="space-y-1">
        <Label>{t("Commentaire")}</Label>
        <Textarea name="comment" rows={2} />
      </div>
      <p className="text-xs text-muted-foreground">{t("L'application n'applique aucune sanction et ne désactive jamais l'employé : elle enregistre la décision prise par le responsable.")}</p>
      <SubmitButton size="sm">
        <Save /> {t("Enregistrer la décision")}
      </SubmitButton>
    </form>
  );
}
