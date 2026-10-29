import Link from "next/link";
import type { LeaveBalance } from "@/lib/data/leaves";
import { formatDateFr } from "@/lib/dates";
import type { TFunction } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Résumé des congés payés de la fiche employé : valeurs saisies (registres) et calculées. */
export function LeaveSummary({ t, employeeId, hireDate, balance }: { t: TFunction; employeeId: string; hireDate: string | null; balance: LeaveBalance | null }) {
  const taken = balance?.taken ?? 0;
  const before = balance?.taken_before ?? null;
  const items: { label: string; value: string; kind: "saisi" | "calcule"; strong?: boolean; hint?: string }[] = [
    { label: "Date de début de travail", value: hireDate ? formatDateFr(hireDate) : t("Non renseignée"), kind: "saisi" },
    { label: "Congés acquis", value: `${balance?.accrued ?? 0} ${t("j")}`, kind: "calcule", hint: balance?.accrual_from ? t("depuis le {date}", { date: formatDateFr(balance.accrual_from) }) : t("aucun décompte (date de début inconnue)") },
    { label: "Congés déjà pris", value: before == null ? "—" : `${before} ${t("j")}`, kind: "saisi", hint: t("avant le système, information") },
    { label: "Solde initial", value: `${balance?.initial_balance ?? 0} ${t("j")}`, kind: "saisi", hint: balance?.tracking_start ? t("au {date}", { date: formatDateFr(balance.tracking_start) }) : undefined },
    { label: "Congés pris depuis le système", value: `${taken} ${t("j")}`, kind: "calcule", hint: t("congés approuvés") },
    { label: "Total des congés pris", value: `${taken + (before ?? 0)} ${t("j")}`, kind: "calcule" },
    { label: "Solde restant", value: `${balance?.balance ?? 0} ${t("j")}`, kind: "calcule", strong: true, hint: balance?.adjustments ? t("dont corrections : {days} j", { days: balance.adjustments }) : undefined },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Congés payés")}</CardTitle>
        <CardDescription>{t("Solde restant = solde initial + congés acquis depuis le début du suivi − congés approuvés pris depuis le début du suivi + corrections.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
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
