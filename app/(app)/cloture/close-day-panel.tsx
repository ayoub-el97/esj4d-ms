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

export function CloseDayPanel({ date, closed, canClose, canReopen }: { date: string; closed: boolean; canClose: boolean; canReopen: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
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
          <Button variant="destructive" disabled={!canClose || pending} onClick={() => setConfirm(true)}>
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
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(false)} disabled={pending}>
                  {t("Annuler")}
                </Button>
                <Button variant="destructive" onClick={doClose} disabled={pending}>
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
