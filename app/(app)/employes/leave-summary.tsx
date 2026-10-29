import Link from "next/link";
import type { LeaveBalance } from "@/lib/data/leaves";
import { formatDateFr } from "@/lib/dates";
import type { TFunction } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import { fmtDays, leaveDashboard } from "@/lib/leave-method";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Résumé des congés payés de la fiche employé : valeurs saisies (registres) et calculées. */
export function LeaveSummary({ t, employeeId, hireDate, balance }: { t: TFunction; employeeId: string; hireDate: string | null; balance: LeaveBalance | null }) {
  const taken = balance?.taken ?? 0;
  const before = balance?.taken_before ?? null;
  const d = balance ? leaveDashboard(balance) : null;
  const items: { label: string; value: string; kind: "saisi" | "calcule"; strong?: boolean; hint?: string }[] = [
    { label: "Date d’entrée en service", value: hireDate ? formatDateFr(hireDate) : t("Date manquante — à compléter"), kind: "saisi" },
    { label: "Congés pris avant le système", value: `${fmtDays(before ?? 0)} ${t("j")}`, kind: "saisi" },
    { label: "Solde congé", value: d && !d.missingStart ? `${fmtDays(d.conge)} ${t("j")}` : "—", kind: "calcule", hint: balance?.adjustments ? t("dont corrections : {days} j", { days: balance.adjustments }) : t("1,5 j par mois complet") },
    { label: "Congés pris depuis le système", value: `${fmtDays(taken)} ${t("j")}`, kind: "calcule", hint: t("congés approuvés") },
    { label: "Solde pris", value: d && !d.missingStart ? `${fmtDays(d.pris)} ${t("j")}` : "—", kind: "calcule", hint: t("avant + depuis le système") },
    { label: "Solde restant", value: d && !d.missingStart ? `${fmtDays(d.restant)} ${t("j")}` : "—", kind: "calcule", strong: true, hint: d && d.restant < 0 ? t("À vérifier") : undefined },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Congés payés")}</CardTitle>
        <CardDescription>
          {t("Solde restant = Solde congé − Solde pris. Seuls la date d’entrée en service et les congés pris avant le système sont saisis.")}
          {d && !d.missingStart && <span className="mt-1 block font-medium text-foreground tabular-nums">{t("Calcul : {conge} − {pris} = {restant} j", { conge: fmtDays(d.conge), pris: fmtDays(d.pris), restant: fmtDays(d.restant) })}</span>}
          {d?.missingStart && <span className="mt-1 block font-medium text-amber-700 dark:text-amber-400">{t("Date d’entrée en service manquante : renseignez-la dans le formulaire ci-dessous pour calculer les congés.")}</span>}
          {!!balance?.initial_balance && <span className="mt-1 block text-xs">{t("Un ancien « solde initial » ({days} j) avait été saisi : il n’est plus utilisé. Vérifiez la date d’entrée en service et les congés pris avant le système.", { days: balance.initial_balance })}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((it) => (
            <div key={it.label} className={cn("rounded-lg border p-2.5", it.strong && "border-primary/40 bg-primary/5")}>
              <dt className="text-xs text-muted-foreground">{t(it.label)}</dt>
              <dd className={cn("mt-0.5 tabular-nums", it.strong ? "text-lg font-bold" : "font-semibold")}>{it.value}</dd>
              <dd className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <span className={cn("rounded px-1 font-medium", it.kind === "saisi" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300")}>
                  {it.kind === "saisi" ? t("saisi") : t("calculé")}
                </span>
                {it.hint}
              </dd>
            </div>
          ))}
        </dl>
        <Link href={`/conges/${employeeId}`} className="mt-3 inline-block text-sm text-primary underline-offset-2 hover:underline">
          {t("Historique des congés et des corrections")}
        </Link>
      </CardContent>
    </Card>
  );
}
