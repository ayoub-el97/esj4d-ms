"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilePlus2, Save, UserMinus, UserPlus } from "lucide-react";
import { addCleaningAgent, removeCleaningAgent, updateCleaningAgent, updateCleaningReport } from "@/lib/actions/reports";
import { LinkButton } from "@/components/link-button";
import { SyncReportsButton } from "@/components/sync-reports-button";
import type { CleaningAgent, CleaningReport } from "@/lib/data/reports";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/native-select";
import { PhotoUploader } from "@/components/photo-uploader";
import { PhotoStatusBadge, needsAfterPhotos } from "@/components/photo-status-badge";

export function CleaningReportUI({
  date,
  report,
  agents,
  canEdit,
  employeeOptions,
}: {
  date: string;
  report: CleaningReport | null;
  agents: CleaningAgent[];
  canEdit: boolean;
  employeeOptions: { id: string; label: string }[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newAgent, setNewAgent] = useState("");
  const [observations, setObservations] = useState(report?.observations ?? "");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const missingAfter = agents.filter((a) => needsAfterPhotos(a.photosAvant.length, a.photosApres.length)).length;
  const shownAgents = onlyMissing ? agents.filter((a) => needsAfterPhotos(a.photosAvant.length, a.photosApres.length)) : agents;

  if (!report) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <p className="text-muted-foreground">{t("Aucun rapport de nettoiement pour cette date.")}</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("Le rapport se remplit automatiquement dès que la feuille de présence nettoiement est enregistrée : chaque agent qui a travaillé y figure avec son lieu de travail et ses photos avant / après.")}
        </p>
        {canEdit ? (
          <div className="flex flex-wrap justify-center gap-2">
            <LinkButton href={`/pointage/nettoiement?date=${date}`} variant="default" size="sm">
              <FilePlus2 /> {t("Ouvrir la feuille de présence")}
            </LinkButton>
            <SyncReportsButton date={date} team="nettoiement" label="Remplir depuis le pointage déjà enregistré" />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("Vous ne pouvez pas créer de rapport (journée clôturée ou droits insuffisants).")}</p>
        )}
      </div>
    );
  }

  const available = employeeOptions.filter((o) => !agents.some((a) => a.employee_id === o.id));

  return (
    <div className="space-y-4">
      {agents.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("Aucun agent dans ce rapport. Ajoutez-en avec le bouton ci-dessous.")}</p>}

      {agents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {missingAfter > 0 ? (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-800 dark:bg-orange-950 dark:text-orange-300">{t("{count} agent(s) : photos APRÈS à ajouter", { count: missingAfter })}</span>
          ) : (
            <span className="text-muted-foreground">{t("Photos APRÈS : rien en attente.")}</span>
          )}
          {(missingAfter > 0 || onlyMissing) && (
            <label className="ms-auto inline-flex items-center gap-2">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="size-4 accent-indigo-600" />
              {t("Afficher seulement les agents sans photos APRÈS")}
            </label>
          )}
        </div>
      )}
      {shownAgents.map((a) => (
        <AgentCard key={a.id} agent={a} date={date} canEdit={canEdit} />
      ))}

      <Card>
        <CardHeader>
          <CardTitle>{t("Observations générales")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea value={observations} disabled={!canEdit} onChange={(e) => setObservations(e.target.value)} placeholder={t("Commentaires sur la journée…")} />
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending || observations === report.observations}
              onClick={() =>
                start(async () => {
                  const r = await updateCleaningReport(report.id, observations);
                  if (r.ok) {
                    toast.success(r.message);
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              <Save /> {t("Enregistrer les observations")}
            </Button>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setNewAgent(available[0]?.id ?? "");
              setAdding(true);
            }}
          >
            <UserPlus /> {t("Ajouter un agent au rapport")}
          </Button>
          <SyncReportsButton date={date} team="nettoiement" />
          <span className="text-xs text-muted-foreground">{t("Le rapport suit le pointage ; les lieux et photos déjà saisis sont conservés.")}</span>
        </div>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Ajouter un agent")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("L'ajout concerne uniquement ce rapport ; la feuille de présence n'est pas modifiée.")}</p>
          <NativeSelect value={newAgent} onChange={(e) => setNewAgent(e.target.value)}>
            {available.length === 0 && <option value="">{t("Tous les employés sont déjà dans le rapport")}</option>}
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>
              {t("Annuler")}
            </Button>
            <Button
              disabled={!newAgent || pending}
              onClick={() =>
                start(async () => {
                  const r = await addCleaningAgent(report.id, date, newAgent);
                  if (r.ok) {
                    toast.success(r.message);
                    setAdding(false);
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              {t("Ajouter")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentCard({ agent, date, canEdit }: { agent: CleaningAgent; date: string; canEdit: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [location, setLocation] = useState(agent.location);
  const [comment, setComment] = useState(agent.comment);
  const [pending, start] = useTransition();

  const saveField = (patch: { location?: string; comment?: string }) =>
    start(async () => {
      const r = await updateCleaningAgent(agent.id, patch);
      if (!r.ok) toast.error(r.error);
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          <span className="me-2 text-muted-foreground">#{agent.order_number}</span>
          {agent.name}
          <PhotoStatusBadge before={agent.photosAvant.length} after={agent.photosApres.length} className="ms-2 align-middle" />
        </CardTitle>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("Retirer {name} du rapport (ses photos seront supprimées) ?", { name: agent.name }))) return;
              start(async () => {
                const r = await removeCleaningAgent(agent.id);
                if (r.ok) {
                  toast.success(r.message);
                  router.refresh();
                } else toast.error(r.error);
              });
            }}
          >
            <UserMinus /> {t("Retirer")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`loc-${agent.id}`}>{t("Lieu de travail")}</Label>
            <Input id={`loc-${agent.id}`} value={location} disabled={!canEdit} placeholder={t("Ex. Secteur 2, avenue …")} onChange={(e) => setLocation(e.target.value)} onBlur={() => location !== agent.location && saveField({ location })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`com-${agent.id}`}>{t("Commentaire / observation")}</Label>
            <Input id={`com-${agent.id}`} value={comment} disabled={!canEdit} onChange={(e) => setComment(e.target.value)} onBlur={() => comment !== agent.comment && saveField({ comment })} />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <PhotoUploader entityType="cleaning_report_agent" entityId={agent.id} phase="avant" activityDate={date} employeeId={agent.employee_id} location={location} photos={agent.photosAvant} canEdit={canEdit} />
          <PhotoUploader entityType="cleaning_report_agent" entityId={agent.id} phase="apres" activityDate={date} employeeId={agent.employee_id} location={location} photos={agent.photosApres} canEdit={canEdit} />
        </div>
      </CardContent>
    </Card>
  );
}
