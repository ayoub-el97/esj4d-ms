"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, RotateCcw } from "lucide-react";
import { setPurchaseCancelled } from "@/lib/actions/purchases";
import type { Purchase, PurchasePayment } from "@/lib/data/purchases";
import { formatDateFr } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Annulation de l'achat (jamais supprimé) et paiements enregistrés avant la simplification (lecture seule). */
export function PurchaseSidePanel({ purchase, payments, canEdit }: { purchase: Purchase; payments: PurchasePayment[]; canEdit: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const unit = t("DH");
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <>
      {payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Paiements enregistrés")}</CardTitle>
            <CardDescription>{t("Saisis avant la simplification du module (conservés pour l'historique).")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {payments.map((p) => (
                <li key={p.id} className={p.cancelled ? "rounded-lg border border-dashed p-2 text-sm opacity-60" : "rounded-lg border p-2 text-sm"}>
                  <span className={p.cancelled ? "font-semibold line-through" : "font-semibold"}>{formatMoney(p.amount, unit)}</span>{" "}
                  <span className="text-muted-foreground">
                    {formatDateFr(p.payment_date)}
                    {p.method ? ` · ${p.method}` : ""}
                  </span>
                  {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
                  {p.cancelled && <p className="text-xs text-muted-foreground">{t("Annulé : {reason}", { reason: p.cancel_reason })}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Annulation")}</CardTitle>
            <CardDescription>{t("Un achat saisi par erreur est annulé avec un motif : il reste dans l'historique mais n'entre plus dans les totaux.")}</CardDescription>
          </CardHeader>
          <CardContent>
            {purchase.cancelled ? (
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => setPurchaseCancelled(purchase.id, false, ""))}>
                <RotateCcw /> {t("Rétablir l'achat")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() => {
                  const reason = window.prompt(t("Motif de l'annulation de l'achat (il reste dans l'historique mais sort des totaux) :"));
                  if (reason) run(() => setPurchaseCancelled(purchase.id, true, reason));
                }}
              >
                <Ban /> {t("Annuler l'achat")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
