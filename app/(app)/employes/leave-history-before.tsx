"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { deleteLeaveHistoryBefore, saveLeaveHistoryBefore } from "@/lib/actions/leaves";
import type { LeaveHistoryBefore } from "@/lib/data/leaves";
import { formatDateFr, formatDateTimeFr } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

/** « Historique des congés avant le système » (registres papier) : saisie et correction par l'administrateur. */
export function LeaveHistoryBeforeCard({ employeeId, entries, canEdit, method }: { employeeId: string; entries: LeaveHistoryBefore[]; canEdit: boolean; method: "solde_initial" | "pris_avant" }) {
  const { t } = useT();
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, start] = useTransition();
  const total = entries.reduce((s, h) => s + h.days, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Historique des congés avant le système")}</CardTitle>
        <CardDescription>
          {t("Total : {days} j", { days: total })} ·{" "}
          {method === "pris_avant" ? t("Méthode A : ces jours sont déduits du solde.") : t("Méthode B : déjà compris dans le solde initial, jamais déduits une seconde fois.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.length === 0 && <p className="text-sm text-muted-foreground">{t("Aucun congé saisi avant le système.")}</p>}
        {entries.map((h) =>
          editing === h.id ? (
            <EntryForm key={h.id} employeeId={employeeId} entry={h} onDone={() => setEditing(null)} />
          ) : (
            <div key={h.id} className="flex flex-wrap items-start gap-2 rounded-lg border p-2 text-sm">
              <span className="font-semibold tabular-nums">{t("{days} j", { days: h.days })}</span>
              <span className="text-muted-foreground">
                {h.start_date ? (h.end_date && h.end_date !== h.start_date ? t("du {from} au {to}", { from: formatDateFr(h.start_date), to: formatDateFr(h.end_date) }) : formatDateFr(h.start_date)) : t("dates non précisées")}
              </span>
              {h.note && <span className="w-full text-xs">{h.note}</span>}
              <span className="w-full text-[11px] text-muted-foreground">
                {t("Saisi le {date} par {user}", { date: formatDateTimeFr(h.created_at), user: h.created_by_name || "—" })}
                {h.updated_at !== h.created_at && h.updated_by_name ? ` · ${t("modifié le {date} par {user}", { date: formatDateTimeFr(h.updated_at), user: h.updated_by_name })}` : ""}
              </span>
              {canEdit && (
                <span className="ms-auto flex gap-1">
                  <Button type="button" size="icon-xs" variant="ghost" title={t("Modifier")} onClick={() => setEditing(h.id)}>
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    title={t("Supprimer")}
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(t("Supprimer cette ligne de congés pris avant le système ? (conservée dans le journal)"))) return;
                      start(async () => {
                        const r = await deleteLeaveHistoryBefore(h.id);
                        if (r.ok) {
                          toast.success(r.message);
                          router.refresh();
                        } else toast.error(r.error);
                      });
                    }}
                  >
                    <Trash2 />
                  </Button>
                </span>
              )}
            </div>
          ),
        )}
        {canEdit &&
          (editing === "new" ? (
            <EntryForm employeeId={employeeId} onDone={() => setEditing(null)} />
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing("new")}>
              <Plus /> {t("Ajouter des congés pris avant le système")}
            </Button>
          ))}
        {!canEdit && <p className="text-xs text-muted-foreground">{t("Modifiable par l'administrateur uniquement.")}</p>}
      </CardContent>
    </Card>
  );
}

function EntryForm({ employeeId, entry, onDone }: { employeeId: string; entry?: LeaveHistoryBefore; onDone: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(saveLeaveHistoryBefore, null);
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      router.refresh();
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={action} className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <input type="hidden" name="id" value={entry?.id ?? ""} />
      <input type="hidden" name="employee_id" value={employeeId} />
      <ActionMessage state={state && !state.ok ? state : null} />
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>{t("Jours de congé pris")}</Label>
          <Input type="number" name="days" step="0.5" min="0.5" defaultValue={entry?.days ?? ""} required />
        </div>
        <div className="space-y-1">
          <Label>{t("Du (facultatif)")}</Label>
          <Input type="date" name="start_date" defaultValue={entry?.start_date ?? ""} />
        </div>
        <div className="space-y-1">
          <Label>{t("Au (facultatif)")}</Label>
          <Input type="date" name="end_date" defaultValue={entry?.end_date ?? ""} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>{t("Note (facultatif)")}</Label>
        <Input name="note" defaultValue={entry?.note ?? ""} placeholder={t("Ex. registre papier 2025, page 12")} />
      </div>
      <div className="flex gap-2">
        <SubmitButton size="sm">
          <Save /> {t("Enregistrer")}
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t("Annuler")}
        </Button>
      </div>
    </form>
  );
}
