"use client";

import { useActionState, useState } from "react";
import { saveEmployee } from "@/lib/actions/employees";
import type { Employee, Truck } from "@/lib/data/employees";
import { useT } from "@/lib/i18n/client";
import { POSITIONS, POSITION_LABELS, SUBSTITUTE_POSITION, WEEKDAY_LABELS, teamOfPosition, type Position } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { LinkButton } from "@/components/link-button";

export function EmployeeForm({
  employee,
  trucks,
  collecte,
  returnTo = "/employes",
}: {
  employee: Employee | null;
  trucks: Truck[];
  /** Employés actifs de la collecte (chauffeurs, rippeurs, remplaçants) */
  collecte: Employee[];
  /** Page de retour après enregistrement (/employes ou /profil?onglet=employes) */
  returnTo?: string;
}) {
  const { t } = useT();
  const [state, action] = useActionState(saveEmployee, null);
  const [position, setPosition] = useState<Position>(employee?.position ?? "balayeur");

  const others = collecte.filter((e) => e.id !== employee?.id);
  const chauffeurs = others.filter((e) => e.position === "chauffeur");
  const substitutePosition = SUBSTITUTE_POSITION[position];
  const substitutes = substitutePosition ? others.filter((e) => e.position === substitutePosition) : [];
  const dayName = (d: number | null) => (d == null ? t("— Non défini —") : t(WEEKDAY_LABELS[d]));

  return (
    <form action={action}>
      <input type="hidden" name="id" value={employee?.id ?? ""} />
      <input type="hidden" name="return_to" value={returnTo} />
      <Card>
        <CardHeader>
          <CardTitle>{employee ? t("Modifier {name}", { name: `${employee.last_name} ${employee.first_name}` }) : t("Nouvel équipier")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionMessage state={state} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="last_name">{t("Nom")}</Label>
              <Input id="last_name" name="last_name" defaultValue={employee?.last_name} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="first_name">{t("Prénom")}</Label>
              <Input id="first_name" name="first_name" defaultValue={employee?.first_name} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="matricule">{t("Matricule / identifiant")}</Label>
              <Input id="matricule" name="matricule" defaultValue={employee?.matricule} required />
            </div>
            <div className="space-y-1">
              <Label>{t("Numéro d'ordre (NB)")}</Label>
              <Input value={employee?.order_number ?? t("attribué automatiquement")} disabled />
            </div>
            <div className="space-y-1">
              <Label htmlFor="position">{t("Poste")}</Label>
              <NativeSelect id="position" name="position" value={position} onChange={(e) => setPosition(e.target.value as Position)}>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {t(POSITION_LABELS[p])}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                {t("Équipe : {team} (déduite du poste)", { team: teamOfPosition(position) === "nettoiement" ? t("Nettoiement") : t("Collecte") })}
              </p>
            </div>
            {position === "chauffeur" && (
              <div className="space-y-1">
                <Label htmlFor="truck_id">{t("Camion (matricule)")}</Label>
                <NativeSelect id="truck_id" name="truck_id" defaultValue={employee?.truck_id ?? ""}>
                  <option value="">{t("— Aucun —")}</option>
                  {trucks.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.matricule} {tr.brand && `(${tr.brand})`}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            {position === "rippeur" && (
              <div className="space-y-1">
                <Label htmlFor="chauffeur_id">{t("Chauffeur / équipe de rattachement")}</Label>
                <NativeSelect id="chauffeur_id" name="chauffeur_id" defaultValue={employee?.chauffeur_id ?? ""}>
                  <option value="">{t("— Non affecté —")}</option>
                  {chauffeurs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.last_name} {c.first_name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            {substitutePosition && (
              <div className="space-y-1">
                <Label htmlFor="substitute_id">{t("Remplaçant attitré (jours de repos)")}</Label>
                <NativeSelect id="substitute_id" name="substitute_id" defaultValue={employee?.substitute_id ?? ""}>
                  <option value="">{t("— Aucun —")}</option>
                  {substitutes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.last_name} {s.first_name} ({t("repos")} : {dayName(s.rest_day)})
                    </option>
                  ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">
                  {substitutes.length === 0
                    ? t("Aucun {poste} : créez-en un avec le poste correspondant.", { poste: t(POSITION_LABELS[substitutePosition]).toLowerCase() })
                    : t("Il est proposé automatiquement sur la feuille de présence les jours de repos de cet employé.")}
                </p>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="rest_day">{t("Jour de repos habituel")}</Label>
              <NativeSelect id="rest_day" name="rest_day" defaultValue={employee?.rest_day ?? ""}>
                <option value="">{t("— Non défini —")}</option>
                {WEEKDAY_LABELS.map((d, i) => (
                  <option key={i} value={i}>
                    {t(d)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="hire_date">{t("Date de début de travail")}</Label>
              <Input id="hire_date" name="hire_date" type="date" defaultValue={employee?.hire_date ?? ""} />
              <p className="text-xs text-muted-foreground">{t("Sert au calcul des congés acquis.")}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">{t("Téléphone")}</Label>
              <Input id="phone" name="phone" defaultValue={employee?.phone} dir="ltr" />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="is_active" defaultChecked={employee?.is_active ?? true} className="size-4 accent-indigo-600" />
              {t("Employé actif")}
            </label>
          </div>
          <div className="flex gap-2">
            <SubmitButton>{employee ? t("Enregistrer les modifications") : t("Créer l'équipier")}</SubmitButton>
            <LinkButton href={returnTo} variant="outline">
              {t("Annuler")}
            </LinkButton>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
