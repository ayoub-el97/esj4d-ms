import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Circle, DatabaseZap } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getSetupStatus } from "@/lib/data/setup";
import { formatDateFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { POSITION_LABELS, type Position } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";

export const generateMetadata = pageTitle("Mise en route");

type Step = { done: boolean; optional?: boolean; title: string; detail: string; href: string; action: string };

export default async function SetupPage() {
  const [, t] = await Promise.all([requireModule("parametres"), getT()]);
  const s = await getSetupStatus();
  const hasDemo = s.demo.employees.length > 0 || s.demo.trucks.length > 0;
  const recorded = s.data.filter((d) => d.count > 0);

  const steps: Step[] = [
    {
      done: !!s.company.name,
      title: t("1. Nom de l'entreprise"),
      detail: s.company.name ? s.company.name : t("Non renseigné : il apparaît dans l'application, les rapports et les PDF."),
      href: "/profil?onglet=entreprise",
      action: t("Profil de l'entreprise"),
    },
    {
      done: s.company.hasLogo,
      title: t("2. Logo"),
      detail: s.company.hasLogo ? t("Logo enregistré.") : t("Aucun logo : téléversez une image (PNG, JPG, WEBP ou SVG)."),
      href: "/profil?onglet=entreprise",
      action: t("Ajouter le logo"),
    },
    {
      done: s.company.hasDetails,
      optional: true,
      title: t("3. Adresse, téléphone, e-mail"),
      detail: s.company.hasDetails ? t("Coordonnées renseignées.") : t("Facultatif : affichées dans les en-têtes des PDF."),
      href: "/profil?onglet=entreprise",
      action: t("Compléter"),
    },
    {
      done: true,
      title: t("4. Période de pointage et règles"),
      detail: t("Période du {day} au {prev} du mois suivant · début du projet : {start}. Vérifiez aussi les congés par mois, les jours doublés et les seuils d'alerte camions.", {
        day: s.periodStartDay,
        prev: s.periodStartDay - 1 || 28,
        start: s.projectStart ? formatDateFr(s.projectStart) : t("non renseigné"),
      }),
      href: "/parametres/reglages",
      action: t("Réglages"),
    },
    {
      done: s.holidaysThisYear > 0,
      title: t("5. Jours fériés"),
      detail: s.holidaysThisYear ? t("{count} jour(s) férié(s) enregistré(s) cette année.", { count: s.holidaysThisYear }) : t("Aucun jour férié cette année : synchronisez le calendrier du Maroc."),
      href: "/parametres/feries",
      action: t("Jours fériés"),
    },
    {
      done: s.accounts > 1,
      optional: true,
      title: t("6. Comptes des utilisateurs"),
      detail: t("{count} compte(s). Créez un compte par personne (secrétaire, contrôleur…) avec le bon rôle.", { count: s.accounts }),
      href: "/parametres/comptes",
      action: t("Comptes"),
    },
    {
      done: s.employees.active > 0,
      title: t("7. Employés"),
      detail: s.employees.active
        ? t("{count} employé(s) actif(s) : {list}", {
            count: s.employees.active,
            list: Object.entries(s.employees.byPosition)
              .map(([p, n]) => `${t(POSITION_LABELS[p as Position] ?? p)} ${n}`)
              .join(", "),
          })
        : t("Aucun employé : ajoutez-les un par un ou en saisie groupée."),
      href: "/employes",
      action: t("Employés"),
    },
    {
      done: s.trucks.active > 0,
      title: t("8. Camions"),
      detail: s.trucks.active ? t("{count} camion(s) actif(s).", { count: s.trucks.active }) : t("Aucun camion : enregistrez les véhicules réels (matricule, n° interne, type)."),
      href: "/employes/camions",
      action: t("Camions"),
    },
    {
      done: s.teamLeads > 0,
      optional: true,
      title: t("9. Chefs d'équipe"),
      detail: s.teamLeads ? t("{count} chef(s) d'équipe.", { count: s.teamLeads }) : t("Facultatif : proposés en tête des feuilles de pointage."),
      href: "/profil?onglet=chefs",
      action: t("Chefs d'équipe"),
    },
  ];
  const required = steps.filter((x) => !x.optional);
  const ready = required.every((x) => x.done) && !hasDemo;

  return (
    <div className="mx-auto max-w-4xl">
      <ModuleHeader title={t("Mise en route")} subtitle={t("Configurez le système avant le premier jour de travail réel")} backHref="/" />

      {hasDemo && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" /> {t("Données de démonstration détectées")}
          </p>
          <p className="mt-1">
            {t("Employés : {emp} · Camions : {trucks}. Elles doivent être supprimées avant le pilote (voir « Remise à zéro » ci-dessous).", {
              emp: s.demo.employees.join(", ") || "—",
              trucks: s.demo.trucks.join(", ") || "—",
            })}
          </p>
        </div>
      )}

      <div className={cn("mb-4 rounded-xl border p-4 text-sm", ready ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-card")}>
        {ready ? t("Configuration minimale terminée : vous pouvez ouvrir le Pointage du premier jour réel.") : t("{done} / {total} étapes obligatoires terminées.", { done: required.filter((x) => x.done).length, total: required.length })}
      </div>

      <ol className="space-y-2">
        {steps.map((x) => (
          <li key={x.title}>
            <Link href={x.href} className="flex items-start gap-3 rounded-xl border bg-card p-3 shadow-sm transition hover:border-primary/40">
              {x.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <Circle className={cn("mt-0.5 size-5 shrink-0", x.optional ? "text-muted-foreground" : "text-amber-600")} />}
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {x.title}
                  {x.optional && <span className="ms-1 text-xs font-normal text-muted-foreground">({t("facultatif")})</span>}
                </span>
                <span className="block text-sm text-muted-foreground">{x.detail}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-0.5 text-sm text-primary">
                {x.action} <ChevronRight className="size-4 rtl:rotate-180" />
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <section className="mt-6 rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
          <DatabaseZap className="size-4" /> {t("Données déjà enregistrées")}
        </h2>
        {recorded.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Aucune donnée d'exploitation : le système est vide et prêt pour le pilote.")}</p>
        ) : (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {recorded.map((d) => (
              <li key={d.label} className="flex justify-between gap-2 rounded-md bg-muted/40 px-2 py-1">
                <span>{t(d.label)}</span>
                <span className="font-semibold tabular-nums">{d.count}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {t("Employés : {emp} · Camions : {trucks} · Comptes : {acc}.", { emp: s.employees.total, trucks: s.trucks.total, acc: s.accounts })}
        </p>
      </section>

      <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <h2 className="mb-1 font-semibold">{t("Remise à zéro avant le pilote")}</h2>
        <p>{t("La remise à zéro n'est jamais lancée depuis l'application : elle se fait par l'administrateur, dans l'éditeur SQL de Supabase, après une sauvegarde.")}</p>
        <ol className="mt-2 list-decimal space-y-1 ps-5">
          <li>{t("Exécutez supabase/pilote/1_verifier.sql : il liste ce qui sera supprimé (aucune modification).")}</li>
          <li>{t("Faites une sauvegarde (voir l'en-tête du fichier 2_remise_a_zero.sql).")}</li>
          <li>{t("Exécutez supabase/pilote/2_remise_a_zero.sql en confirmant explicitement : employés, camions et toutes les données d'exploitation sont vidés ; les comptes, les droits, les réglages, le profil de l'entreprise et les jours fériés sont conservés.")}</li>
          <li>{t("Videz ensuite le dossier de photos dans Supabase › Storage › photos.")}</li>
        </ol>
      </section>
    </div>
  );
}
