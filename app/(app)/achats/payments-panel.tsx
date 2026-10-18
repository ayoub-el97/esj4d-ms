"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Plus, RotateCcw } from "lucide-react";
import { addPurchasePayment, cancelPurchasePayment, setPurchaseCancelled } from "@/lib/actions/purchases";
import type { Purchase, PurchasePayment } from "@/lib/data/purchases";
import { formatDateFr, todayISO } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/purchase-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

export function PaymentsPanel({ purchase, payments, canEdit }: { purchase: Purchase; payments: PurchasePayment[]; canEdit: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const unit = t("DH");
  const [state, action] = useActionState(addPurchasePayment, null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      router.refresh();
    }
  }, [state, router]);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Paiements")}</CardTitle>
        <CardDescription>
          {t("Payé : {paid} · Reste à payer : {due}", { paid: formatMoney(purchase.amount_paid, unit), due: formatMoney(purchase.amount_due, unit) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {payments.length === 0 && <p className="text-sm text-muted-foreground">{t("Aucun paiement enregistré.")}</p>}
        <ul className="space-y-2">
          {payments.map((p) => (
            <li key={p.id} className={p.cancelled ? "rounded-lg border border-dashed p-2 text-sm opacity-60" : "rounded-lg border p-2 text-sm"}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={p.cancelled ? "font-semibold line-through" : "font-semibold"}>{formatMoney(p.amount, unit)}</span>
                <span className="text-muted-foreground">
                  {formatDateFr(p.payment_date)}
                  {p.method ? ` · ${p.method}` : ""}
                </span>
                {canEdit && !p.cancelled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ms-auto"
                    disabled={pending}
                    onClick={() => {
                      const reason = window.prompt(t("Motif de l'annulation de ce paiement :"));
                      if (reason) run(() => cancelPurchasePayment(p.id, reason));
                    }}
                  >
                    <Ban /> {t("Annuler")}
                  </Button>
                )}
              </div>
              {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
              {p.cancelled && <p className="text-xs text-muted-foreground">{t("Annulé : {reason}", { reason: p.cancel_reason })}</p>}
            </li>
          ))}
        </ul>

        {canEdit && !purchase.cancelled && purchase.amount_due > 0 && (
          <form action={action} className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <input type="hidden" name="purchase_id" value={purchase.id} />
            <ActionMessage state={state && !state.ok ? state : null} />
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="pay_amount">{t("Montant ({unit})", { unit })}</Label>
                <Input id="pay_amount" name="amount" type="number" step="0.01" min="0.01" max={purchase.amount_due} inputMode="decimal" defaultValue={purchase.amount_due} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pay_date">{t("Date du paiement")}</Label>
                <Input id="pay_date" name="payment_date" type="date" defaultValue={todayISO()} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pay_method">{t("Mode")}</Label>
                <Input id="pay_method" name="method" list="pay-methods" defaultValue={purchase.payment_method} />
                <datalist id="pay-methods">
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={t(m)} />
                  ))}
                </datalist>
              </div>
            </div>
            <Input name="note" placeholder={t("Note (facultatif), ex. n° de chèque")} />
            <SubmitButton size="sm">
              <Plus /> {t("Ajouter un paiement")}
            </SubmitButton>
          </form>
        )}

        {canEdit && (
          <div className="border-t pt-3">
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
