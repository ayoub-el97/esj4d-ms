"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import type { ReminderWithStatus } from "@/lib/data/reminders";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RemindersPanel } from "@/components/reminders-panel";

const KEY = "rappels-affiches";

/**
 * À l'ouverture de l'application : fenêtre des rappels du jour et en retard, une seule fois par
 * session et par jour (préférence d'affichage du navigateur). La liste reste ensuite sur l'accueil.
 */
export function DueRemindersDialog({ reminders, today }: { reminders: ReminderWithStatus[]; today: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!reminders.length) return;
    let seen = "";
    try {
      seen = window.sessionStorage.getItem(KEY) ?? "";
    } catch {
      seen = "";
    }
    if (seen === today) return;
    // Ouverture différée : évite un rendu en cascade au chargement de la page
    const timer = window.setTimeout(() => setOpen(true), 300);
    return () => window.clearTimeout(timer);
  }, [reminders.length, today]);

  const close = () => {
    try {
      window.sessionStorage.setItem(KEY, today);
    } catch {
      /* stockage indisponible : la fenêtre pourra réapparaître, sans autre conséquence */
    }
    setOpen(false);
  };

  const overdue = reminders.filter((r) => r.status.state === "overdue").length;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className={cn("size-5", overdue ? "text-red-600" : "text-orange-600")} /> {t("Rappels à traiter")}
          </DialogTitle>
          <DialogDescription>
            {overdue ? t("{count} rappel(s) du jour, dont {late} en retard.", { count: reminders.length, late: overdue }) : t("{count} rappel(s) prévu(s) aujourd'hui.", { count: reminders.length })}
          </DialogDescription>
        </DialogHeader>
        <RemindersPanel reminders={reminders} today={today} hideCreate />
        <DialogFooter>
          <Link href="/rappels" className="text-sm text-primary hover:underline" onClick={close}>
            {t("Tous les rappels")}
          </Link>
          <Button onClick={close}>{t("Fermer")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
