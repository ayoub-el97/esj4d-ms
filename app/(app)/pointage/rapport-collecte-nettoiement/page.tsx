import { redirect } from "next/navigation";
import { isISODate } from "@/lib/dates";

/** Ancienne adresse : ce rapport est désormais une partie de la page Pointage (Lieux de travail des agents). */
export default async function OldCombinedReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  redirect(isISODate(date) ? `/pointage/lieux-de-travail/historique/${date}` : "/pointage");
}
