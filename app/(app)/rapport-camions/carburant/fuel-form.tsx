"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Trash2, X } from "lucide-react";
import { deleteFuelEntry, saveFuelEntry } from "@/lib/actions/fuel";
import { uploadPhotoFile } from "@/lib/photo-upload";
import type { Employee, Truck } from "@/lib/data/employees";
import type { FuelEntry } from "@/lib/data/fuel";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { CameraCaptureButton } from "@/components/camera-capture";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { LinkButton } from "@/components/link-button";

export function FuelForm({
  entry,
  defaultDate,
  trucks,
  drivers,
  canEdit,
}: {
  entry: FuelEntry | null;
  defaultDate: string;
  trucks: Truck[];
  drivers: Employee[];
  canEdit: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  // Photos choisies avant l'enregistrement (création) : envoyées juste après la création du plein
  const [pendingPhotos, setPendingPhotos] = useState<{ key: string; file: File; url: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    setPendingPhotos((prev) => [...prev, ...Array.from(files).map((file) => ({ key: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))]);
  };
  const removePending = (key: string) =>
    setPendingPhotos((prev) => {
      const p = prev.find((x) => x.key === key);
      if (p) URL.revokeObjectURL(p.url);
      return prev.filter((x) => x.key !== key);
    });

  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof saveFuelEntry>> | null, formData: FormData) => {
    const r = await saveFuelEntry(prev, formData);
    if (entry || !r.ok || !r.data) return r;
    // Création réussie : envoi des photos, puis ouverture de la fiche du plein
    const id = r.data.id;
    let failed = 0;
    for (const p of pendingPhotos) {
      try {
        await uploadPhotoFile(p.file, {
          entityType: "fuel_entry",
          entityId: id,
          phase: "justificatif",
          activityDate: String(formData.get("activity_date") ?? "") || null,
          employeeId: String(formData.get("driver_id") ?? "") || null,
          location: String(formData.get("station") ?? ""),
        });
      } catch {
        failed++;
      }
    }
    if (failed) toast.error(t("{count} photo(s) non envoyée(s) : ajoutez-les à nouveau sur la fiche du plein.", { count: failed }));
    else if (pendingPhotos.length) toast.success(t("{count} photo(s) enregistrée(s).", { count: pendingPhotos.length }));
    router.push(`/rapport-camions/carburant/${id}?ok=1`);
    return r;
  }, null);
  const [pending, start] = useTransition();
  const firstTruck = entry?.truck_id ?? trucks[0]?.id ?? "";
  const [truckId, setTruckId] = useState(firstTruck);
  // Chauffeur proposé : celui affecté au camion (modifiable)
  const usualDriver = (id: string) => drivers.find((d) => d.truck_id === id)?.id ?? "";
  const [driverId, setDriverId] = useState(entry ? (entry.driver_id ?? "") : usualDriver(firstTruck));
  const [liters, setLiters] = useState(entry ? String(entry.liters) : "");
  const [cost, setCost] = useState(entry ? String(entry.cost) : "");
  const price = Number(liters) > 0 && cost !== "" ? (Number(cost) / Number(liters)).toFixed(3) : "";

  return (
    <form action={action}>
      <input type="hidden" name="id" value={entry?.id ?? ""} />
      <Card>
        <CardHeader>
          <CardTitle>{entry ? t("Modifier le plein") : t("Nouveau plein")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionMessage state={state} />
          <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="activity_date">{t("Date du plein")}</Label>
              <Input id="activity_date" name="activity_date" type="date" defaultValue={entry?.activity_date ?? defaultDate} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="truck_id">{t("Camion (matricule)")}</Label>
              <NativeSelect
                id="truck_id"
                name="truck_id"
                value={truckId}
                onChange={(e) => {
                  setTruckId(e.target.value);
                  if (!entry) setDriverId(usualDriver(e.target.value));
                }}
                required
              >
                {trucks.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.matricule} {tr.brand && `— ${tr.brand}`}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="driver_id">{t("Chauffeur")}</Label>
              <NativeSelect id="driver_id" name="driver_id" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                <option value="">{t("— Aucun —")}</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.last_name} {d.first_name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="liters">{t("Litres")}</Label>
              <Input id="liters" name="liters" type="number" step="0.01" min="0.01" inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cost">{t("Coût")}</Label>
              <Input id="cost" name="cost" type="number" step="0.01" min="0" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} required />
              {price && <p className="text-xs text-muted-foreground">{t("Prix au litre : {price}", { price })}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="odometer_km">{t("Kilométrage compteur (km)")}</Label>
              <Input id="odometer_km" name="odometer_km" type="number" step="0.1" min="0" inputMode="decimal" defaultValue={entry?.odometer_km ?? ""} required />
              {entry?.previous_km != null && <p className="text-xs text-muted-foreground">{t("Plein précédent : {km} km", { km: entry.previous_km })}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="station">{t("Station (facultatif)")}</Label>
              <Input id="station" name="station" defaultValue={entry?.station ?? ""} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="observations">{t("Observations")}</Label>
              <Textarea id="observations" name="observations" defaultValue={entry?.observations ?? ""} />
            </div>
          </fieldset>
          {!entry && canEdit && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{t("Photos (ticket, compteur, pompe)")}</span>
                <span className="text-xs text-muted-foreground">({pendingPhotos.length})</span>
                <div className="ms-auto flex gap-1">
                  <CameraCaptureButton onCapture={addFiles} />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <ImagePlus /> {t("Importer")}
                  </Button>
                </div>
                {/* sans attribut name : les fichiers ne partent pas avec le formulaire, ils sont envoyés après la création */}
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              </div>
              {pendingPhotos.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">{t("Aucune photo")}</div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {pendingPhotos.map((p) => (
                    <div key={p.key} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="size-full object-cover" />
                      <button type="button" aria-label={t("Supprimer")} className="absolute end-1 top-1 rounded-full bg-black/60 p-1 text-white" onClick={() => removePending(p.key)}>
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t("Les photos sont envoyées lors de l'enregistrement du plein.")}</p>
            </div>
          )}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <SubmitButton>{t("Enregistrer")}</SubmitButton>
              <LinkButton href="/rapport-camions/carburant" variant="outline">
                {t("Annuler")}
              </LinkButton>
              {entry && (
                <Button
                  type="button"
                  variant="destructive"
                  className="ms-auto"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(t("Supprimer ce plein et ses photos ?"))) return;
                    start(async () => {
                      const r = await deleteFuelEntry(entry.id);
                      if (r.ok) {
                        toast.success(r.message);
                        router.push("/rapport-camions/carburant");
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
