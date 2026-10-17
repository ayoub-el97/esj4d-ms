"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveSettings } from "@/lib/actions/admin";
import type { AppSettings } from "@/lib/data/settings";
import { useT } from "@/lib/i18n/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const { t } = useT();
  const [state, action] = useActionState(saveSettings, null);

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("Envoi des rapports")}</CardTitle>
          <CardDescription>
            {t("Le nom, l'agence et le logo de la société se modifient dans le profil de l'entreprise.")}{" "}
            <Link href="/profil" className="underline">
              {t("Profil de l'entreprise")}
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="director_email">{t("E-mail du directeur (copie des PDF)")}</Label>
            <Input id="director_email" name="director_email" type="email" defaultValue={settings.director_email} placeholder="directeur@exemple.com" dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="timezone">{t("Fuseau horaire")}</Label>
            <Input id="timezone" name="timezone" defaultValue={settings.timezone} required dir="ltr" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Règles de calcul")}</CardTitle>
          <CardDescription>{t("Modifiables par l'administrateur ; chaque changement est journalisé.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="project_start_date">{t("Date de début du projet")}</Label>
            <Input id="project_start_date" name="project_start_date" type="date" defaultValue={settings.project_start_date} />
            <p className="text-xs text-muted-foreground">
              {t("Les « mois » sont comptés à partir de cette date, pour les employés et les rapports mensuels : début le 08/10/2026 → 1er mois du 08/10/2026 au 07/11/2026. Laisser vide pour des mois calendaires (du 1er au dernier jour).")}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="leave_days_per_month">{t("Congés acquis par mois (jours)")}</Label>
            <Input id="leave_days_per_month" name="leave_days_per_month" type="number" step="0.5" min="0" defaultValue={settings.leave_days_per_month} required />
            <p className="text-xs text-muted-foreground">{t("Règle initiale : 1,5 jour par mois (3 jours tous les deux mois).")}</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("Un « jour doublé » est compté lorsque :")}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="double_day_on_rest_day" defaultChecked={settings.double_day_on_rest_day} className="size-4 accent-indigo-600" />
              {t("l'employé travaille son jour de repos habituel")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="double_day_two_shifts" defaultChecked={settings.double_day_two_shifts} className="size-4 accent-indigo-600" />
              {t("l'employé effectue deux services le même jour")}
            </label>
          </fieldset>
          <ActionMessage state={state} />
          <SubmitButton>{t("Enregistrer les réglages")}</SubmitButton>
        </CardContent>
      </Card>
    </form>
  );
}
