import Link from "next/link";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getAbsenceSummary, getCertificateRows, syncAbsenceAlerts } from "@/lib/data/absences";
import { CertificateDocuments } from "@/components/certificate-documents";
import { CertificateStateSelect, CreateCertificateButton } from "./absences-ui";
import { getProjectStart } from "@/lib/data/settings";
import { formatDateFr, isISODate, todayISO, workMonthOf, workMonthRange } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ABSENCE_ALERT_SHORT, ABSENCE_ALERT_STYLES, CERTIFICATE_STATE_LABELS, CERTIFICATE_STATE_STYLES, certificateState } from "@/lib/absence-types";
import { ALL_POSITIONS, POSITION_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const generateMetadata = pageTitle("Rapport des absents");

type SP = { q?: string; poste?: string; from?: string; to?: string; type?: string; inactifs?: string };

export default async function AbsencesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, t] = await Promise.all([requireModule("pointage"), getT()]);
  const sp = await searchParams;
  const projectStart = await getProjectStart();
  // Période par défaut : mois de pointage en cours
  const month = workMonthRange(workMonthOf(todayISO(), projectStart), projectStart);
  const from = isISODate(sp.from) ? sp.from : sp.from === "" ? undefined : month.from;
  const to = isISODate(sp.to) ? sp.to : sp.to === "" ? undefined : month.to;
  // Rappels du jour créés / retirés selon la politique d'absences (sans doublon)
  await syncAbsenceAlerts().catch(() => undefined);
  const all = await getAbsenceSummary(from, to);

  const term = (sp.q ?? "").trim().toLowerCase();
  const rows = all
    .filter((r) => r.employee.is_active || r.total > 0 || sp.inactifs === "1")
    .filter((r) => !sp.poste || r.employee.position === sp.poste)
    .filter((r) => !term || r.name.toLowerCase().includes(term) || (r.employee.matricule ?? "").toLowerCase().includes(term))
    .filter((r) => (sp.type === "non_justifiee" ? r.non_justifiee > 0 : sp.type === "maladie" ? r.maladie > 0 : sp.type === "absents" ? r.total > 0 : true));
  const canEdit = user.permissions.pointage.can_edit;
  // Certificats directement sur cette page : mêmes filtres (employé, poste), même période
  const visible = new Set(rows.map((r) => r.employee.id));
  const certRows = canEdit ? (await getCertificateRows(from, to)).filter((c) => visible.has(c.employee_id)) : [];
  const sum = (k: "total" | "non_justifiee" | "maladie" | "certificates") => rows.reduce((s, r) => s + r[k], 0);

  const kpis = [
    { label: t("Absences sur la période"), value: sum("total"), cls: "" },
    { label: t("Absences non justifiées"), value: sum("non_justifiee"), cls: "text-red-700 dark:text-red-400" },
    { label: t("Absences maladie"), value: sum("maladie"), cls: "text-orange-700 dark:text-orange-400" },
    { label: t("Engagement écrit requis"), value: all.filter((r) => r.alert === "engagement_requis").length, cls: "text-orange-700 dark:text-orange-400" },
    { label: t("Décision du responsable requise"), value: all.filter((r) => r.alert === "decision_requise").length, cls: "text-red-700 dark:text-red-400" },
    { label: t("Certificats en attente / à vérifier"), value: all.reduce((s, r) => s + r.certificates_pending, 0), cls: "" },
  ];

  return (
    <div>
      <ModuleHeader title={t("Rapport des absents")} subtitle={from || to ? t("du {from} au {to}", { from: from ? formatDateFr(from) : "…", to: to ? formatDateFr(to) : "…" }) : t("toutes dates")} backHref="/pointage" />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className={cn("mt-1 text-xl font-semibold tabular-nums", k.cls)}>{k.value}</p>
          </div>
        ))}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {t("Source : le pointage. Un jour « Absent » ou « Absent maladie » compte une seule fois par employé ; Repos, Congé payé et Récupération ne sont pas des absences. Alertes : 2e absence non justifiée → engagement écrit ; plus de 4 → décision du responsable (cumul de toutes les absences non justifiées).")}
      </p>

      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="q">{t("Employé (nom ou matricule)")}</Label>
          <Input id="q" name="q" defaultValue={sp.q} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="poste">{t("Poste")}</Label>
          <NativeSelect id="poste" name="poste" defaultValue={sp.poste ?? ""}>
            <option value="">{t("Tous")}</option>
            {ALL_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {t(POSITION_LABELS[p])}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="type">{t("Type d'absence")}</Label>
          <NativeSelect id="type" name="type" defaultValue={sp.type ?? ""}>
            <option value="">{t("Tous les employés")}</option>
            <option value="absents">{t("Employés avec absences")}</option>
            <option value="non_justifiee">{t("Absences non justifiées")}</option>
            <option value="maladie">{t("Absences maladie")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={from ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={to ?? ""} />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-6">
          <Button type="submit">
            <Search /> {t("Filtrer")}
          </Button>
          <LinkButton href="/pointage/absences?from=&to=" variant="outline">
            {t("Toutes dates")}
          </LinkButton>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="inactifs" value="1" defaultChecked={sp.inactifs === "1"} className="size-4" /> {t("Inclure les employés inactifs")}
          </label>
        </div>
      </form>

      {canEdit && (
        <section id="certificats" className="mb-4 scroll-mt-20 space-y-3 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">{t("Absences maladie — certificats médicaux")}</h2>
          {certRows.length === 0 && <p className="text-sm text-muted-foreground">{t("Aucune absence maladie sur cette période. Un employé mis « Absent maladie » au pointage apparaît ici automatiquement.")}</p>}
          {certRows.map((c) => {
            const state = c.certificate ? certificateState(c.certificate.status, c.certificate.verification) : "en_attente";
            return (
              <div key={c.certificate?.id ?? `${c.employee_id}-${c.from}`} className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/pointage/absences/${c.employee_id}`} className="font-semibold hover:underline">
                    {c.name}
                  </Link>
                  <span>{c.from === c.to ? formatDateFr(c.from) : t("du {from} au {to}", { from: formatDateFr(c.from), to: formatDateFr(c.to) })}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", CERTIFICATE_STATE_STYLES[state])}>{t(CERTIFICATE_STATE_LABELS[state])}</span>
                  {c.certificate?.submitted_on && <span className="text-xs text-muted-foreground">{t("remis le {date}", { date: formatDateFr(c.certificate.submitted_on) })}</span>}
                  {c.certificate && (
                    <span className="ms-auto">
                      <CertificateStateSelect certificate={c.certificate} />
                    </span>
                  )}
                </div>
                {c.certificate ? (
                  <CertificateDocuments certificateId={c.certificate.id} employeeId={c.employee_id} files={c.certificate.photos} canEdit fileLabel={`certificat-${c.name.replace(/[^\p{L}\d]+/gu, "-")}-${c.from}`} />
                ) : (
                  <CreateCertificateButton employeeId={c.employee_id} from={c.from} to={c.to} />
                )}
              </div>
            );
          })}
        </section>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("N°")}</TableHead>
              <TableHead>{t("Nom et prénom")}</TableHead>
              <TableHead>{t("Poste")}</TableHead>
              <TableHead className="text-end">{t("Non justifiées")}</TableHead>
              <TableHead className="text-end">{t("Maladie")}</TableHead>
              <TableHead className="text-end">{t("Total")}</TableHead>
              <TableHead className="text-end">{t("Certificats")}</TableHead>
              <TableHead>{t("Alerte / suivi")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {t("Aucun employé ne correspond aux filtres.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={r.employee.id} className={!r.employee.is_active ? "opacity-60" : undefined}>
                <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <Link href={`/pointage/absences/${r.employee.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell className="text-xs">{t(POSITION_LABELS[r.employee.position])}</TableCell>
                <TableCell className={cn("text-end tabular-nums", r.non_justifiee > 0 && "font-semibold text-red-700 dark:text-red-400")}>{r.non_justifiee}</TableCell>
                <TableCell className="text-end tabular-nums">{r.maladie}</TableCell>
                <TableCell className="text-end font-semibold tabular-nums">{r.total}</TableCell>
                <TableCell className="text-end tabular-nums">
                  {r.certificates}
                  {r.certificates_pending > 0 && <span className="ms-1 text-xs text-orange-700">({t("{count} en attente", { count: r.certificates_pending })})</span>}
                </TableCell>
                <TableCell>
                  {r.alert === "aucune" ? (
                    <span className="text-xs text-muted-foreground">{t("Aucune alerte")}</span>
                  ) : (
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", ABSENCE_ALERT_STYLES[r.alert])} title={t("{count} absence(s) non justifiée(s) au total", { count: r.unjustified_all })}>
                      {t(ABSENCE_ALERT_SHORT[r.alert])} ({r.unjustified_all})
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>{t("Total ({count} employé(s))", { count: rows.length })}</TableCell>
                <TableCell className="text-end tabular-nums">{sum("non_justifiee")}</TableCell>
                <TableCell className="text-end tabular-nums">{sum("maladie")}</TableCell>
                <TableCell className="text-end tabular-nums">{sum("total")}</TableCell>
                <TableCell className="text-end tabular-nums">{sum("certificates")}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      {!user.permissions.pointage.can_edit && <p className="mt-3 text-xs text-muted-foreground">{t("Consultation seule : les certificats médicaux et les documents signés sont réservés aux utilisateurs autorisés à modifier le pointage.")}</p>}
    </div>
  );
}
