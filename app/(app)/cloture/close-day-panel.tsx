"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, LockOpen } from "lucide-react";
import { closeDay, reopenDay } from "@/lib/actions/attendance";
import { formatDateFr } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Msg = { key: string; vars?: Record<string, string | number> };
export type CloseCheck = { key: string; label: Msg; href: string; missing: Msg[] };

export function CloseDayPanel({ date, closed, canClose, canReopen, checks = [] }: { date: string; closed: boolean; canClose: boolean; canReopen: boolean; checks?: CloseCheck[] }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [ack, setAck] = useState(false);
  const incomplete = checks.filter((c) => c.missing.length > 0);
  const [reason, setReason] = useState("");

  const doClose = () =>
    start(async () => {
      const r = await closeDay(date);
      setConfirm(false);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });

  const doReopen = () =>
    start(async () => {
      const r = await reopenDay(date, reason);
      if (r.ok) {
        toast.success(r.message);
        setReason("");
        router.refresh();
      } else toast.error(r.error);
    });

  if (!closed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("Clôture manuelle")}</CardTitle>
          <CardDescription>
            {t("La clôture fige les données de la journée (pointage, rapports, photos). Elle ne supprime rien et n'est jamais automatique : vous pouvez saisir les informations finales le lendemain avant de clôturer.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {incomplete.length > 0 && <p className="mb-3 rounded-lg bg-orange-50 p-2 text-sm text-orange-800 dark:bg-orange-950/30 dark:text-orange-300">{t("Attention : {count} rapport(s) de la journée sont incomplets (photos ou lieux manquants).", { count: incomplete.length })}</p>}
          <Button variant="destructive" disabled={!canClose || pending} onClick={() => { setAck(false); setConfirm(true); }}>
            <Lock /> {t("Clôturer la journée du {date}", { date: formatDateFr(date) })}
          </Button>
          {!canClose && <p className="mt-2 text-xs text-muted-foreground">{t("Votre rôle ne permet pas de clôturer une journée.")}</p>}

          <Dialog open={confirm} onOpenChange={setConfirm}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("Confirmer la clôture")}</DialogTitle>
                <DialogDescription>
                  {t("Après clôture, la journée du {date} ne pourra plus être modifiée, sauf réouverture par un administrateur avec justification. Toutes les données restent consultables dans l'historique.", { date: formatDateFr(date) })}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-72 space-y-2 overflow-y-auto text-sm">
                <p className="font-medium">{t("Rapports de la journée ({count})", { count: checks.length })}</p>
                {checks.length === 0 && <p className="text-muted-foreground">{t("Aucun rapport saisi pour cette journée.")}</p>}
                {checks.map((c) => (
                  <div key={c.key} className={c.missing.length ? "rounded-lg border border-orange-300 bg-orange-50 p-2 dark:bg-orange-950/30" : "rounded-lg border p-2"}>
                    <a href={c.href} className="font-medium hover:underline">
                      {c.missing.length ? "⚠ " : "✓ "}
                      {t(c.label.key, c.label.vars)}
                    </a>
                    {c.missing.length > 0 && <p className="text-xs text-orange-800 dark:text-orange-300">{t("Manquant : {items}", { items: c.missing.map((m) => t(m.key, m.vars)).join(", ") })}</p>}
                  </div>
                ))}
              </div>
              {incomplete.length > 0 && (
                <label className="flex items-start gap-2 rounded-lg bg-muted p-2 text-sm">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4" />
                  <span>{t("{count} rapport(s) incomplet(s). Je confirme vouloir clôturer quand même (réouverture possible par un administrateur).", { count: incomplete.length })}</span>
                </label>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(false)} disabled={pending}>
                  {t("Annuler")}
                </Button>
                <Button variant="destructive" onClick={doClose} disabled={pending || (incomplete.length > 0 && !ack)}>
                  <Lock /> {t("Confirmer la clôture")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Réouverture")}</CardTitle>
        <CardDescription>{t("Réservée aux administrateurs. Le motif est enregistré dans le journal d'audit.")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canReopen ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="reason">{t("Motif de la réouverture")}</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Ex. correction du tonnage du camion 77027-A-1")} />
            </div>
            <Button disabled={pending || reason.trim().length < 5} onClick={doReopen}>
              <LockOpen /> {t("Rouvrir la journée")}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("Contactez un administrateur pour rouvrir cette journée.")}</p>
        )}
      </CardContent>
    </Card>
  );
}
