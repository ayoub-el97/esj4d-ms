import Link from "next/link";
import { fmtDays, leaveDashboard } from "@/lib/leave-method";
import { CalendarPlus, History, RotateCcw, Scale, Search, Timer } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { getAvailableCredits, getLeaveBalances, getLeaveRequests, getRecoveryBalances, getRecoveryRequests } from "@/lib/data/leaves";
import { formatDateFr, isISODate, todayISO } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { POSITION_LABELS, TEAM_LABELS, ALL_POSITIONS } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LeaveRequestForm, RecoveryRequestForm } from "./leaves-ui";
import { LeaveRequestsTable, RecoveryRequestsTable } from "./tables";

export const generateMetadata = pageTitle("Congé / Récupération");

type Section = "demande-conge" | "demande-recuperation" | "solde-conges" | "solde-recuperation";
const SECTIONS: Section[] = ["demande-conge", "demande-recuperation", "solde-conges", "solde-recuperation"];
type SP = { section?: string; q?: string; equipe?: string; date?: string; from?: string; to?: string; poste?: string; statut?: string };

export default async function CongesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, t] = await Promise.all([requireModule("conges"), getT()]);
  const sp = await searchParams;
  const section: Section = SECTIONS.find((s) => s === sp.section) ?? "demande-conge";
  const canEdit = user.permissions.conges.can_edit;

  const tabs: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: "demande-conge", label: t("Nouvelle demande congé"), icon: <CalendarPlus /> },
    { key: "demande-recuperation", label: t("Nouvelle demande récupération"), icon: <RotateCcw /> },
    { key: "solde-conges", label: t("Solde de congés"), icon: <Scale /> },
    { key: "solde-recuperation", label: t("Solde de récupération"), icon: <Timer /> },
  ];

  return (
    <div>
      <ModuleHeader title={t("Congé / Récupération")}>
        <LinkButton href="/conges/historique" variant="outline" size="sm">
          <History /> {t("Historique des congés")}
        </LinkButton>
        <LinkButton href="/conges/recuperation" variant="outline" size="sm">
          <History /> {t("Historique des récupérations")}
        </LinkButton>
      </ModuleHeader>

      <nav className="mb-6 flex flex-wrap gap-2 border-b pb-3" aria-label={t("Sections")}>
        {tabs.map((x) => (
          <LinkButton key={x.key} href={`/conges?section=${x.key}`} variant={section === x.key ? "default" : "outline"}>
            {x.icon} {x.label}
          </LinkButton>
        ))}
      </nav>

      {section === "demande-conge" && <LeaveRequestSection canEdit={canEdit} />}
      {section === "demande-recuperation" && <RecoveryRequestSection canEdit={canEdit} />}
      {section === "solde-conges" && <LeaveBalanceSection sp={sp} />}
      {section === "solde-recuperation" && <RecoveryBalanceSection sp={sp} />}

      <ModuleButtons historyHref="/conges/historique" />
    </div>
  );
}

async function LeaveRequestSection({ canEdit }: { canEdit: boolean }) {
  const [t, employees, pending, recent] = await Promise.all([getT(), getEmployees({ onlyActive: true }), getLeaveRequests({ status: "en_attente" }), getLeaveRequests({}, 15)]);
  const recentDecided = recent.filter((r) => r.status !== "en_attente");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <div>
          <h2 className="mb-2 font-semibold">{t("Demandes de congé en attente ({count})", { count: pending.length })}</h2>
          <LeaveRequestsTable requests={pending} canEdit={canEdit} />
        </div>
        <div>
          <h2 className="mb-2 font-semibold">{t("Dernières décisions")}</h2>
          <LeaveRequestsTable requests={recentDecided} canEdit={canEdit} />
        </div>
      </div>
      {canEdit && <LeaveRequestForm employees={employees.map((e) => ({ id: e.id, label: `${employeeName(e)} (${e.matricule})` }))} />}
    </div>
  );
}

