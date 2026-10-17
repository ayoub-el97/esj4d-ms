"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteFuelEntry, saveFuelEntry } from "@/lib/actions/fuel";
import type { Employee, Truck } from "@/lib/data/employees";
import type { FuelEntry } from "@/lib/data/fuel";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
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
  const [state, action] = useActionState(saveFuelEntry, null);
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
          {!entry && canEdit && <p className="text-xs text-muted-foreground">{t("Après l'enregistrement, vous pourrez ajouter les photos (ticket, compteur, pompe).")}</p>}
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
