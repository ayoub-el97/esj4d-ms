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
  canEditLeave = false,
}: {
  employee: Employee | null;
  trucks: Truck[];
  /** Employés actifs de la collecte (chauffeurs, rippeurs, remplaçants) */
  collecte: Employee[];
  /** Page de retour après enregistrement (/employes ou /profil?onglet=employes) */
  returnTo?: string;
  /** Données de reprise des congés modifiables (administrateur) */
  canEditLeave?: boolean;
}) {
  const { t } = useT();
  const [state, action] = useActionState(saveEmployee, null);
  const [position, setPosition] = useState<Position>(employee?.position ?? "balayeur");
  const [hireDate, setHireDate] = useState(employee?.hire_date ?? "");

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
              <Label htmlFor="matricule">{t("Matricule (facultatif)")}</Label>
              <Input id="matricule" name="matricule" defaultValue={employee?.matricule} maxLength={40} />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" name="confirm_homonym" className="size-3.5" /> {t("Autre personne portant le même nom (homonyme)")}
              </label>
            </div>
            <div className="space-y-1">
              <Label>{t("Numéro d'ordre (NB)")}</Label>
              <Input value={employee?.order_number ?? t("attribué automatiquement")} disabled />
            </div>
            <div className="space-y-1">
              <Label htmlFor="position">{t("Poste")}</Label>
              <NativeSelect id="position" name="position" value={position} onChange={(e) => setPosition(e.target.value as Position)}>
                {!POSITIONS.includes(position) && (
                  <option value={position}>
                    {t("{position} (poste retiré — choisissez un autre poste)", { position: t(POSITION_LABELS[position] ?? position) })}
                  </option>
                )}
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
            <div className="space-y-1">
              <Label htmlFor="job_title">{position === "autre" ? t("Libellé de la fonction (obligatoire)") : t("Libellé de la fonction (facultatif)")}</Label>
              <Input id="job_title" name="job_title" defaultValue={employee?.job_title ?? ""} maxLength={60} required={position === "autre"} placeholder={t("Ex. Électricien, Magasinier…")} />
              <p className="text-xs text-muted-foreground">{t("Affiché dans la colonne « Fonction » du rapport mensuel de pointage.")}</p>
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
              <Label htmlFor="hire_date">{t("Date de début de travail (facultatif)")}</Label>
              <Input id="hire_date" name="hire_date" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                {t("Laissez vide si la date réelle est inconnue (employé déjà en poste avant l'application) : aucune date n'est supposée. Sert au calcul des congés acquis.")}
              </p>
              {!hireDate && (
                <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-2 text-xs">
                  <input type="checkbox" name="in_service_before_start" defaultChecked={employee?.in_service_before_start ?? false} className="mt-0.5 size-4" />
                  <span>
                    <span className="font-medium">{t("Déjà en poste au début du projet")}</span>
                    <span className="block text-muted-foreground">{t("Les congés sont alors décomptés depuis la date de début du projet (Paramètres › Réglages). Sinon, aucun congé n'est calculé tant que la date de début n'est pas renseignée.")}</span>
                  </span>
                </label>
              )}
            </div>
            <fieldset className="space-y-2 rounded-lg border p-3 sm:col-span-2" disabled={!canEditLeave}>
              <legend className="px-1 text-sm font-medium">{t("Congés — reprise des registres papier")}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="leave_tracking_start">{t("Date de début dans le système (facultatif)")}</Label>
                  <Input id="leave_tracking_start" name="leave_tracking_start" type="date" defaultValue={employee?.leave_tracking_start ?? ""} />
                  <p className="text-xs text-muted-foreground">{t("Début du suivi des congés dans l'application. Vide = date de début du projet (Paramètres › Réglages).")}</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="leave_taken_before">{t("Congés déjà pris avant le système (facultatif)")}</Label>
                  <Input id="leave_taken_before" name="leave_taken_before" type="number" step="0.5" min="0" defaultValue={employee?.leave_taken_before ?? ""} />
                  <p className="text-xs text-muted-foreground">{t("Pour information : déjà compris dans le solde initial, jamais déduit une seconde fois.")}</p>
                </div>
              </div>
              {employee && (
                <p className="text-xs">
                  {t("Le solde initial (registres papier) se saisit dans")}{" "}
                  <a className="text-primary underline" href={`/conges/${employee.id}`}>
                    {t("Congé / Récupération › fiche de l'employé")}
                  </a>{" "}
                  {t("(motif obligatoire, historique conservé).")}
                </p>
              )}
              {!canEditLeave && <p className="text-xs text-muted-foreground">{t("Modifiable par l'administrateur uniquement.")}</p>}
            </fieldset>
            {employee?.departure_date && (
              <div className="space-y-1">
                <Label>{t("Date de fin de travail")}</Label>
                <Input value={employee.departure_date.split("-").reverse().join("/")} disabled />
                <p className="text-xs text-muted-foreground">{t("Enregistrée lors du départ (Actions › Désactiver).")}</p>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="work_schedule">{t("Horaire habituel (facultatif)")}</Label>
              <Input id="work_schedule" name="work_schedule" defaultValue={employee?.work_schedule ?? ""} maxLength={80} placeholder={t("Ex. Matin 06:00 – 13:00")} />
              <p className="text-xs text-muted-foreground">{t("Information pour l'organisation ; les heures réelles restent saisies dans le Pointage.")}</p>
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
