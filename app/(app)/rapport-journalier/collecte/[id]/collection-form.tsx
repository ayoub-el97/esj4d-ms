"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteCollectionReport, saveCollectionReport } from "@/lib/actions/reports";
import type { Employee } from "@/lib/data/employees";
import type { CollectionReportFull } from "@/lib/data/reports";
import { POSITION_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { PhotoUploader } from "@/components/photo-uploader";

export function CollectionForm({ report, employees, canEdit }: { report: CollectionReportFull; employees: Employee[]; canEdit: boolean }) {
  const [state, action] = useActionState(saveCollectionReport, null);
  const [pending, start] = useTransition();
  const chauffeurs = employees.filter((e) => e.position === "chauffeur");
  const crew = employees.filter((e) => e.position !== "chauffeur" || e.id !== report.chauffeur_id);
  const selected = new Set(report.rippers.map((r) => r.id));
  const tr = report.truckReport;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={report.id} />
        <fieldset disabled={!canEdit} className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Équipe du camion {report.truck?.matricule}</CardTitle>
              <CardDescription>Préremplie depuis les affectations ; modifiable pour cette date uniquement.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="chauffeur_id">Chauffeur</Label>
                <NativeSelect id="chauffeur_id" name="chauffeur_id" defaultValue={report.chauffeur_id ?? ""}>
                  <option value="">— Aucun —</option>
                  {chauffeurs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.last_name} {c.first_name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label>Rippeurs</Label>
                <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
                  {crew.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="rippers" value={e.id} defaultChecked={selected.has(e.id)} className="size-4 accent-indigo-600" />
                      {e.last_name} {e.first_name}
                      <span className="text-xs text-muted-foreground">({POSITION_LABELS[e.position]})</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sectors">Lieux / secteurs de travail</Label>
                <Textarea id="sectors" name="sectors" defaultValue={report.sectors} placeholder="Ex. Secteur 1 : avenue …, quartier …" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Données camion (alimente le rapport camions)</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ticket1">N° ticket</Label>
                <Input id="ticket1" name="ticket1" defaultValue={tr?.ticket1 ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tonnage1">Tonnage (t)</Label>
                <Input id="tonnage1" name="tonnage1" type="number" step="0.01" min="0" defaultValue={tr?.tonnage1 ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ticket2">2e ticket</Label>
                <Input id="ticket2" name="ticket2" defaultValue={tr?.ticket2 ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tonnage2">2e tonnage (t)</Label>
                <Input id="tonnage2" name="tonnage2" type="number" step="0.01" min="0" defaultValue={tr?.tonnage2 ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dumps_count">Nombre de vidages</Label>
                <Input id="dumps_count" name="dumps_count" type="number" min="0" defaultValue={tr?.dumps_count ?? 0} />
              </div>
              <div className="space-y-1">
                <Label>Nombre de rippeurs</Label>
                <Input value={report.rippers.length} disabled />
              </div>
              <div className="space-y-1">
                <Label htmlFor="km">Kilométrage</Label>
                <Input id="km" name="km" type="number" step="0.1" min="0" defaultValue={tr?.km ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fuel">Carburant (L)</Label>
                <Input id="fuel" name="fuel" type="number" step="0.01" min="0" defaultValue={tr?.fuel ?? ""} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="observations">Observations / commentaires</Label>
                <Textarea id="observations" name="observations" defaultValue={report.observations} />
              </div>
            </CardContent>
          </Card>
        </fieldset>
        <ActionMessage state={state} />
        {canEdit && (
          <div className="flex gap-2">
            <SubmitButton>Enregistrer le rapport</SubmitButton>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Supprimer ce rapport de collecte et ses photos ?")) return;
                start(async () => {
                  const r = await deleteCollectionReport(report.id);
                  if (r && !r.ok) toast.error(r.error);
                });
              }}
            >
              <Trash2 /> Supprimer
            </Button>
          </div>
        )}
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <PhotoUploader entityType="collection_report" entityId={report.id} phase="avant" activityDate={report.activity_date} employeeId={report.chauffeur_id} location={report.sectors} photos={report.photosAvant} canEdit={canEdit} />
          <PhotoUploader entityType="collection_report" entityId={report.id} phase="apres" activityDate={report.activity_date} employeeId={report.chauffeur_id} location={report.sectors} photos={report.photosApres} canEdit={canEdit} />
        </CardContent>
      </Card>
    </div>
  );
}
