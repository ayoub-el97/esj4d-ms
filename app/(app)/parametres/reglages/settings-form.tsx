"use client";

import { useActionState } from "react";
import { saveSettings } from "@/lib/actions/admin";
import type { AppSettings } from "@/lib/data/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [state, action] = useActionState(saveSettings, null);

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Société</CardTitle>
          <CardDescription>Informations affichées en en-tête des feuilles et des PDF.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="company_name">Nom de la société</Label>
            <Input id="company_name" name="company_name" defaultValue={settings.company_name} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="agency_name">Agence</Label>
            <Input id="agency_name" name="agency_name" defaultValue={settings.agency_name} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="director_email">E-mail du directeur (copie des PDF)</Label>
            <Input id="director_email" name="director_email" type="email" defaultValue={settings.director_email} placeholder="directeur@exemple.com" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="timezone">Fuseau horaire</Label>
            <Input id="timezone" name="timezone" defaultValue={settings.timezone} required />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Règles de calcul</CardTitle>
          <CardDescription>Modifiables par l&apos;administrateur ; chaque changement est journalisé.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="leave_days_per_month">Congés acquis par mois (jours)</Label>
            <Input id="leave_days_per_month" name="leave_days_per_month" type="number" step="0.5" min="0" defaultValue={settings.leave_days_per_month} required />
            <p className="text-xs text-muted-foreground">Règle initiale : 1,5 jour par mois (3 jours tous les deux mois).</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Un « jour doublé » est compté lorsque :</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="double_day_on_rest_day" defaultChecked={settings.double_day_on_rest_day} className="size-4 accent-indigo-600" />
              l&apos;employé travaille son jour de repos habituel
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="double_day_two_shifts" defaultChecked={settings.double_day_two_shifts} className="size-4 accent-indigo-600" />
              l&apos;employé effectue deux services le même jour
            </label>
          </fieldset>
          <ActionMessage state={state} />
          <SubmitButton>Enregistrer les réglages</SubmitButton>
        </CardContent>
      </Card>
    </form>
  );
}
