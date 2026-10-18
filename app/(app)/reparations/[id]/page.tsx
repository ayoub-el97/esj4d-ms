import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getTrucks } from "@/lib/data/employees";
import { getRepair, getRepairHistory } from "@/lib/data/repairs";
import { formatDateFr, formatDateTimeFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { REPAIR_STATUS_LABELS, REPAIR_STATUS_STYLES, type RepairStatus } from "@/lib/repair-types";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RepairForm } from "../repair-form";

export const generateMetadata = pageTitle("Dossier de réparation");

const FIELD_LABELS: Record<string, string> = {
  truck_id: "Camion",
  reported_date: "Date du problème",
  problem_description: "Description du problème",
  problem_location: "Lieu",
  notes: "Notes",
  repair_date: "Date de réparation",
  repair_description: "Description de la réparation",
  status: "Statut",
  cost: "Coût",
  cancelled_expense: "Frais engagés",
  repair_notes: "Notes sur la réparation",
};

export default async function RepairPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const [user, t] = await Promise.all([requireModule("rapport_camions"), getT()]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [repair, trucks, history] = await Promise.all([getRepair(id), getTrucks(), getRepairHistory(id)]);
  if (!repair) notFound();
  const canEdit = user.permissions.rapport_camions.can_edit;
  const unit = t("DH");
  const status = (s: string | null) => (s ? t(REPAIR_STATUS_LABELS[s as RepairStatus] ?? s) : "—");

  return (
    <div className="mx-auto max-w-5xl">
      <ModuleHeader title={t("Dossier de réparation — {matricule}", { matricule: repair.truck?.matricule ?? "" })} subtitle={t("Problème signalé le {date}", { date: formatDateFr(repair.reported_date) })} backHref="/reparations">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", REPAIR_STATUS_STYLES[repair.status])}>{t(REPAIR_STATUS_LABELS[repair.status])}</span>
        <span className="text-sm font-medium">{repair.cost == null ? t("Coût non renseigné") : formatMoney(repair.cost, unit)}</span>
      </ModuleHeader>
      {sp.ok && (
        <Alert className="mb-4">
          <AlertDescription>{t("Problème enregistré. Complétez la réparation, les reçus et les photos après réparation dès que possible.")}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <RepairForm repair={repair} trucks={trucks} defaultDate={repair.reported_date} canEdit={canEdit} />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("Historique des modifications")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {history.length === 0 && <li className="text-muted-foreground">{t("Aucun historique disponible.")}</li>}
              {history.map((h, i) => (
                <li key={i} className="border-s-2 border-primary/30 ps-3">
                  <div className="font-medium">{h.action === "INSERT" ? t("Création") : t("Modification")}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTimeFr(h.at)} · {h.user_email ?? t("utilisateur inconnu")}
                  </div>
                  {h.action === "UPDATE" && h.old_status !== h.new_status && (
                    <div className="text-xs">
                      {t("Statut")} : {status(h.old_status)} → <strong>{status(h.new_status)}</strong>
                    </div>
                  )}
                  {h.action === "UPDATE" && h.old_cost !== h.new_cost && (
                    <div className="text-xs">
                      {t("Coût")} : {h.old_cost == null ? "—" : formatMoney(h.old_cost, unit)} → <strong>{h.new_cost == null ? "—" : formatMoney(h.new_cost, unit)}</strong>
                    </div>
                  )}
                  {h.action === "UPDATE" && h.changed.filter((c) => c !== "status" && c !== "cost").length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {t("Champs modifiés : {fields}", {
                        fields: h.changed
                          .filter((c) => c !== "status" && c !== "cost")
                          .map((c) => t(FIELD_LABELS[c] ?? c))
                          .join(", "),
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
      <ModuleButtons pdfSlot={<PdfExportButton kind="reparation" params={{ id: repair.id }} label="PDF du dossier" />} historyHref={`/reparations/camion/${repair.truck_id}`} monthlyHref="/reparations/rapport" />
    </div>
  );
}
