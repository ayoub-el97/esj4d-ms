"use client";

import { useActionState, useState } from "react";
import { saveEmployee } from "@/lib/actions/employees";
import type { Employee, Truck } from "@/lib/data/employees";
import { POSITION_LABELS, WEEKDAY_LABELS, type Position } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { LinkButton } from "@/components/link-button";

export function EmployeeForm({
  employee,
  trucks,
  chauffeurs,
}: {
  employee: Employee | null;
  trucks: Truck[];
  chauffeurs: Employee[];
}) {
  const [state, action] = useActionState(saveEmployee, null);
  const [position, setPosition] = useState<Position>(employee?.position ?? "balayeur");

  return (
    <form action={action}>
      <input type="hidden" name="id" value={employee?.id ?? ""} />
      <Card>
        <CardHeader>
          <CardTitle>{employee ? `Modifier ${employee.last_name} ${employee.first_name}` : "Nouvel équipier"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionMessage state={state} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="last_name">Nom</Label>
              <Input id="last_name" name="last_name" defaultValue={employee?.last_name} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="first_name">Prénom</Label>
              <Input id="first_name" name="first_name" defaultValue={employee?.first_name} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="matricule">Matricule / identifiant</Label>
              <Input id="matricule" name="matricule" defaultValue={employee?.matricule} required />
            </div>
            <div className="space-y-1">
              <Label>Numéro d&apos;ordre (NB)</Label>
              <Input value={employee?.order_number ?? "attribué automatiquement"} disabled />
            </div>
            <div className="space-y-1">
              <Label htmlFor="position">Poste</Label>
              <NativeSelect id="position" name="position" value={position} onChange={(e) => setPosition(e.target.value as Position)}>
                {(Object.keys(POSITION_LABELS) as Position[]).map((p) => (
                  <option key={p} value={p}>
                    {POSITION_LABELS[p]}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                Équipe : {position === "balayeur" ? "Nettoiement" : "Collecte"} (déduite du poste)
              </p>
            </div>
            {position === "chauffeur" && (
              <div className="space-y-1">
                <Label htmlFor="truck_id">Camion (matricule)</Label>
                <NativeSelect id="truck_id" name="truck_id" defaultValue={employee?.truck_id ?? ""}>
                  <option value="">— Aucun —</option>
                  {trucks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.matricule} {t.brand && `(${t.brand})`}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            {position === "rippeur" && (
              <div className="space-y-1">
                <Label htmlFor="chauffeur_id">Chauffeur / équipe de rattachement</Label>
                <NativeSelect id="chauffeur_id" name="chauffeur_id" defaultValue={employee?.chauffeur_id ?? ""}>
                  <option value="">— Non affecté —</option>
                  {chauffeurs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.last_name} {c.first_name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="rest_day">Jour de repos habituel</Label>
              <NativeSelect id="rest_day" name="rest_day" defaultValue={employee?.rest_day ?? ""}>
                <option value="">— Non défini —</option>
                {WEEKDAY_LABELS.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="hire_date">Date d&apos;embauche (début des congés acquis)</Label>
              <Input id="hire_date" name="hire_date" type="date" defaultValue={employee?.hire_date ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" name="phone" defaultValue={employee?.phone} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="is_active" defaultChecked={employee?.is_active ?? true} className="size-4 accent-indigo-600" />
              Employé actif
            </label>
          </div>
          <div className="flex gap-2">
            <SubmitButton>{employee ? "Enregistrer les modifications" : "Créer l'équipier"}</SubmitButton>
            <LinkButton href="/employes" variant="outline">
              Annuler
            </LinkButton>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
