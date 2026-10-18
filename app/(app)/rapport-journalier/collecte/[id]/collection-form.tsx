"use client";

import { useActionState, useTransition, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteCollectionReport, saveCollectionReport } from "@/lib/actions/reports";
import type { CollectionReportFull } from "@/lib/data/reports";
import { useT } from "@/lib/i18n/client";
import Link from "next/link";
import { POSITION_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { PhotoUploader } from "@/components/photo-uploader";
import { LoadsEditor } from "@/components/loads-editor";

export function CollectionForm({ report, canEdit }: { report: CollectionReportFull; canEdit: boolean }) {
  const { t } = useT();
  const tr0 = report.truckReport;
  const [kmStart, setKmStart] = useState(tr0?.km_start != null ? String(tr0.km_start) : "");
  const [kmEnd, setKmEnd] = useState(tr0?.km_end != null ? String(tr0.km_end) : "");
  const [state, action] = useActionState(saveCollectionReport, null);
  const [pending, start] = useTransition();
  const tr = report.truckReport;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={report.id} />
        <fieldset disabled={!canEdit} className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("Équipe du camion {matricule}", { matricule: report.truck?.matricule ?? "" })}</CardTitle>
              <CardDescription>{t("Reprise du pointage du jour.")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input type="hidden" name="chauffeur_id" value={report.chauffeur_id ?? ""} />
              {report.rippers.map((r) => (
                <input key={r.id} type="hidden" name="rippers" value={r.id} />
              ))}
              <div className="space-y-1">
                <Label>{t("Chauffeur")}</Label>
                <p className="rounded-lg border bg-muted/40 px-2.5 py-1.5 text-sm">
                  {report.chauffeur ? `${report.chauffeur.last_name} ${report.chauffeur.first_name} (${t(POSITION_LABELS[report.chauffeur.position])})` : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <Label>{t("Équipe du jour")}</Label>
                <ul className="space-y-0.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-sm">
                  {report.rippers.length === 0 && <li className="text-muted-foreground">—</li>}
                  {report.rippers.map((e) => (
                    <li key={e.id}>
                      {e.last_name} {e.first_name} <span className="text-xs text-muted-foreground">({t(POSITION_LABELS[e.position])})</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  {t("Le chauffeur, l'équipe et le camion viennent du pointage. Pour un absent, un malade ou un échange de camion, corrigez la feuille de présence : le rapport se met à jour à l'enregistrement.")}{" "}
                  <Link href={`/pointage/collecte?date=${report.activity_date}`} className="underline">
                    {t("Ouvrir la feuille de présence")}
                  </Link>
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sectors">{t("Lieux / secteurs de travail")}</Label>
                <Textarea id="sectors" name="sectors" defaultValue={report.sectors} placeholder={t("Ex. Secteur 1 : avenue …, quartier …")} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("Données camion (alimente le rapport camions)")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <p className="col-span-2 text-xs text-muted-foreground">{t("Poste du matin. Pour le travail du soir de ce camion, ajoutez une ligne « Soir » dans le rapport camions.")}</p>
              <div className="col-span-2">
                <LoadsEditor initial={tr?.loads ?? []} canEdit={canEdit} isAdmin={false} initialOverride={tr?.dumps_override ?? false} initialDumps={tr?.dumps_count ?? 0} />
              </div>
              <div className="space-y-1">
                <Label>{t("Nombre de rippeurs")}</Label>
                <Input value={report.rippers.length} disabled />
              </div>
              <div className="space-y-1">
                <Label htmlFor="km_start">{t("Km départ")}</Label>
                <Input id="km_start" name="km_start" type="number" step="0.1" min="0" inputMode="decimal" value={kmStart} onChange={(e) => setKmStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="km_end">{t("Km fin")}</Label>
                <Input id="km_end" name="km_end" type="number" step="0.1" min="0" inputMode="decimal" value={kmEnd} onChange={(e) => setKmEnd(e.target.value)} />
                {kmStart !== "" && kmEnd !== "" && (
                  <p className={Number(kmEnd) < Number(kmStart) ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {Number(kmEnd) < Number(kmStart) ? t("Le km de fin doit être supérieur ou égal au km de départ.") : t("Km parcourus : {km}", { km: (Number(kmEnd) - Number(kmStart)).toFixed(1) })}
                  </p>
                )}
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="observations">{t("Observations / commentaires")}</Label>
                <Textarea id="observations" name="observations" defaultValue={report.observations} />
              </div>
            </CardContent>
          </Card>
        </fieldset>
        <ActionMessage state={state} />
        {canEdit && (
          <div className="flex gap-2">
            <SubmitButton>{t("Enregistrer le rapport")}</SubmitButton>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(t("Supprimer ce rapport de collecte et ses photos ?"))) return;
                start(async () => {
                  const r = await deleteCollectionReport(report.id);
                  if (r && !r.ok) toast.error(r.error);
                });
              }}
            >
              <Trash2 /> {t("Supprimer")}
            </Button>
          </div>
        )}
      </form>

      <Card>
        <CardHeader>
          <CardTitle>{t("Photos")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <PhotoUploader entityType="collection_report" entityId={report.id} phase="avant" activityDate={report.activity_date} employeeId={report.chauffeur_id} location={report.sectors} photos={report.photosAvant} canEdit={canEdit} />
          <PhotoUploader entityType="collection_report" entityId={report.id} phase="apres" activityDate={report.activity_date} employeeId={report.chauffeur_id} location={report.sectors} photos={report.photosApres} canEdit={canEdit} />
        </CardContent>
      </Card>
    </div>
  );
}