async function RecoveryRequestSection({ canEdit }: { canEdit: boolean }) {
  const [t, employees, pending, recent, credits] = await Promise.all([getT(), getEmployees({ onlyActive: true }), getRecoveryRequests({ status: "en_attente" }), getRecoveryRequests({}, 15), getAvailableCredits()]);
  const recentDecided = recent.filter((r) => r.status !== "en_attente");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <div>
          <h2 className="mb-2 font-semibold">{t("Demandes de récupération en attente ({count})", { count: pending.length })}</h2>
          <RecoveryRequestsTable requests={pending} canEdit={canEdit} />
        </div>
        <div>
          <h2 className="mb-2 font-semibold">{t("Dernières décisions")}</h2>
          <RecoveryRequestsTable requests={recentDecided} canEdit={canEdit} />
        </div>
      </div>
      {canEdit && <RecoveryRequestForm employees={employees.map((e) => ({ id: e.id, label: `${employeeName(e)} (${e.matricule})` }))} credits={credits} />}
    </div>
  );
}

async function BalanceFilters({ section, sp, withPeriod }: { section: Section; sp: SP; withPeriod: boolean }) {
  const t = await getT();
  return (
    <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-5">
      <input type="hidden" name="section" value={section} />
      <div className="space-y-1">
        <Label htmlFor="q">{t("Recherche (nom ou matricule)")}</Label>
        <Input id="q" name="q" defaultValue={sp.q} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="equipe">{t("Équipe")}</Label>
        <NativeSelect id="equipe" name="equipe" defaultValue={sp.equipe ?? ""}>
          <option value="">{t("Toutes")}</option>
          <option value="collecte">{t("Collecte")}</option>
          <option value="nettoiement">{t("Nettoiement")}</option>
        </NativeSelect>
      </div>
      {withPeriod ? (
        <>
          <div className="space-y-1">
            <Label htmlFor="from">{t("Du")}</Label>
            <Input id="from" name="from" type="date" defaultValue={sp.from} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">{t("Au")}</Label>
            <Input id="to" name="to" type="date" defaultValue={sp.to ?? todayISO()} />
          </div>
        </>
      ) : (
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="date">{t("Date de référence")}</Label>
          <Input id="date" name="date" type="date" defaultValue={sp.date ?? todayISO()} />
        </div>
      )}
      <div className="flex items-end">
        <Button type="submit">
          <Search /> {t("Filtrer")}
        </Button>
      </div>
    </form>
  );
}

