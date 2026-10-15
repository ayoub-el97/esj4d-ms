"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilePlus2, Save, UserMinus, UserPlus } from "lucide-react";
import { addCleaningAgent, createCleaningReport, removeCleaningAgent, updateCleaningAgent, updateCleaningReport } from "@/lib/actions/reports";
import type { CleaningAgent, CleaningReport } from "@/lib/data/reports";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/native-select";
import { PhotoUploader } from "@/components/photo-uploader";

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
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newAgent, setNewAgent] = useState("");
  const [observations, setObservations] = useState(report?.observations ?? "");

  if (!report) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <p className="text-muted-foreground">Aucun rapport de nettoiement pour cette date.</p>
        {canEdit ? (
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await createCleaningReport(date);
                if (r.ok) {
                  toast.success(r.message);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            <FilePlus2 /> Créer le rapport (prérempli depuis le pointage)
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Vous ne pouvez pas créer de rapport (journée clôturée ou droits insuffisants).</p>
        )}
      </div>
    );
  }

  const available = employeeOptions.filter((o) => !agents.some((a) => a.employee_id === o.id));

  return (
    <div className="space-y-4">
      {agents.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun agent dans ce rapport. Ajoutez-en avec le bouton ci-dessous.</p>}

      {agents.map((a) => (
        <AgentCard key={a.id} agent={a} date={date} canEdit={canEdit} />
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Observations générales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea value={observations} disabled={!canEdit} onChange={(e) => setObservations(e.target.value)} placeholder="Commentaires sur la journée…" />
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
              <Save /> Enregistrer les observations
            </Button>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <Button variant="outline" onClick={() => { setNewAgent(available[0]?.id ?? ""); setAdding(true); }}>
          <UserPlus /> Ajouter un agent au rapport
        </Button>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un agent</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">L&apos;ajout concerne uniquement ce rapport ; la feuille de présence n&apos;est pas modifiée.</p>
          <NativeSelect value={newAgent} onChange={(e) => setNewAgent(e.target.value)}>
            {available.length === 0 && <option value="">Tous les employés sont déjà dans le rapport</option>}
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Annuler
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
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentCard({ agent, date, canEdit }: { agent: CleaningAgent; date: string; canEdit: boolean }) {
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
          <span className="mr-2 text-muted-foreground">#{agent.order_number}</span>
          {agent.name}
        </CardTitle>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Retirer ${agent.name} du rapport (ses photos seront supprimées) ?`)) return;
              start(async () => {
                const r = await removeCleaningAgent(agent.id);
                if (r.ok) {
                  toast.success(r.message);
                  router.refresh();
                } else toast.error(r.error);
              });
            }}
          >
            <UserMinus /> Retirer
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`loc-${agent.id}`}>Lieu de travail</Label>
            <Input id={`loc-${agent.id}`} value={location} disabled={!canEdit} placeholder="Ex. Secteur 2, avenue …" onChange={(e) => setLocation(e.target.value)} onBlur={() => location !== agent.location && saveField({ location })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`com-${agent.id}`}>Commentaire / observation</Label>
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
