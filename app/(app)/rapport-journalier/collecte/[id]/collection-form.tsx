"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { dayFunctionLabel } from "@/lib/day-function";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, Save, Sunrise, Sun, Trash2 } from "lucide-react";
import { deleteCollectionReport, resetCollectionToAttendance, saveCollectionReport } from "@/lib/actions/reports";
import { COLLECTION_STATUS_LABELS, COLLECTION_STATUS_STYLES } from "@/lib/collection-status";
import type { Employee, Truck } from "@/lib/data/employees";
import type { CollectionReportFull } from "@/lib/data/reports";
import { useT } from "@/lib/i18n/client";
import { POSITION_LABELS, type Position } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { PhotoUploader } from "@/components/photo-uploader";

export function CollectionForm({ report, canEdit, trucks, drivers, crewOptions }: { report: CollectionReportFull; canEdit: boolean; trucks: Truck[]; drivers: Employee[]; crewOptions: Employee[] }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(saveCollectionReport, null);
  const [pending, start] = useTransition();
  const [crew, setCrew] = useState<Set<string>>(() => new Set(report.rippers.map((r) => r.id)));
  // Liste proposée : équipe actuelle + tous les employés actifs (quelle que soit leur fonction habituelle)
  const crewList: (Employee & { day_position?: Position | null })[] = [...report.rippers, ...crewOptions.filter((e) => !report.rippers.some((r) => r.id === e.id))];

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="space-y-4">
      {/* Statut et éléments manquants */}
      <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm", report.status === "termine" ? "bg-emerald-50/60 dark:bg-emerald-950/20" : "bg-card")}>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", COLLECTION_STATUS_STYLES[report.status])}>{t(COLLECTION_STATUS_LABELS[report.status])}</span>
        {report.day_closed ? (
          <span className="text-muted-foreground">{t("Journée clôturée : rapport en lecture seule. Un administrateur peut rouvrir la journée (Clôturer la journée).")}</span>
        ) : report.missing.length ? (
          <span className="text-muted-foreground">{t("À compléter : {items}. Le rapport reste modifiable jusqu'à la clôture de la journée.", { items: report.missing.map((m) => t(m)).join(", ") })}</span>
        ) : (
          <span className="text-muted-foreground">{t("Rapport complet. Il reste modifiable jusqu'à la clôture de la journée.")}</span>
        )}
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={report.id} />
        <fieldset disabled={!canEdit} className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("Camion et équipe")}</CardTitle>
              <CardDescription>
                {report.manual_team ? t("Corrigés dans ce rapport : le pointage ne les modifie plus.") : t("Repris du pointage du jour ; vous pouvez les corriger ici.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="truck_id">{t("Camion (matricule)")}</Label>
                  <NativeSelect id="truck_id" name="truck_id" defaultValue={report.truck_id} required>
                    {[...(report.truck && !trucks.some((x) => x.id === report.truck_id) ? [report.truck] : []), ...trucks].map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {tr.matricule} {tr.brand && `— ${tr.brand}`}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="chauffeur_id">{t("Chauffeur")}</Label>
                  <NativeSelect id="chauffeur_id" name="chauffeur_id" defaultValue={report.chauffeur_id ?? ""}>
                    <option value="">{t("— Aucun —")}</option>
                    {[...(report.chauffeur && !drivers.some((x) => x.id === report.chauffeur_id) ? [report.chauffeur] : []), ...drivers].map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.last_name} {c.first_name} ({t(POSITION_LABELS[c.position])})
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t("Équipe du jour ({count})", { count: crew.size })}</Label>
                {Array.from(crew).map((id) => (
                  <input key={id} type="hidden" name="rippers" value={id} />
                ))}
                <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
                  {crewList.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        className="size-4 accent-indigo-600"
                        checked={crew.has(e.id)}
                        onChange={(ev) =>
                          setCrew((prev) => {
                            const next = new Set(prev);
                            if (ev.target.checked) next.add(e.id);
                            else next.delete(e.id);
                            return next;
                          })
                        }
                      />
                      <span>
                        {e.last_name} {e.first_name}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({e.day_position && e.day_position !== e.position ? dayFunctionLabel(t, e.day_position, e.position) : t(POSITION_LABELS[e.position])})
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  <Link href={`/pointage/collecte?date=${report.activity_date}`} className="underline">
                    {t("Ouvrir la feuille de présence")}
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("Lieux et observations")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="sectors">{t("Lieux / secteurs de collecte")}</Label>
                <Textarea id="sectors" name="sectors" defaultValue={report.sectors} rows={4} placeholder={t("Ex. Secteur 1 : avenue …, quartier …")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="observations">{t("Observations / notes")}</Label>
                <Textarea id="observations" name="observations" defaultValue={report.observations} rows={3} />
              </div>
            </CardContent>
          </Card>
        </fieldset>
        <ActionMessage state={state && !state.ok ? state : null} />
        {canEdit && (
          <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-3 shadow-md backdrop-blur lg:bottom-4">
            <SubmitButton>
              <Save /> {t("Enregistrer")}
            </SubmitButton>
            {report.manual_team && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  window.confirm(t("Reprendre le camion, le chauffeur et l'équipe du pointage ? Vos corrections d'équipe seront remplacées (lieux, observations et photos conservés).")) &&
                  start(async () => {
                    const r = await resetCollectionToAttendance(report.id);
                    if (r.ok) {
                      toast.success(r.message);
                      router.refresh();
                    } else toast.error(r.error);
                  })
                }
              >
                <RotateCcw /> {t("Reprendre l'équipe du pointage")}
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              className="ms-auto"
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sunrise className="size-5 text-amber-600" /> {t("Photos Avant")}
            </CardTitle>
            <CardDescription>{t("À prendre au début de la collecte (vers 6 h). Vous pouvez en ajouter plus tard.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoUploader entityType="collection_report" entityId={report.id} phase="avant" activityDate={report.activity_date} employeeId={report.chauffeur_id} location={report.sectors} photos={report.photosAvant} canEdit={canEdit} title="Photos Avant" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sun className="size-5 text-emerald-600" /> {t("Photos Après")}
            </CardTitle>
            <CardDescription>{t("À prendre à la fin de la collecte (vers 10 h). Les photos AVANT déjà enregistrées sont conservées.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoUploader entityType="collection_report" entityId={report.id} phase="apres" activityDate={report.activity_date} employeeId={report.chauffeur_id} location={report.sectors} photos={report.photosApres} canEdit={canEdit} title="Photos Après" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
