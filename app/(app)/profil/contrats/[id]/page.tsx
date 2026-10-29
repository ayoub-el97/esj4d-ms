import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getContract, getContractDeletionInfo, getContractSummary } from "@/lib/data/contracts";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_STYLES, contractPeriod } from "@/lib/contract-types";
import { formatDateFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { PdfExportButton } from "@/components/pdf-export-button";
import { PhotoUploader } from "@/components/photo-uploader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractForm, ContractLifecycle, DeleteContractButton, ExportAllButton } from "../contracts-ui";

export const generateMetadata = pageTitle("Contrat");

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, t] = await Promise.all([requireModule("parametres"), getT()]);
  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) notFound();
  const canEdit = user.permissions.parametres.can_edit;
  const isAdmin = user.role === "admin";
  const closed = contract.status === "termine" || contract.status === "archive";
  const [summary, deletion] = await Promise.all([getContractSummary(id), isAdmin && closed ? getContractDeletionInfo(id) : Promise.resolve(null)]);
  const p = contractPeriod(contract);
  const s = summary ?? {};
  const n = (k: string) => Number((s as Record<string, unknown>)[k] ?? 0);
  const facts: [string, string][] = [
    ["Jours de pointage", String(n("pointage_jours"))],
    ["Rapports de nettoiement", String(n("rapports_nettoiement"))],
    ["Rapports de collecte", String(n("rapports_collecte"))],
    ["Tonnage", `${n("tonnage").toLocaleString("fr-FR", { maximumFractionDigits: 2 })} t`],
    ["Achats", formatMoney(n("achats_total"), t("DH"))],
    ["Réparations", formatMoney(n("reparations_cout"), t("DH"))],
    ["Carburant", formatMoney(n("carburant_cout"), t("DH"))],
    ["Absences (jours)", String(n("absences"))],
    ["Photos et pièces jointes", String(n("photos"))],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ModuleHeader title={t("Contrat {ref}", { ref: contract.reference })} subtitle={t("du {from} au {to}", { from: formatDateFr(p.from), to: formatDateFr(p.to) })} backHref="/profil/contrats">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", CONTRACT_STATUS_STYLES[contract.status])}>{t(CONTRACT_STATUS_LABELS[contract.status])}</span>
      </ModuleHeader>

      <Card>
        <CardHeader>
          <CardTitle>{t("Rapports du contrat")}</CardTitle>
          <CardDescription>{t("Enregistrements dont la date est comprise dans la période du contrat ({from} → {to}).", { from: formatDateFr(p.from), to: formatDateFr(p.to) })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-lg border p-2">
                <dt className="text-xs text-muted-foreground">{t(k)}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-start gap-4">
            <PdfExportButton kind="contrat" params={{ id }} label="Télécharger le rapport du contrat en PDF" />
            <ExportAllButton contractId={id} reference={contract.reference} />
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Cycle de vie du contrat")}</CardTitle>
            {contract.closed_on && (
              <CardDescription>
                {t("Clôturé le {date}", { date: formatDateFr(contract.closed_on) })}
                {contract.closure_note ? ` — ${contract.closure_note}` : ""}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <ContractLifecycle contract={contract} isAdmin={isAdmin} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("Informations du contrat")}</CardTitle>
          {closed && <CardDescription>{t("Contrat clôturé : lecture seule. Un administrateur peut le rouvrir.")}</CardDescription>}
        </CardHeader>
        <CardContent>
          {canEdit && !closed ? (
            <ContractForm contract={contract} />
          ) : (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t("Référence du contrat")}</dt>
                <dd className="font-medium">{contract.reference}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("Rappels avant la fin (jours)")}</dt>
                <dd>{contract.alert_days}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("Date de début du contrat")}</dt>
                <dd>{formatDateFr(contract.start_date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("Date de fin du contrat")}</dt>
                <dd>{formatDateFr(contract.end_date)}</dd>
              </div>
              {contract.description && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">{t("Description / Objet du contrat")}</dt>
                  <dd className="whitespace-pre-line">{contract.description}</dd>
                </div>
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Documents du contrat")}</CardTitle>
          <CardDescription>{t("Contrat signé, avenants… (photos ou scans).")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoUploader entityType="company_contract" entityId={contract.id} phase="document" activityDate={null} photos={contract.photos} canEdit={canEdit} title={t("Documents")} />
        </CardContent>
      </Card>

      {isAdmin && closed && deletion && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">{t("Suppression définitive")}</CardTitle>
            <CardDescription>{t("Distincte de l'archivage : un contrat archivé reste disponible tant qu'il n'est pas supprimé définitivement.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteContractButton contract={contract} blocker={deletion.blocker} items={deletion.items} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
