"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createCollectionReport } from "@/lib/actions/reports";
import type { Truck } from "@/lib/data/employees";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";

export function NewCollectionReport({ date, trucks }: { date: string; trucks: Truck[] }) {
  const router = useRouter();
  const [truckId, setTruckId] = useState(trucks[0]?.id ?? "");
  const [pending, start] = useTransition();

  if (trucks.length === 0) return <span className="text-xs text-muted-foreground">Tous les camions ont un rapport pour cette date.</span>;

  return (
    <div className="flex items-center gap-2">
      <NativeSelect className="w-auto" value={truckId} onChange={(e) => setTruckId(e.target.value)} aria-label="Camion">
        {trucks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.matricule} {t.brand && `— ${t.brand}`}
          </option>
        ))}
      </NativeSelect>
      <Button
        size="sm"
        disabled={!truckId || pending}
        onClick={() =>
          start(async () => {
            const r = await createCollectionReport(date, truckId);
            if (r.ok && r.data) router.push(`/rapport-journalier/collecte/${r.data.id}`);
            else if (!r.ok) toast.error(r.error);
          })
        }
      >
        <Plus /> Nouveau rapport camion
      </Button>
    </div>
  );
}
