"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Moon, Sun, Trash2 } from "lucide-react";
import { deleteTruckReport, saveTruckReport } from "@/lib/actions/reports";
import type { Employee, Truck } from "@/lib/data/employees";
import type { TruckDailyReport, TruckShift } from "@/lib/data/reports";
import { useT } from "@/lib/i18n/client";
import type { PhotoItem } from "@/lib/photo-types";
import { cn } from "@/lib/utils";
import { formatDateFr } from "@/lib/dates";
import { useUnsavedChanges } from "@/lib/use-unsaved";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { LinkButton } from "@/components/link-button";
import { LoadsEditor } from "@/components/loads-editor";
import { PhotoUploader } from "@/components/photo-uploader";
import { PendingPhotosPicker, uploadPendingPhotos, type PendingPhoto } from "@/components/pending-photos";

export function TruckReportForm({
  report,
  photos = [],
  defaultDate,
  defaultTruck,
  defaultShift = "matin",
  trucks,
  chauffeurs,
  canEdit,
  isAdmin = false,
}: {
  report: TruckDailyReport | null;
  photos?: PhotoItem[];
  defaultDate: string;
  defaultTruck?: string;
  defaultShift?: TruckShift;
  trucks: Truck[];
  chauffeurs: Employee[];
  canEdit: boolean;
  isAdmin?: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [shift, setShift] = useState<TruckShift>(report?.shift ?? defaultShift);
  const [kmStart, setKmStart] = useState(report?.km_start != null ? String(report.km_start) : "");
  const [kmEnd, setKmEnd] = useState(report?.km_end != null ? String(report.km_end) : "");
  const [newPhotos, setNewPhotos] = useState<PendingPhoto[]>([]);
  const unsaved = useUnsavedChanges();

  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof saveTruckReport>> | null, formData: FormData) => {
    const r = await saveTruckReport(prev, formData);
    if (!r.ok || !r.data) return r;
    unsaved.clear();
    if (report) {
      toast.success(r.message);
      router.refresh();
      return r;
    }
    // Création : envoi des photos choisies, puis retour au rapport du jour
    const failed = await uploadPendingPhotos(newPhotos, { entityType: "truck_report", entityId: r.data.id, phase: "justificatif", activityDate: r.data.date });
    if (failed) toast.error(t("{count} photo(s) non envoyée(s) : ajoutez-les à nouveau sur la fiche.", { count: failed }));
    else toast.success(newPhotos.length ? t("Ligne camion enregistrée avec {count} photo(s).", { count: newPhotos.length }) : r.message);
    router.push(`/rapport-camions?date=${r.data.date}&ok=1`);
    return r;
  }, null);

  return (
    <form action={action} onChange={unsaved.markDirty}>
      <input type="hidden" name="id" value={report?.id ?? ""} />
      <input type="hidden" name="shift" value={shift} />
      <Card>
        <CardHeader>
          <CardTitle>{report ? t("Modifier la ligne camion") : t("Nouvelle ligne camion")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <ActionMessage state={state && !state.ok ? state : null} />
          <fieldset disabled={!canEdit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="activity_date">{t("Date d'activité")}</Label>
                {report ? (
                  // Rapport existant : la date d'origine est conservée (correction sur la même ligne)
                  <>
                    <input type="hidden" name="activity_date" value={report.activity_date} />
                    <Input id="activity_date" value={formatDateFr(report.activity_date)} readOnly disabled />
                  </>
                ) : (
                  <Input id="activity_date" name="activity_date" type="date" defaultValue={defaultDate} required />
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="truck_id">{t("Camion (matricule)")}</Label>
                <NativeSelect id="truck_id" name="truck_id" defaultValue={report?.truck_id ?? defaultTruck ?? trucks[0]?.id ?? ""} required>
                  {trucks.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.matricule} {tr.brand && `— ${tr.brand}`}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>{t("Poste")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["matin", "soir"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={shift === s}
                      onClick={() => {
                        setShift(s);
                        if (s !== shift) unsaved.markDirty();
                      }}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition sm:py-1.5",
                        shift === s
                          ? s === "matin"
                            ? "border-amber-300 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                            : "border-indigo-300 bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                          : "bg-background text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {s === "matin" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                      {s === "matin" ? t("Matin") : t("Soir")}
                    </button>
                  ))}
                </div>
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
                <Label htmlFor="rippers_count">{t("Équipe : nombre de rippeurs")}</Label>
                <Input id="rippers_count" name="rippers_count" type="number" min="0" defaultValue={report?.rippers_count ?? 0} />
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
            </div>

            <LoadsEditor initial={report?.loads ?? []} canEdit={canEdit} isAdmin={isAdmin} initialOverride={report?.dumps_override ?? false} initialDumps={report?.dumps_count ?? 0} />

            <div className="space-y-1">
              <Label htmlFor="observations">{t("Observations")}</Label>
              <Textarea id="observations" name="observations" defaultValue={report?.observations ?? ""} />
            </div>
          </fieldset>

          {report ? (
            <PhotoUploader entityType="truck_report" entityId={report.id} phase="justificatif" activityDate={report.activity_date} photos={photos} canEdit={canEdit} title="Photos de la ligne" />
          ) : (
            canEdit && <PendingPhotosPicker photos={newPhotos} onChange={setNewPhotos} title="Photos de la ligne" />
          )}

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <SubmitButton>{report ? t("Enregistrer les modifications") : t("Enregistrer")}</SubmitButton>
              <LinkButton
                href={`/rapport-camions${report ? `?date=${report.activity_date}` : ""}`}
                variant="outline"
                onClick={(e) => {
                  if (unsaved.dirty && !window.confirm(t("Des modifications ne sont pas enregistrées. Quitter sans enregistrer ?"))) e.preventDefault();
                }}
              >
                {t("Annuler")}
              </LinkButton>
              {report && (
                <Button
                  type="button"
                  variant="destructive"
                  className="ms-auto"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(t("Supprimer cette ligne et ses photos ?"))) return;
                    start(async () => {
                      const r = await deleteTruckReport(report.id);
                      if (r.ok) {
                        toast.success(r.message);
                        router.push(`/rapport-camions?date=${report.activity_date}`);
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
