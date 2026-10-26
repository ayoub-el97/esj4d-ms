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
            <Label htmlFor="normal_end_time">{t("Heure de fin normale (heures supplémentaires automatiques)")}</Label>
            <Input id="normal_end_time" name="normal_end_time" type="time" defaultValue={settings.normal_end_time} className="w-32" />
            <p className="text-xs text-muted-foreground">
              {t("Une seule heure pour toute l'entreprise. Chaque demi-heure entamée après cette heure (heure de sortie réelle) compte 0,5 h : 15:30 pour une fin à 14:00 → 1,5 h ; 15:31 → 2 h. Les heures saisies à la main dans le Pointage sont toujours ajoutées en totalité. Laisser vide pour désactiver le calcul automatique.")}
            </p>
          </div>
          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">{t("Alertes camions (Problèmes et réparations)")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="truck_alert_orange_days">{t("Orange : panne en cours depuis (jours)")}</Label>
                <Input id="truck_alert_orange_days" name="truck_alert_orange_days" type="number" min="1" max="365" defaultValue={settings.truck_alert_orange_days} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="truck_alert_red_days">{t("Rouge : panne en cours depuis (jours)")}</Label>
                <Input id="truck_alert_red_days" name="truck_alert_red_days" type="number" min="1" max="365" defaultValue={settings.truck_alert_red_days} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="truck_alert_orange_count">{t("Orange : nombre de pannes sur la période glissante")}</Label>
                <Input id="truck_alert_orange_count" name="truck_alert_orange_count" type="number" min="1" max="100" defaultValue={settings.truck_alert_orange_count} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="truck_alert_red_count">{t("Rouge : nombre de pannes sur la période glissante")}</Label>
                <Input id="truck_alert_red_count" name="truck_alert_red_count" type="number" min="1" max="100" defaultValue={settings.truck_alert_red_count} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="truck_alert_window_days">{t("Période glissante (jours)")}</Label>
                <Input id="truck_alert_window_days" name="truck_alert_window_days" type="number" min="1" max="365" defaultValue={settings.truck_alert_window_days} required />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("Jours calendaires, jour de la panne inclus. L'alerte la plus grave s'applique : rouge l'emporte sur orange.")}</p>
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="pointage_period_start_day">{t("Rapport mensuel de pointage : jour de début de la période")}</Label>
            <Input id="pointage_period_start_day" name="pointage_period_start_day" type="number" min="1" max="28" step="1" defaultValue={settings.pointage_period_start_day} required className="w-28" />
            <p className="text-xs text-muted-foreground">{t("8 = période du 8 d'un mois au 7 du mois suivant (ex. Septembre : du 08/09 au 07/10).")}</p>
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
