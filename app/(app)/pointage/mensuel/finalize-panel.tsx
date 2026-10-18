"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, RefreshCw } from "lucide-react";
import { finalizePeriod } from "@/lib/actions/attendance-grid";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Finaliser la période (version 1) ou enregistrer une nouvelle version (motif obligatoire). */
export function FinalizePanel({ month, alreadyFinalized }: { month: string; alreadyFinalized: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  const run = () =>
    start(async () => {
      const r = await finalizePeriod(month, reason);
      if (r.ok) {
        toast.success(r.message, { duration: 7000 });
        setReason("");
        setOpen(false);
        router.refresh();
      } else toast.error(r.error, { duration: 8000 });
    });

  if (!alreadyFinalized) {
    return (
      <Button
        disabled={pending}
        onClick={() => {
          if (window.confirm(t("Finaliser la période ? La grille actuelle (employés, codes et totaux) sera conservée telle quelle dans l'historique. Toute mise à jour ultérieure créera une nouvelle version, avec un motif."))) run();
        }}
      >
        <Lock /> {t("Finaliser la période")}
      </Button>
    );
  }
  if (!open)
    return (
      <Button variant="outline" disabled={pending} onClick={() => setOpen(true)}>
        <RefreshCw /> {t("Enregistrer une nouvelle version")}
      </Button>
    );
  return (
    <div className="w-full space-y-2 rounded-lg border bg-card p-3">
      <label htmlFor="grid-reason" className="text-sm font-medium">
        {t("Motif de la mise à jour (obligatoire)")}
      </label>
      <Textarea id="grid-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Ex. correction du pointage du 12/09 après réouverture de la journée…")} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || reason.trim().length < 5} onClick={run}>
          {t("Enregistrer la version")}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
          {t("Annuler")}
        </Button>
      </div>
    </div>
  );
}
