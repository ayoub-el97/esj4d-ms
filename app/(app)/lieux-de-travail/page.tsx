import { Suspense } from "react";
import { History } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { isISODate, todayISO } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { WORK_LOCATIONS_TITLE } from "@/lib/modules";
import { DateField } from "@/components/date-field";
import { DayNav } from "@/components/day-nav";
import { LinkButton } from "@/components/link-button";
import { WorkLocationsDay } from "./day-report";

export const generateMetadata = pageTitle(WORK_LOCATIONS_TITLE);

export default async function WorkLocationsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [user, t] = await Promise.all([requireModule("rapport_journalier"), getT()]);
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  return (
    <WorkLocationsDay
      user={user}
      date={date}
      nav={
        <Suspense>
          <DateField value={date} />
          <DayNav value={date} />
        </Suspense>
      }
      actions={
        <LinkButton href="/lieux-de-travail/historique" variant="outline">
          <History /> {t("Historique")}
        </LinkButton>
      }
    />
  );
}
