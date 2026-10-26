import Link from "next/link";
import { ChevronRight, ClipboardCheck, Fuel, Plus, TriangleAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { countCompletedToday, getRemindersWithStatus } from "@/lib/data/reminders";
import { DueRemindersDialog } from "@/components/due-reminders-dialog";
import { formatDateLongFr, todayISO } from "@/lib/dates";
import { ADMIN_MODULES, DASHBOARD_MODULES } from "@/lib/modules";
import { NavIcon } from "@/lib/nav-icons";
import { RemindersPanel } from "@/components/reminders-panel";
import { FleetAlertsCard } from "@/components/fleet-alerts";
import { getSetupHint } from "@/lib/data/setup";
import { getSettings } from "@/lib/data/settings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [user, { t, locale }, { list: reminders }, completedToday] = await Promise.all([getCurrentUser(), getI18n(), getRemindersWithStatus(), countCompletedToday()]);
  const { error } = await searchParams;
  const today = todayISO();
  // À traiter (en retard, du jour, proches), puis les 3 prochains
  const alerts = reminders.filter((r) => ["overdue", "today", "later_today", "soon"].includes(r.status.state));
  const next = reminders.filter((r) => r.status.state === "upcoming").slice(0, 3);
  const dueNow = reminders.filter((r) => r.status.state === "overdue" || r.status.state === "today");
  const stats = [
    { label: t("Rappels du jour"), value: reminders.filter((r) => r.status.state === "today" || r.status.state === "later_today").length, cls: "text-orange-700 dark:text-orange-400" },
    { label: t("Rappels en retard"), value: reminders.filter((r) => r.status.state === "overdue").length, cls: "text-red-700 dark:text-red-400" },
    { label: t("Rappels importants"), value: alerts.filter((r) => r.priority !== "normal").length, cls: "" },
    { label: t("Terminés aujourd'hui"), value: completedToday, cls: "text-emerald-700 dark:text-emerald-400" },
  ];

  const visible = DASHBOARD_MODULES.filter((m) => user.permissions[m.key].can_view);
  const admin = ADMIN_MODULES.filter((m) => (m.href === "/profil" ? user.permissions.parametres.can_view || user.permissions.employes.can_view : user.permissions[m.key].can_view));

  // Actions rapides selon les droits
  const quick = [
    user.permissions.pointage.can_edit && { href: "/pointage", label: t("Pointage du jour"), icon: ClipboardCheck },
    user.permissions.rapport_camions.can_edit && { href: "/rapport-camions/carburant/nouveau", label: t("Nouveau plein"), icon: Fuel },
    user.permissions.avertissements.can_edit && { href: "/avertissements/nouveau", label: t("Nouvel avertissement"), icon: TriangleAlert },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Plus }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{formatDateLongFr(today, locale)}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("Bonjour {name}", { name: user.fullName.split(" ")[0] })}</h1>
        </div>
        {quick.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0">
            {quick.map((q) => (
              <Link key={q.href} href={q.href} className="inline-flex shrink-0 items-center gap-2 rounded-full border bg-card px-3.5 py-2 text-sm font-medium shadow-sm transition hover:border-primary/40 hover:text-primary">
                <q.icon className="size-4 text-primary" /> {q.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {user.permissions.parametres.can_edit && <SetupBanner t={t} />}
      {user.permissions.parametres.can_view && <ContractBanner t={t} today={today} />}

      {error === "acces_refuse" && (
        <Alert variant="destructive">
          <AlertDescription>{t("Accès refusé : vous n'avez pas la permission d'ouvrir ce module.")}</AlertDescription>
        </Alert>
      )}

      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{t("Rappels et alertes")}</h2>
          {alerts.length > 0 && <span className="rounded-full bg-red-600 px-2 text-xs leading-5 font-semibold text-white">{alerts.length}</span>}
          <Link href="/rappels" className="ms-auto inline-flex items-center gap-0.5 text-sm text-primary hover:underline">
            {t("Tous les rappels")} <ChevronRight className="size-4 rtl:rotate-180" />
          </Link>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn("text-xl font-bold tabular-nums", s.value > 0 && s.cls)}>{s.value}</p>
            </div>
          ))}
        </div>
        <RemindersPanel reminders={[...alerts, ...next]} today={today} emptyText={t("Aucun rappel. Créez-en un : une seule fois, chaque jour, certains jours de la semaine ou chaque mois.")} />
        <DueRemindersDialog reminders={dueNow} today={today} />
      </section>

      {user.permissions.rapport_camions.can_view && <FleetAlertsCard />}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("Modules")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {visible.map((m) => {
            return (
              <Link
                key={m.href}
                href={m.href}
                className={cn(
                  "group flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
                  m.key === "cloture" && "border-red-200 dark:border-red-900",
                )}
              >
                <span className={cn("flex size-11 items-center justify-center rounded-xl", m.accent)}>
                  <NavIcon href={m.href} className="size-5" />
                </span>
                <span>
                  <span className="block leading-tight font-semibold">{t(m.label)}</span>
                  <span className="mt-1 hidden text-xs text-muted-foreground sm:block">{t(m.description)}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {admin.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("Administration")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {admin.map((m) => {
              return (
                <Link key={m.href} href={m.href} className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm transition hover:border-primary/30 hover:shadow-md">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", m.accent)}>
                    <NavIcon href={m.href} className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{t(m.label)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t(m.description)}</span>
                  </span>
                  <ChevronRight className="ms-auto size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** Échéance du contrat de la société (Profil › Entreprise). */
async function ContractBanner({ t, today }: { t: (k: string, v?: Record<string, string | number>) => string; today: string }) {
  const s = await getSettings();
  const end = s.company_contract_end;
  if (!end) return null;
  const left = Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000);
  const max = Math.max(0, ...String(s.contract_alert_days).split(",").map(Number).filter(Number.isFinite));
  const tone = left < 0 ? "border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200" : left <= max ? "border-orange-300 bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200" : "bg-card text-muted-foreground";
  const fin = end.split("-").reverse().join("/");
  return (
    <Link href="/profil" className={cn("flex items-center gap-3 rounded-2xl border p-3 text-sm shadow-sm transition hover:shadow-md", tone)}>
      <span className="flex-1">
        {left < 0
          ? t("Contrat de la société expiré depuis le {date}.", { date: fin })
          : left === 0
            ? t("Contrat de la société : dernier jour aujourd'hui ({date}).", { date: fin })
            : t("Contrat de la société jusqu'au {date} (dans {n} jours).", { date: fin, n: left })}
        {s.company_contract_ref ? ` — ${t("Réf.")} ${s.company_contract_ref}` : ""}
      </span>
      <ChevronRight className="size-4 shrink-0 rtl:rotate-180" />
    </Link>
  );
}

/** Rappel de configuration (administrateur) tant que le système n'est pas prêt pour le pilote. */
async function SetupBanner({ t }: { t: (k: string, v?: Record<string, string | number>) => string }) {
  const hint = await getSetupHint();
  if (!hint.incomplete && !hint.demo) return null;
  return (
    <Link href="/mise-en-route" className={cn("flex items-center gap-3 rounded-2xl border p-4 text-sm shadow-sm transition hover:shadow-md", hint.demo ? "border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200" : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200")}>
      <span className="flex-1">
        <span className="block font-semibold">{hint.demo ? t("Données de démonstration présentes") : t("Mise en route à terminer")}</span>
        {hint.demo ? t("Supprimez-les avant le pilote : voir la page Mise en route.") : t("Renseignez le nom et le logo de l'entreprise, puis enregistrez vos employés et vos camions.")}
      </span>
      <ChevronRight className="size-4 shrink-0 rtl:rotate-180" />
    </Link>
  );
}
