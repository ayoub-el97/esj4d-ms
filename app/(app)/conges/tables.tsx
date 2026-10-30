import Link from "next/link";
import type { LeaveRequest, RecoveryRequest } from "@/lib/data/leaves";
import { formatDateFr } from "@/lib/dates";
import type { TFunction } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DecisionButtons, DeleteLeaveRequestButton, EditLeaveRequestButton, StatusBadge } from "./leaves-ui";
import { employeeName, getEmployees } from "@/lib/data/employees";

/** Décision : date, puis « Acceptée par : » et le nom, l'un sous l'autre. */
function Decision({ at, by, note, status, t }: { at: string | null; by: string; note: string; status: string; t: TFunction }) {
  if (!at) return <span className="text-muted-foreground">—</span>;
  const label = status === "acceptee" ? t("Acceptée par :") : status === "refusee" ? t("Refusée par :") : status === "annulee" ? t("Annulée par :") : t("Décidé par :");
  return (
    <div className="max-w-40 leading-tight whitespace-normal">
      <div className="tabular-nums">{formatDateFr(at.slice(0, 10))}</div>
      {by && (
        <>
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div>{by}</div>
        </>
      )}
      {note && (
        <div className="line-clamp-2 text-[11px] text-muted-foreground italic" title={note}>
          « {note} »
        </div>
      )}
    </div>
  );
}

/** Tableau compact : texte 12 px, petites marges, en-têtes sur deux lignes si besoin. */
const COMPACT = "[&_td]:px-1.5 [&_td]:py-1.5 [&_td]:align-top [&_td]:text-xs [&_th]:h-auto [&_th]:px-1.5 [&_th]:py-1 [&_th]:text-xs [&_th]:leading-tight [&_th]:whitespace-normal";

export async function LeaveRequestsTable({ requests, canEdit, showEmployee = true }: { requests: LeaveRequest[]; canEdit: boolean; showEmployee?: boolean }) {
  const t = await getT();
  // Modification : employés actifs, plus ceux des demandes affichées (même partis depuis)
  const concerned = new Set(requests.map((r) => r.employee_id));
  const employeeOptions = canEdit && requests.length ? (await getEmployees()).filter((e) => e.is_active || concerned.has(e.id)).map((e) => ({ id: e.id, label: employeeName(e) })) : [];
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table className={COMPACT}>
        <TableHeader>
          <TableRow>
            {showEmployee && <TableHead>{t("Employé")}</TableHead>}
            <TableHead>{t("Date de la demande")}</TableHead>
            <TableHead>{t("Période")}</TableHead>
            <TableHead className="text-end">{t("Jours demandés")}</TableHead>
            <TableHead>{t("Statut")}</TableHead>
            <TableHead>{t("Décision")}</TableHead>
            {canEdit && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                {t("Aucune demande.")}
              </TableCell>
            </TableRow>
          )}
          {requests.map((r) => (
            <TableRow key={r.id}>
              {showEmployee && (
                <TableCell className="font-medium">
                  <Link href={`/conges/${r.employee_id}`} className="hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{r.matricule}</div>
                </TableCell>
              )}
              <TableCell className="tabular-nums">{formatDateFr(r.request_date)}</TableCell>
              <TableCell className="leading-tight tabular-nums">
                <div>
                  <span className="text-muted-foreground">{t("Du")}</span> {formatDateFr(r.start_date)}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("Au")}</span> {formatDateFr(r.end_date)}
                </div>
              </TableCell>
              <TableCell className="text-end">
                {r.requested_days}
                {!!r.rest_days_excluded && (
                  <div className="text-[11px] font-normal text-indigo-700 dark:text-indigo-300" title={(r.segments ?? []).map((x) => (x.from === x.to ? formatDateFr(x.from) : `${formatDateFr(x.from)} → ${formatDateFr(x.to)}`)).join(" ; ")}>
                    {t("{count} j de repos exclus", { count: r.rest_days_excluded })}
                    {(r.segments ?? []).length > 1 && <span className="block">{t("{count} périodes", { count: (r.segments ?? []).length })}</span>}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge status={r.status} source={r.source} />
                {r.source === "pointage" && (
                  <Link href={`/pointage/historique?date=${r.start_date}`} className="mt-0.5 block text-[11px] text-muted-foreground hover:underline">
                    {t("Source : Pointage")}
                  </Link>
                )}
              </TableCell>
              <TableCell>
                <Decision at={r.decided_at} by={r.decided_by_name} note={r.decision_note} status={r.status} t={t} />
              </TableCell>
              {canEdit && (
                <TableCell>
                  <div className="flex w-52 flex-wrap items-center justify-end gap-1">
                    <EditLeaveRequestButton employees={employeeOptions} request={{ id: r.id, employee_id: r.employee_id, request_date: r.request_date, start_date: r.start_date, end_date: r.end_date, requested_days: r.requested_days, reason: r.reason }} />
                    <DeleteLeaveRequestButton request={{ id: r.id, name: r.name, start_date: r.start_date, end_date: r.end_date, status: r.status, source: r.source }} />
                    <DecisionButtons id={r.id} status={r.status} kind="conge" canEdit />
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export async function RecoveryRequestsTable({ requests, canEdit, showEmployee = true }: { requests: RecoveryRequest[]; canEdit: boolean; showEmployee?: boolean }) {
  const t = await getT();
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {showEmployee && <TableHead>{t("Employé")}</TableHead>}
            <TableHead>{t("Date de la demande")}</TableHead>
            <TableHead>{t("Repos travaillé le")}</TableHead>
            <TableHead>{t("Récupération le")}</TableHead>
            <TableHead className="text-end">{t("Jours demandés")}</TableHead>
            <TableHead>{t("Statut")}</TableHead>
            <TableHead>{t("Commentaire")}</TableHead>
            <TableHead>{t("Décision")}</TableHead>
            {canEdit && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                {t("Aucune demande.")}
              </TableCell>
            </TableRow>
          )}
          {requests.map((r) => (
            <TableRow key={r.id}>
              {showEmployee && (
                <TableCell className="font-medium">
                  <Link href={`/conges/${r.employee_id}`} className="hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{r.matricule}</div>
                </TableCell>
              )}
              <TableCell>{formatDateFr(r.request_date)}</TableCell>
              <TableCell>{formatDateFr(r.worked_rest_date)}</TableCell>
              <TableCell>{formatDateFr(r.recovery_date)}</TableCell>
              <TableCell className="text-end">{r.requested_days}</TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
              </TableCell>
              <TableCell className="max-w-48 truncate">{r.comment}</TableCell>
              <TableCell>
                <Decision at={r.decided_at} by={r.decided_by_name} note={r.decision_note} status={r.status} t={t} />
              </TableCell>
              {canEdit && (
                <TableCell>
                  <DecisionButtons id={r.id} status={r.status} kind="recuperation" canEdit />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
