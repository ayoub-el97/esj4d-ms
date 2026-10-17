"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteWarning, saveWarning } from "@/lib/actions/warnings";
import type { Warning } from "@/lib/data/warnings";
import { WARNING_STATUS_LABELS } from "@/lib/module-types";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { LinkButton } from "@/components/link-button";
import { PhotoUploader } from "@/components/photo-uploader";

export function WarningForm({ warning, employees, canEdit, defaultDate }: { warning: Warning | null; employees: { id: string; label: string }[]; canEdit: boolean; defaultDate: string }) {
  const { t } = useT();
  const [state, action] = useActionState(saveWarning, null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <form action={action}>
        <input type="hidden" name="id" value={warning?.id ?? ""} />
        <Card>
          <CardHeader>
            <CardTitle>{warning ? t("Avertissement") : t("Nouvel avertissement")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ActionMessage state={state} />
            <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="employee_id">{t("Employé concerné")}</Label>
                <NativeSelect id="employee_id" name="employee_id" defaultValue={warning?.employee_id ?? ""} required>
                  <option value="">{t("— Choisir —")}</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="incident_date">{t("Date de l'incident")}</Label>
                <Input id="incident_date" name="incident_date" type="date" defaultValue={warning?.incident_date ?? defaultDate} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="status">{t("Statut de suivi")}</Label>
                <NativeSelect id="status" name="status" defaultValue={warning?.status ?? "ouvert"}>
                  {Object.entries(WARNING_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {t(v)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1 sm:col-span-3">
                <Label htmlFor="description">{t("Description de la faute / de l'incident")}</Label>
                <Textarea id="description" name="description" defaultValue={warning?.description ?? ""} required rows={3} />
              </div>
              <div className="space-y-1 sm:col-span-3">
                <Label htmlFor="observations">{t("Observations")}</Label>
                <Textarea id="observations" name="observations" defaultValue={warning?.observations ?? ""} rows={2} />
              </div>
            </fieldset>
            {canEdit && (
              <div className="flex gap-2">
                <SubmitButton>{warning ? t("Enregistrer") : t("Créer l'avertissement")}</SubmitButton>
                <LinkButton href="/avertissements" variant="outline">
                  {t("Retour")}
                </LinkButton>
                {warning && (
                  <Button
                    type="button"
                    variant="destructive"
                    className="ms-auto"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(t("Supprimer cet avertissement et ses photos ?"))) return;
                      start(async () => {
                        const r = await deleteWarning(warning.id);
                        if (r && !r.ok) toast.error(r.error);
                      });
                    }}
                  >
                    <Trash2 /> {t("Supprimer")}
                  </Button>
                )}
              </div>
            )}
            {!warning && <p className="text-xs text-muted-foreground">{t("Les photos justificatives pourront être ajoutées après la création.")}</p>}
          </CardContent>
        </Card>
      </form>

      {warning && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Photos justificatives")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PhotoUploader entityType="warning" entityId={warning.id} phase="justificatif" activityDate={null} employeeId={warning.employee_id} photos={warning.photos} canEdit={canEdit} title="Photos" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
