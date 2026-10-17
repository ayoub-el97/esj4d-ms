import Link from "next/link";
import type { LeaveRequest, RecoveryRequest } from "@/lib/data/leaves";
import { formatDateFr, formatDateTimeFr } from "@/lib/dates";
import { getT } from "@/lib/i18n/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DecisionButtons, StatusBadge } from "./leaves-ui";

function Decision({ at, by, note }: { at: string | null; by: string; note: string }) {
  if (!at) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-xs text-muted-foreground">
      {formatDateTimeFr(at)}
      {by && ` · ${by}`}
      {note && <div className="italic">« {note} »</div>}
    </span>
  );
}

export async function LeaveRequestsTable({ requests, canEdit, showEmployee = true }: { requests: LeaveRequest[]; canEdit: boolean; showEmployee?: boolean }) {
  const t = await getT();
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {showEmployee && <TableHead>{t("Employé")}</TableHead>}
            <TableHead>{t("Date de la demande")}</TableHead>
            <TableHead>{t("Du")}</TableHead>
            <TableHead>{t("Au")}</TableHead>
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
              <TableCell>{formatDateFr(r.start_date)}</TableCell>
              <TableCell>{formatDateFr(r.end_date)}</TableCell>
              <TableCell className="text-end">{r.requested_days}</TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
              </TableCell>
              <TableCell className="max-w-48 truncate">{r.reason}</TableCell>
              <TableCell>
                <Decision at={r.decided_at} by={r.decided_by_name} note={r.decision_note} />
              </TableCell>
              {canEdit && (
                <TableCell>
                  <DecisionButtons id={r.id} status={r.status} kind="conge" canEdit />
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
                <Decision at={r.decided_at} by={r.decided_by_name} note={r.decision_note} />
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