async function LeaveBalanceSection({ sp }: { sp: SP }) {
  const t = await getT();
  const asOf = isISODate(sp.date) ? sp.date : todayISO();
  const rows = await getLeaveBalances(asOf, { team: sp.equipe, q: sp.q, position: sp.poste, status: sp.statut });
  const pdfParams: Record<string, string> = { date: asOf };
  if (sp.equipe) pdfParams.equipe = sp.equipe;
  if (sp.q) pdfParams.q = sp.q;
  if (sp.poste) pdfParams.poste = sp.poste;
  if (sp.statut) pdfParams.statut = sp.statut;
  return (
    <div>
      <BalanceFilters section="solde-conges" sp={sp} withPeriod={false} />
      <form className="-mt-2 mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="section" value="solde-conges" />
        {sp.q && <input type="hidden" name="q" value={sp.q} />}
        {sp.equipe && <input type="hidden" name="equipe" value={sp.equipe} />}
        {sp.date && <input type="hidden" name="date" value={sp.date} />}
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
          <Label htmlFor="statut">{t("Statut")}</Label>
          <NativeSelect id="statut" name="statut" defaultValue={sp.statut ?? ""}>
            <option value="">{t("Actifs")}</option>
            <option value="inactifs">{t("Inactifs")}</option>
            <option value="tous">{t("Tous")}</option>
            <option value="a-completer">{t("À compléter (ni date d'entrée ni solde initial)")}</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          <Search /> {t("Filtrer")}
        </Button>
      </form>
      <p className="mb-2 text-xs text-muted-foreground">
        {t("Solde congé : 1,5 jour par mois complet de service depuis la date d'entrée en service. Solde pris : congés pris avant le système + congés approuvés déjà pris dans l'application. Solde restant = Solde congé − Solde pris. Calcul au {date}.", { date: formatDateFr(asOf) })}
      </p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Nom et prénom")}</TableHead>
              <TableHead>{t("Date d’entrée en service")}</TableHead>
              <TableHead className="text-end">{t("Solde congé")}</TableHead>
              <TableHead className="text-end">{t("Solde pris")}</TableHead>
              <TableHead className="text-end">{t("Solde restant")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("Aucun employé ne correspond aux filtres.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((b) => {
              const d = leaveDashboard(b);
              return (
                <TableRow key={b.employee_id} className={!b.is_active ? "opacity-60" : undefined}>
                  <TableCell>
                    <Link href={`/conges/${b.employee_id}?date=${asOf}`} className="font-medium hover:underline">
                      {b.name}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">
                      {[b.position ? t(POSITION_LABELS[b.position]) : "", b.team_type ? t(TEAM_LABELS[b.team_type]) : "", b.method === "solde_initial" ? t("solde initial confirmé") : "", !b.is_active ? t("Inactif") : ""].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {b.hire_date ? formatDateFr(b.hire_date) : <span className="text-xs font-medium text-destructive">{t("Date manquante — à compléter")}</span>}
                  </TableCell>
                  {d.missingStart ? (
                    <TableCell colSpan={3} className="text-end text-xs text-muted-foreground">
                      {t("Non calculé : renseignez la date d’entrée en service")}
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="text-end tabular-nums" title={b.adjustments ? t("dont corrections : {days} j", { days: b.adjustments }) : undefined}>
                        {fmtDays(d.conge)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums" title={t("Avant le système : {before} j · depuis le système : {after} j", { before: fmtDays(b.taken_before ?? 0), after: fmtDays(b.taken) })}>
                        {fmtDays(d.pris)}
                      </TableCell>
                      <TableCell className="text-end">
                        <Badge variant={d.restant < 0 ? "destructive" : "secondary"}>{fmtDays(d.restant)}</Badge>
                        {d.restant < 0 && <div className="mt-0.5 text-[10px] font-medium text-destructive">{t("À vérifier")}</div>}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3">
        <PdfExportButton kind="conges-soldes" params={pdfParams} />
      </div>
    </div>
  );
}

async function RecoveryBalanceSection({ sp }: { sp: SP }) {
  const t = await getT();
  const to = isISODate(sp.to) ? sp.to : todayISO();
  const from = isISODate(sp.from) ? sp.from : null;
  const rows = await getRecoveryBalances(from, to, { team: sp.equipe, q: sp.q });
  const pdfParams: Record<string, string> = { to };
  if (from) pdfParams.from = from;
  if (sp.equipe) pdfParams.equipe = sp.equipe;
  if (sp.q) pdfParams.q = sp.q;
  return (
    <div>
      <BalanceFilters section="solde-recuperation" sp={sp} withPeriod />
      <p className="mb-2 text-xs text-muted-foreground">
        {t("Solde = jours de récupération acquis − jours effectivement pris + corrections, au {date}. Les colonnes « période » comptent les jours entre les dates choisies.", { date: formatDateFr(to) })}
      </p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("NB")}</TableHead>
              <TableHead>{t("Matricule")}</TableHead>
              <TableHead>{t("Nom et prénom")}</TableHead>
              <TableHead>{t("Équipe")}</TableHead>
              <TableHead>{t("Poste")}</TableHead>
              <TableHead className="text-end">{t("Repos travaillés (période)")}</TableHead>
              <TableHead className="text-end">{t("Récupération acquise (période)")}</TableHead>
              <TableHead className="text-end">{t("Récupération prise (période)")}</TableHead>
              <TableHead className="text-end">{t("En attente")}</TableHead>
              <TableHead className="text-end">{t("Solde restant")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  {t("Aucun employé ne correspond aux filtres.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((b) => (
              <TableRow key={b.employee_id}>
                <TableCell>{b.order_number}</TableCell>
                <TableCell className="font-mono text-xs">{b.matricule}</TableCell>
                <TableCell>
                  <Link href={`/conges/${b.employee_id}?date=${to}`} className="font-medium hover:underline">
                    {b.name}
                  </Link>
                </TableCell>
                <TableCell>{b.team_type ? t(TEAM_LABELS[b.team_type]) : ""}</TableCell>
                <TableCell>{b.position ? t(POSITION_LABELS[b.position]) : ""}</TableCell>
                <TableCell className="text-end">{b.credits_period}</TableCell>
                <TableCell className="text-end">{b.credits_period}</TableCell>
                <TableCell className="text-end">{b.taken_period}</TableCell>
                <TableCell className="text-end text-muted-foreground">{b.pending || ""}</TableCell>
                <TableCell className="text-end">
                  <Badge variant={b.balance < 0 ? "destructive" : "secondary"}>{b.balance}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3">
        <PdfExportButton kind="recuperation-soldes" params={pdfParams} />
      </div>
    </div>
  );
}
