import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { isISODate } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { WORK_LOCATIONS_TITLE } from "@/lib/modules";
import { LinkButton } from "@/components/link-button";
import { WorkLocationsDay } from "../../day-report";

export const generateMetadata = pageTitle(WORK_LOCATIONS_TITLE);

export default async function WorkLocationsDatePage({ params }: { params: Promise<{ date: string }> }) {
  const [user, t] = await Promise.all([requireModule("rapport_journalier"), getT()]);
  const { date } = await params;
  if (!isISODate(date)) notFound();
  return (
    <WorkLocationsDay
      user={user}
      date={date}
      actions={
        <LinkButton href="/lieux-de-travail/historique" variant="outline">
          <ArrowLeft className="rtl:rotate-180" /> {t("Retour à l'historique")}
        </LinkButton>
      }
    />
  );
}
