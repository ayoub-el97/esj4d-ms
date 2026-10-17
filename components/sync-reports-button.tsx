"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { syncReportsFromAttendance } from "@/lib/actions/reports";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

/** Remplit ou met à jour le rapport journalier d'une date à partir du pointage. */
export function SyncReportsButton({ date, team, label = "Mettre à jour depuis le pointage" }: { date: string; team: "nettoiement" | "collecte"; label?: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await syncReportsFromAttendance(date, team);
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} /> {t(label)}
    </Button>
  );
}
