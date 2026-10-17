import { requireModule } from "@/lib/auth";
import { getEmployees } from "@/lib/data/employees";
import { getRecoveryRequests } from "@/lib/data/leaves";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { RecoveryRequestsTable } from "../tables";
import { RequestFilters } from "../request-filters";

export const generateMetadata = pageTitle("Historique des récupérations");

type SP = { q?: string; employee?: string; status?: string; from?: string; to?: string };

export default async function RecuperationHistoriquePage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, t] = await Promise.all([requireModule("conges"), getT()]);
  const sp = await searchParams;
  const [requests, employees] = await Promise.all([getRecoveryRequests(sp), getEmployees()]);
  const pdfParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v) pdfParams[k] = v;

  return (
    <div>
      <ModuleHeader title={t("Historique des récupérations")} subtitle={t("{count} demande(s)", { count: requests.length })} backHref="/conges?section=demande-recuperation" />
      <RequestFilters employees={employees} sp={sp} />
      <RecoveryRequestsTable requests={requests} canEdit={user.permissions.conges.can_edit} />
      <ModuleButtons pdfSlot={<PdfExportButton kind="recuperation-historique" params={pdfParams} />} />
    </div>
  );
}
