import Link from "next/link";
import { ChevronRight, ClipboardCheck, Fuel, Plus, TriangleAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getReminders } from "@/lib/data/reminders";
import { formatDateLongFr, todayISO } from "@/lib/dates";
import { ADMIN_MODULES, DASHBOARD_MODULES } from "@/lib/modules";
import { NavIcon } from "@/lib/nav-icons";
import { isAlert, reminderState } from "@/lib/reminder-types";
import { RemindersPanel } from "@/components/reminders-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [user, { t, locale }, reminders] = await Promise.all([getCurrentUser(), getI18n(), getReminders()]);
  const { error } = await searchParams;
  const today = todayISO();
  // Alertes d'abord, puis les 5 prochains rappels
  const alerts = reminders.filter((r) => isAlert(reminderState(r, today).state));
  const next = reminders.filter((r) => !isAlert(reminderState(r, today).state)).slice(0, 5);

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
        <RemindersPanel reminders={[...alerts, ...next]} today={today} emptyText={t("Aucun rappel. Créez-en un pour être alerté à l'approche d'une date.")} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("Modules")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {visible.map((m) => {
            return (
              <Link
                key={m.key}
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
