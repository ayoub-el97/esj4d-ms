import { requireModule } from "@/lib/auth";
import { getEmployees } from "@/lib/data/employees";
import { getLeaveRequests } from "@/lib/data/leaves";
import { formatMonthFr, isMonth, monthRange } from "@/lib/dates";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { LeaveRequestsTable } from "../tables";
import { RequestFilters } from "../request-filters";

export const generateMetadata = pageTitle("Historique des congés");

type SP = { q?: string; employee?: string; status?: string; from?: string; to?: string; mois?: string };

export default async function CongesHistoriquePage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, { t, locale }] = await Promise.all([requireModule("conges"), getI18n()]);
  const sp = await searchParams;
  const range = isMonth(sp.mois) ? monthRange(sp.mois) : { from: sp.from, to: sp.to };
  const filters = { q: sp.q, employee: sp.employee, status: sp.status, from: range.from, to: range.to };
  const [requests, employees] = await Promise.all([getLeaveRequests(filters), getEmployees()]);
  const pdfParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) if (v) pdfParams[k] = v;

  return (
    <div>
      <ModuleHeader title={t("Historique des congés")} subtitle={isMonth(sp.mois) ? formatMonthFr(sp.mois, locale) : t("{count} demande(s)", { count: requests.length })} backHref="/conges?section=demande-conge" />
      <RequestFilters employees={employees} sp={{ ...sp, ...range }} />
      <LeaveRequestsTable requests={requests} canEdit={user.permissions.conges.can_edit} />
      <ModuleButtons pdfSlot={<PdfExportButton kind="conges-historique" params={pdfParams} />} />
    </div>
  );
}
