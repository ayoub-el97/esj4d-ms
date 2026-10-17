"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Power, Trash2 } from "lucide-react";
import { deleteTeamLead, saveTeamLead, setTeamLeadActive } from "@/lib/actions/company";
import type { TeamLead } from "@/lib/data/settings";
import { useT } from "@/lib/i18n/client";
import { TEAM_LABELS, type ActionResult } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

export function TeamLeadsUI({ leads, employees, canEdit }: { leads: TeamLead[]; employees: { id: string; label: string }[]; canEdit: boolean }) {
  const { t } = useT();
  const [editing, setEditing] = useState<TeamLead | null>(null);
  const [state, action] = useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const r = await saveTeamLead(prev, fd);
    if (r.ok) setEditing(null);
    return r;
  }, null);
  const [pending, start] = useTransition();
  const employeeNames = new Map(employees.map((e) => [e.id, e.label]));

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader>
          <CardTitle>{t("Chefs d'équipe ({count})", { count: leads.length })}</CardTitle>
          <CardDescription>{t("Proposés dans l'en-tête des feuilles de présence.")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Nom")}</TableHead>
                <TableHead>{t("Équipe")}</TableHead>
                <TableHead>{t("Téléphone")}</TableHead>
                <TableHead>{t("Employé lié")}</TableHead>
                <TableHead>{t("Statut")}</TableHead>
                {canEdit && <TableHead className="text-end">{t("Actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t("Aucun chef d'équipe enregistré.")}
                  </TableCell>
                </TableRow>
              )}
              {leads.map((l) => (
                <TableRow key={l.id} className={!l.is_active ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">{l.full_name}</TableCell>
                  <TableCell>{l.team_type ? t(TEAM_LABELS[l.team_type]) : t("Les deux")}</TableCell>
                  <TableCell dir="ltr">{l.phone || "—"}</TableCell>
                  <TableCell>{l.employee_id ? (employeeNames.get(l.employee_id) ?? "—") : "—"}</TableCell>
                  <TableCell>{l.is_active ? <Badge>{t("Actif")}</Badge> : <Badge variant="destructive">{t("Inactif")}</Badge>}</TableCell>
                  {canEdit && (
                    <TableCell className="space-x-1 whitespace-nowrap text-end">
                      <Button variant="outline" size="icon-sm" onClick={() => setEditing(l)} aria-label={t("Modifier")}>
                        <Pencil />
                      </Button>
                      <Button variant="outline" size="icon-sm" disabled={pending} onClick={() => run(() => setTeamLeadActive(l.id, !l.is_active))} aria-label={l.is_active ? t("Désactiver") : t("Réactiver")}>
                        <Power />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label={t("Supprimer")}
                        onClick={() => window.confirm(t("Supprimer ce chef d'équipe ?")) && run(() => deleteTeamLead(l.id))}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>{editing ? t("Modifier {name}", { name: editing.full_name }) : t("Nouveau chef d'équipe")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form key={editing?.id ?? "new"} action={action} className="space-y-3">
              <input type="hidden" name="id" value={editing?.id ?? ""} />
              <ActionMessage state={state} />
              <div className="space-y-1">
                <Label htmlFor="full_name">{t("Nom complet")}</Label>
                <Input id="full_name" name="full_name" defaultValue={editing?.full_name} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="team_type">{t("Équipe")}</Label>
                <NativeSelect id="team_type" name="team_type" defaultValue={editing?.team_type ?? ""}>
                  <option value="">{t("Les deux")}</option>
                  <option value="collecte">{t("Collecte")}</option>
                  <option value="nettoiement">{t("Nettoiement")}</option>
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">{t("Téléphone")}</Label>
                <Input id="phone" name="phone" defaultValue={editing?.phone} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="employee_id">{t("Employé lié (facultatif)")}</Label>
                <NativeSelect id="employee_id" name="employee_id" defaultValue={editing?.employee_id ?? ""}>
                  <option value="">{t("— Aucun —")}</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex gap-2">
                <SubmitButton className="flex-1">{editing ? t("Enregistrer") : t("Ajouter")}</SubmitButton>
                {editing && (
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    {t("Annuler")}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
