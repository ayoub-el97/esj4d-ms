import { Lock, LockOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeFr } from "@/lib/dates";
import { getT } from "@/lib/i18n/server";
import type { WorkDay } from "@/lib/data/attendance";

export async function DayStatusBadge({ workDay }: { workDay: WorkDay | null }) {
  const t = await getT();
  if (workDay?.status === "closed") {
    return (
      <Badge variant="destructive" title={t("Clôturée le {date}", { date: formatDateTimeFr(workDay.closed_at) })}>
        <Lock /> {t("Journée clôturée")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <LockOpen /> {t("Journée ouverte")}
    </Badge>
  );
}
