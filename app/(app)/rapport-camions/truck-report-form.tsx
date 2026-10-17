"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteTruckReport, saveTruckReport } from "@/lib/actions/reports";
import type { Employee, Truck } from "@/lib/data/employees";
import type { TruckDailyReport } from "@/lib/data/reports";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { LinkButton } from "@/components/link-button";

export function TruckReportForm({
  report,
  defaultDate,
  trucks,
  chauffeurs,
  canEdit,
}: {
  report: TruckDailyReport | null;
  defaultDate: string;
  trucks: Truck[];
  chauffeurs: Employee[];
  canEdit: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(saveTruckReport, null);
  const [pending, start] = useTransition();

  return (
    <form action={action}>
      <input type="hidden" name="id" value={report?.id ?? ""} />
      <Card>
        <CardHeader>
          <CardTitle>{report ? t("Modifier la ligne camion") : t("Nouvelle ligne camion")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionMessage state={state} />
          <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="activity_date">{t("Date d'activité")}</Label>
              <Input id="activity_date" name="activity_date" type="date" defaultValue={report?.activity_date ?? defaultDate} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="truck_id">{t("Camion (matricule)")}</Label>
              <NativeSelect id="truck_id" name="truck_id" defaultValue={report?.truck_id ?? trucks[0]?.id ?? ""} required>
                {trucks.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.matricule} {tr.brand && `— ${tr.brand}`}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="chauffeur_id">{t("Chauffeur")}</Label>
              <NativeSelect id="chauffeur_id" name="chauffeur_id" defaultValue={report?.chauffeur_id ?? ""}>
                <option value="">{t("— Aucun —")}</option>
                {chauffeurs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.last_name} {c.first_name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rippers_count">{t("Nombre de rippeurs")}</Label>
              <Input id="rippers_count" name="rippers_count" type="number" min="0" defaultValue={report?.rippers_count ?? 0} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ticket1">{t("N° ticket")}</Label>
              <Input id="ticket1" name="ticket1" defaultValue={report?.ticket1 ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tonnage1">{t("Tonnage (t)")}</Label>
              <Input id="tonnage1" name="tonnage1" type="number" step="0.01" min="0" defaultValue={report?.tonnage1 ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ticket2">{t("2e ticket")}</Label>
              <Input id="ticket2" name="ticket2" defaultValue={report?.ticket2 ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tonnage2">{t("2e tonnage (t)")}</Label>
              <Input id="tonnage2" name="tonnage2" type="number" step="0.01" min="0" defaultValue={report?.tonnage2 ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dumps_count">{t("Nombre de vidages")}</Label>
              <Input id="dumps_count" name="dumps_count" type="number" min="0" defaultValue={report?.dumps_count ?? 0} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="km">{t("Kilométrage")}</Label>
              <Input id="km" name="km" type="number" step="0.1" min="0" defaultValue={report?.km ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fuel">{t("Carburant (L)")}</Label>
              <Input id="fuel" name="fuel" type="number" step="0.01" min="0" defaultValue={report?.fuel ?? ""} />
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-4">
              <Label htmlFor="observations">{t("Observations")}</Label>
              <Textarea id="observations" name="observations" defaultValue={report?.observations ?? ""} />
            </div>
          </fieldset>
          {canEdit && (
            <div className="flex gap-2">
              <SubmitButton>{t("Enregistrer")}</SubmitButton>
              <LinkButton href="/rapport-camions" variant="outline">
                {t("Annuler")}
              </LinkButton>
              {report && (
                <Button
                  type="button"
                  variant="destructive"
                  className="ms-auto"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(t("Supprimer cette ligne ?"))) return;
                    start(async () => {
                      const r = await deleteTruckReport(report.id);
                      if (r.ok) {
                        toast.success(r.message);
                        router.push("/rapport-camions");
                      } else toast.error(r.error);
                    });
                  }}
                >
                  <Trash2 /> {t("Supprimer")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </form>
  );
}
