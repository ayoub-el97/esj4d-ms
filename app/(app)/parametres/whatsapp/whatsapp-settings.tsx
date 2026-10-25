"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle, Copy, PlugZap, RotateCcw, Send, Users } from "lucide-react";
import { createWhatsAppGroup, listWhatsAppGroups, retryWhatsApp, saveWhatsAppConfig, selectWhatsAppGroup, sendWhatsAppTest, testWhatsAppConnection, type WaLogRow } from "@/lib/actions/whatsapp";
import type { WhatsAppPublicConfig } from "@/lib/whatsapp/config";
import { useT } from "@/lib/i18n/client";
import { formatDateTimeFr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";
import { WA_STATUS_LABELS, WA_STATUS_STYLES, WhatsAppIcon } from "@/components/whatsapp-button";

function SecretField({ name, label, isSet, hint, fromEnv, help }: { name: string; label: string; isSet: boolean; hint?: string; fromEnv: boolean; help: string }) {
  const { t } = useT();
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      {fromEnv ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{t("Défini par une variable d'environnement du serveur (Vercel) : prioritaire, non modifiable ici.")}</p>
      ) : (
        <>
          <Input id={name} name={name} type="password" autoComplete="off" placeholder={isSet ? t("Enregistré {hint} — laisser vide pour conserver", { hint: hint ?? "" }) : t("Non renseigné")} />
          {isSet && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name={`clear_${name}`} className="size-3.5" /> {t("Effacer la valeur enregistrée")}
            </label>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

export function WhatsAppSettings({ config: c, missing, log, webhookUrl }: { config: WhatsAppPublicConfig; missing: string[]; log: WaLogRow[]; webhookUrl: string }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(saveWhatsAppConfig, null);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState(c.send_mode);
  const [groups, setGroups] = useState<{ id: string; subject: string }[] | null>(null);
  const [groupName, setGroupName] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message, { duration: 8000 });
      else toast.error(r.error, { duration: 12000 });
      router.refresh();
    });

  const steps = [
    { done: !!c.phone_number_id && c.token_set, label: t("Compte WhatsApp Business (Meta) relié : identifiant du numéro et jeton d'accès") },
    { done: !!c.manager_number, label: t("Numéro du directeur renseigné") },
    { done: c.send_mode === "session" || !!c.template_name, label: t("Modèle de message approuvé par Meta (mode recommandé)") },
    { done: c.app_secret_set && c.verify_token_set, label: t("Webhook configuré (suivi « Remis » / « Lu ») — facultatif") },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WhatsAppIcon className="size-5 text-[#25D366]" /> {t("État de la configuration")}
          </CardTitle>
          <CardDescription>
            {missing.length ? t("Configuration WhatsApp manquante : les boutons « Envoyer par WhatsApp » affichent ce qu'il reste à faire.") : t("Prêt à envoyer : faites d'abord un test de connexion puis un message de test.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-1 text-sm">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                {s.done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4 text-amber-600" />} {s.label}
              </li>
            ))}
          </ul>
          {missing.length > 0 && (
            <ul className="list-disc rounded-lg bg-amber-50 py-2 ps-8 pe-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={pending} onClick={() => run(testWhatsAppConnection)}>
              <PlugZap /> {t("Tester la connexion")}
            </Button>
            <Button variant="outline" disabled={pending || missing.length > 0} onClick={() => run(sendWhatsAppTest)}>
              <Send /> {t("Envoyer un message de test au directeur")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <form action={action} className="space-y-6">
        <ActionMessage state={state} />
        <Card>
          <CardHeader>
            <CardTitle>{t("1. Compte WhatsApp Business (Meta)")}</CardTitle>
            <CardDescription>{t("Valeurs disponibles dans Meta for Developers › votre application › WhatsApp › Configuration de l'API.")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="phone_number_id">{t("Identifiant du numéro (Phone Number ID)")}</Label>
              <Input id="phone_number_id" name="phone_number_id" defaultValue={c.phone_number_id} inputMode="numeric" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="waba_id">{t("Identifiant du compte WhatsApp Business (WABA ID)")}</Label>
              <Input id="waba_id" name="waba_id" defaultValue={c.waba_id} inputMode="numeric" dir="ltr" />
            </div>
            <div className="sm:col-span-2">
              <SecretField name="access_token" label={t("Jeton d'accès (permanent)")} isSet={c.token_set} hint={c.token_hint} fromEnv={c.token_from_env} help={t("Jeton d'un « utilisateur système » avec la permission whatsapp_business_messaging. Stocké côté serveur uniquement, jamais affiché ni envoyé au navigateur.")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="api_version">{t("Version de l'API Graph")}</Label>
              <Input id="api_version" name="api_version" defaultValue={c.api_version} dir="ltr" className="w-32" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("2. Destinataires")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="manager_name">{t("Nom du directeur")}</Label>
              <Input id="manager_name" name="manager_name" defaultValue={c.manager_name} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manager_number">{t("Numéro WhatsApp du directeur (destinataire par défaut)")}</Label>
              <Input id="manager_number" name="manager_number" defaultValue={c.manager_number ? `+${c.manager_number}` : ""} placeholder="+212 6 12 34 56 78" dir="ltr" inputMode="tel" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="extra_recipients">{t("Destinataires supplémentaires (facultatif) : une ligne par personne, « Nom ; numéro »")}</Label>
              <Textarea id="extra_recipients" name="extra_recipients" rows={3} dir="ltr" defaultValue={c.extra_recipients.map((r) => `${r.name} ; +${r.number}`).join("\n")} placeholder={"Superviseur ; +212 6 98 76 54 32"} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("3. Message et mode d'envoi")}</CardTitle>
            <CardDescription>
              {t("WhatsApp n'accepte un message libre que si le destinataire a écrit au numéro de l'entreprise dans les dernières 24 h. Le mode « Modèle approuvé » fonctionne à tout moment : il faut créer le modèle dans WhatsApp Manager et attendre son approbation par Meta.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="send_mode">{t("Mode d'envoi")}</Label>
              <NativeSelect id="send_mode" name="send_mode" value={mode} onChange={(e) => setMode(e.target.value as "modele" | "session")}>
                <option value="modele">{t("Modèle approuvé (recommandé, envoi à tout moment)")}</option>
                <option value="session">{t("Message libre (seulement dans la fenêtre de 24 h)")}</option>
              </NativeSelect>
            </div>
            {mode === "modele" && (
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="template_name">{t("Nom du modèle approuvé")}</Label>
                  <Input id="template_name" name="template_name" defaultValue={c.template_name} placeholder="envoi_rapport" dir="ltr" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="template_lang">{t("Langue du modèle")}</Label>
                  <Input id="template_lang" name="template_lang" defaultValue={c.template_lang} placeholder="fr" dir="ltr" className="w-24" />
                </div>
                <div className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
                  <p className="font-medium text-foreground">{t("Modèle à créer dans WhatsApp Manager (catégorie « Utilitaire », langue Français) :")}</p>
                  <ul className="list-disc ps-5">
                    <li>{t("En-tête : « Document » (si le PDF est joint) — aucun en-tête sinon.")}</li>
                    <li>{t("Corps avec exactement 2 variables, par exemple : « Bonjour, voici le document : {{1}}. {{2}} »")}</li>
                    <li>{t("{{1}} reçoit le titre du rapport ; {{2}} le message (résumé, modifiable avant l'envoi).")}</li>
                  </ul>
                </div>
              </div>
            )}
            <input type="hidden" name="template_name" value={mode === "modele" ? undefined : c.template_name} disabled={mode === "modele"} />
            <div className="space-y-1">
              <Label htmlFor="default_message">{t("Phrase de fin du message (facultatif)")}</Label>
              <Input id="default_message" name="default_message" defaultValue={c.default_message} placeholder={t("Veuillez trouver le rapport en pièce jointe.")} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="attach_pdf" defaultChecked={c.attach_pdf} className="size-4" /> {t("Joindre le PDF du rapport (recommandé)")}
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("4. Suivi de remise (webhook) — facultatif")}</CardTitle>
            <CardDescription>{t("Sans webhook, l'envoi fonctionne et le statut reste « Envoyé (accepté par WhatsApp) ». Avec le webhook, les statuts « Remis » et « Lu » sont mis à jour automatiquement.")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>{t("URL de rappel à saisir dans Meta (WhatsApp › Configuration › Webhook, champ « messages »)")}</Label>
              <div className="flex gap-2">
                <Input readOnly value={webhookUrl} dir="ltr" />
                <Button type="button" variant="outline" size="icon" aria-label={t("Copier")} onClick={() => navigator.clipboard?.writeText(webhookUrl).then(() => toast.success(t("Copié.")))}>
                  <Copy />
                </Button>
              </div>
            </div>
            <SecretField name="verify_token" label={t("Jeton de vérification du webhook")} isSet={c.verify_token_set} fromEnv={c.verify_token_from_env} help={t("Mot de passe de votre choix, à saisir aussi dans Meta (« Vérifier le jeton »).")} />
            <SecretField name="app_secret" label={t("Clé secrète de l'application Meta")} isSet={c.app_secret_set} fromEnv={c.app_secret_from_env} help={t("Paramètres de l'application › Général. Sert à vérifier que les notifications viennent bien de Meta.")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" /> {t("5. Groupe de gestion (directeur + superviseur) — facultatif")}
            </CardTitle>
            <CardDescription>
              {t("L'API officielle des groupes WhatsApp est réservée aux comptes professionnels officiels (OBA, badge bleu) : 8 participants au maximum, qui rejoignent le groupe par un lien d'invitation. Si votre compte n'est pas éligible, Meta refuse et les rapports partent individuellement au directeur et aux destinataires supplémentaires.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="group_enabled" defaultChecked={c.group_enabled} className="size-4" /> {t("Proposer « Groupe de gestion » comme destinataire")}
            </label>
            <p className="text-sm">
              {c.group_id ? t("Groupe choisi : {name}", { name: c.group_subject || c.group_id }) : t("Aucun groupe choisi.")}
              {c.group_invite_link && (
                <>
                  {" "}
                  · {t("Lien d'invitation :")}{" "}
                  <a href={c.group_invite_link} className="text-primary underline" target="_blank" rel="noreferrer">
                    {c.group_invite_link}
                  </a>
                </>
              )}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await listWhatsAppGroups(); if (r.ok) setGroups(r.data?.groups ?? []); else toast.error(r.error, { duration: 12000 }); })}>
                {t("Lister les groupes du compte")}
              </Button>
              <Input className="w-56" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={t("Nom du nouveau groupe")} />
              <Button type="button" variant="outline" disabled={pending || !groupName.trim()} onClick={() => run(() => createWhatsAppGroup(groupName))}>
                {t("Créer le groupe")}
              </Button>
            </div>
            {groups && (
              <ul className="space-y-1 text-sm">
                {groups.length === 0 && <li className="text-muted-foreground">{t("Aucun groupe sur ce numéro.")}</li>}
                {groups.map((g) => (
                  <li key={g.id} className="flex items-center gap-2">
                    <span>{g.subject}</span>
                    <Button type="button" size="sm" variant={g.id === c.group_id ? "default" : "outline"} disabled={pending} onClick={() => run(() => selectWhatsAppGroup(g.id, g.subject))}>
                      {g.id === c.group_id ? t("Choisi") : t("Choisir")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="sticky bottom-20 z-10 rounded-xl border bg-card/95 p-3 shadow-md backdrop-blur lg:bottom-4">
          <SubmitButton>{t("Enregistrer la configuration")}</SubmitButton>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>{t("Journal des envois")}</CardTitle>
          <CardDescription>{t("Chaque envoi : rapport, destinataire, expéditeur, date et statut. Les envois en échec peuvent être relancés.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Aucun envoi pour le moment.")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {log.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="text-xs text-muted-foreground">{formatDateTimeFr(m.created_at)}</span>
                  <span className="font-medium">{m.report_title}</span>
                  <span className="text-muted-foreground">
                    → {m.recipient_label} ({m.recipient}) · {m.sender}
                    {m.with_pdf ? ` · ${t("PDF joint")}` : ""}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", WA_STATUS_STYLES[m.status])}>{t(WA_STATUS_LABELS[m.status])}</span>
                  {m.error && <span className="w-full text-xs text-red-700 dark:text-red-400">{m.error}</span>}
                  {m.retryable && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => retryWhatsApp(m.id))}>
                      <RotateCcw /> {t("Réessayer")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
