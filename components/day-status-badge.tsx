import { Lock, LockOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeFr } from "@/lib/dates";
import type { WorkDay } from "@/lib/data/attendance";

export function DayStatusBadge({ workDay }: { workDay: WorkDay | null }) {
  if (workDay?.status === "closed") {
    return (
      <Badge variant="destructive" title={`Clôturée le ${formatDateTimeFr(workDay.closed_at)}`}>
        <Lock /> Journée clôturée
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <LockOpen /> Journée ouverte
    </Badge>
  );
}
