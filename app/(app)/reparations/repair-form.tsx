"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { saveRepair } from "@/lib/actions/repairs";
import type { Truck } from "@/lib/data/employees";
import type { Repair } from "@/lib/data/repairs";
import { useT } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/money";
import type { PhotoPhase } from "@/lib/photo-types";
import { REPAIR_PHOTO_GROUPS, REPAIR_STATUSES, REPAIR_STATUS_LABELS, REPAIR_STATUS_STYLES, isActualExpense, type RepairStatus } from "@/lib/repair-types";
import { cn } from "@/lib/utils";
import { daysInclusive } from "@/lib/downtime";
import { formatDateFr } from "@/lib/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { LinkButton } from "@/components/link-button";
import { PhotoUploader } from "@/components/photo-uploader";
import { PendingPhotosPicker, uploadPendingPhotos, type PendingPhoto } from "@/components/pending-photos";

type Pending = Record<PhotoPhase, PendingPhoto[]>;
const EMPTY: Pending = { vehicule: [], avant: [], apres: [], justificatif: [], materiel: [], document: [] };

export function RepairForm({ repair, trucks, defaultTruck, defaultDate, canEdit, today }: { repair: Repair | null; trucks: Truck[]; defaultTruck?: string; defaultDate: string; canEdit: boolean; today: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(EMPTY);
  const [status, setStatus] = useState<RepairStatus>(repair?.status ?? "en_attente");
  const [cost, setCost] = useState(repair?.cost != null ? String(repair.cost) : "");
  const [repairDate, setRepairDate] = useState(repair?.repair_date ?? "");
  const [cancelledExpense, setCancelledExpense] = useState(repair?.cancelled_expense ?? false);
  const [outOfService, setOutOfService] = useState(repair ? !!repair.out_of_service_since : true);
  const [since, setSince] = useState(repair?.out_of_service_since ?? defaultDate);
  const wasRepaired = repair?.status === "repare";
  // Jours hors service : jours calendaires, jour d'immobilisation et jour de remise en service inclus
  const liveDays = !outOfService || !since || status === "annule" ? null : status === "repare" ? (repairDate ? daysInclusive(since, repairDate) : null) : since > today ? 0 : daysInclusive(since, today);
  const counted = isActualExpense({ status, cost: cost === "" ? null : Number(cost), repair_date: repairDate || null, cancelled_expense: cancelledExpense });

  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof saveRepair>> | null, formData: FormData) => {
    const r = await saveRepair(prev, formData);
    if (!r.ok || !r.data) return r;
    if (repair) {
      toast.success(r.message);
      router.refresh();
      return r;
    }
    // Création : envoi des photos choisies, catégorie par catégorie
    const id = r.data.id;
    let failed = 0;
    let sent = 0;
    for (const g of REPAIR_PHOTO_GROUPS) {
      const list = pending[g.phase];
      if (!list.length) continue;
      failed += await uploadPendingPhotos(list, { entityType: "truck_repair", entityId: id, phase: g.phase, activityDate: null, location: String(formData.get("problem_location") ?? "") });
      sent += list.length;
    }
    if (failed) toast.error(t("{count} photo(s) non envoyée(s) : ajoutez-les à nouveau sur la fiche.", { count: failed }));
    else if (sent) toast.success(t("{count} photo(s) enregistrée(s).", { count: sent }));
    router.push(`/reparations/${id}?ok=1`);
    return r;
  }, null);

  const photoBlock = (phase: PhotoPhase, title: string) =>
    repair ? (
      <PhotoUploader entityType="truck_repair" entityId={repair.id} phase={phase} activityDate={null} location={repair.problem_location} photos={repair.photos[phase]} canEdit={canEdit} title={title} />
    ) : (
      canEdit && <PendingPhotosPicker photos={pending[phase]} onChange={(list) => setPending((p) => ({ ...p, [phase]: list }))} title={title} />
    );
  const group = (phase: PhotoPhase) => REPAIR_PHOTO_GROUPS.find((g) => g.phase === phase)!.title;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={repair?.id ?? ""} />
      <ActionMessage state={state && !state.ok ? state : null} />

      <Card>
        <CardHeader>
          <CardTitle>{t("1. Camion")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset disabled={!canEdit} className="space-y-1">
            <Label htmlFor="truck_id">{t("Matricule du camion")}</Label>
            <NativeSelect id="truck_id" name="truck_id" defaultValue={repair?.truck_id ?? defaultTruck ?? ""} required>
              <option value="">{t("— Choisir le camion —")}</option>
              {trucks.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.matricule}
                  {tr.brand ? ` — ${tr.brand}` : ""}
                  {tr.model ? ` ${tr.model}` : ""}
                  {!tr.is_active ? ` (${t("inactif")})` : ""}
                </option>
              ))}
            </NativeSelect>
          </fieldset>
          {photoBlock("vehicule", group("vehicule"))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("2. Problème")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="reported_date">{t("Date du problème")}</Label>
              <Input id="reported_date" name="reported_date" type="date" defaultValue={repair?.reported_date ?? defaultDate} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="problem_location">{t("Lieu du problème (facultatif)")}</Label>
              <Input id="problem_location" name="problem_location" defaultValue={repair?.problem_location ?? ""} placeholder={t("Ex. dépôt, avenue Hassan II…")} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="problem_description">{t("Description du problème")}</Label>
              <Textarea id="problem_description" name="problem_description" defaultValue={repair?.problem_description ?? ""} rows={3} required placeholder={t("Ex. fuite d'huile hydraulique au niveau de la benne")} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="notes">{t("Notes complémentaires (facultatif)")}</Label>
              <Textarea id="notes" name="notes" defaultValue={repair?.notes ?? ""} rows={2} />
            </div>
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3 sm:col-span-2">
              <label className="flex items-start gap-2 text-sm font-medium">
                <input type="checkbox" name="out_of_service" checked={outOfService} onChange={(e) => setOutOfService(e.target.checked)} className="mt-0.5 size-4" />
                <span>
                  {t("Le camion est hors service (immobilisé)")}
                  <span className="block text-xs font-normal text-muted-foreground">{t("Décochez si le camion continue de travailler malgré le problème : aucun jour d'immobilisation n'est alors compté.")}</span>
                </span>
              </label>
              {outOfService && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="out_of_service_since">{t("Hors service depuis le")}</Label>
                    <Input id="out_of_service_since" name="out_of_service_since" type="date" value={since} onChange={(e) => setSince(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="expected_return_date">{t("Remise en service prévue le (facultatif)")}</Label>
                    <Input id="expected_return_date" name="expected_return_date" type="date" defaultValue={repair?.expected_return_date ?? ""} min={since || undefined} />
                  </div>
                </div>
              )}
              {liveDays != null && (
                <p className={cn("rounded-md px-3 py-2 text-sm font-semibold", status === "repare" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300")}>
                  {status === "repare"
                    ? t("Durée d'immobilisation finale : {count} jour(s) (du {from} au {to}).", { count: liveDays, from: formatDateFr(since), to: formatDateFr(repairDate) })
                    : t("Hors service depuis {count} jour(s) — compté automatiquement chaque jour jusqu'à la réparation.", { count: liveDays })}
                </p>
              )}
            </div>
          </fieldset>
          {photoBlock("avant", group("avant"))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("3. Réparation")}</CardTitle>
          <CardDescription>{t("À compléter au fur et à mesure : le dossier peut être enregistré « En panne », passer « En réparation », puis « Réparé » à la remise en service.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset disabled={!canEdit} className="space-y-3">
            <div className="space-y-1">
              <Label>{t("Statut de la réparation")}</Label>
              <input type="hidden" name="status" value={status} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {REPAIR_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setStatus(s);
                      if (s === "repare" && !repairDate) setRepairDate(today);
                    }}
                    aria-pressed={status === s}
                    className={cn("rounded-lg border px-3 py-2.5 text-sm font-medium transition sm:py-2", status === s ? cn(REPAIR_STATUS_STYLES[s], "border-transparent ring-2 ring-primary/40") : "bg-background text-muted-foreground hover:bg-muted")}
                  >
                    {t(REPAIR_STATUS_LABELS[s])}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="repair_date">{t("Date de réparation / remise en service (date de la dépense)")}</Label>
                <Input id="repair_date" name="repair_date" type="date" value={repairDate} onChange={(e) => setRepairDate(e.target.value)} required={status === "repare"} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cost">{t("Coût total de la réparation (DH)")}</Label>
                <Input id="cost" name="cost" type="number" step="0.01" min="0" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} required={status === "repare"} />
              </div>
            </div>
            {wasRepaired && (
              <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                <Label htmlFor="correction_reason">{t("Motif de la correction")}</Label>
                <Input id="correction_reason" name="correction_reason" maxLength={500} placeholder={t("Ex. date de remise en service mal saisie")} />
                <p className="text-xs text-muted-foreground">{t("Obligatoire si vous modifiez la date d'immobilisation, la date de remise en service ou le statut de ce dossier déjà réparé. Le motif est conservé dans l'historique.")}</p>
              </div>
            )}
            {status === "annule" && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="cancelled_expense" checked={cancelledExpense} onChange={(e) => setCancelledExpense(e.target.checked)} className="mt-0.5 size-4" />
                <span>
                  {t("Frais engagés malgré l'annulation")}
                  <span className="block text-xs text-muted-foreground">{t("Cochez seulement si une dépense a réellement été payée (ex. diagnostic, dépannage).")}</span>
                </span>
              </label>
            )}
            <p className={cn("rounded-lg px-3 py-2 text-xs", counted ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
              {counted
                ? t("Dépense réelle de {amount}, comptée dans le rapport du mois de la date de réparation.", { amount: formatMoney(Number(cost), t("DH")) })
                : status === "en_attente"
                  ? t("En panne : le coût n'est pas compté dans les dépenses tant que la réparation n'est pas engagée.")
                  : t("Non compté dans les dépenses (indiquez le coût et la date de réparation).")}
            </p>
            <div className="space-y-1">
              <Label htmlFor="repair_description">{t("Description de la réparation / pièces remplacées")}</Label>
              <Textarea id="repair_description" name="repair_description" defaultValue={repair?.repair_description ?? ""} rows={3} placeholder={t("Ex. remplacement du flexible hydraulique et vidange")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="repair_notes">{t("Notes sur la réparation (facultatif)")}</Label>
              <Textarea id="repair_notes" name="repair_notes" defaultValue={repair?.repair_notes ?? ""} rows={2} />
            </div>
          </fieldset>
          {photoBlock("justificatif", group("justificatif"))}
          {photoBlock("apres", group("apres"))}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-3 shadow-md backdrop-blur lg:bottom-4">
          <SubmitButton>
            <Save /> {repair ? t("Enregistrer les modifications") : t("Enregistrer le problème")}
          </SubmitButton>
          <LinkButton href={repair ? `/reparations/camion/${repair.truck_id}` : "/reparations"} variant="outline">
            {repair ? t("Historique du camion") : t("Annuler")}
          </LinkButton>
        </div>
      )}
    </form>
  );
}
