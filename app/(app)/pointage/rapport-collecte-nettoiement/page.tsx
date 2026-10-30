import { redirect } from "next/navigation";
import { isISODate } from "@/lib/dates";

/** Ancienne adresse : ce rapport est désormais une section à part (أماكن اشتغال العمال). */
export default async function OldCombinedReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  redirect(isISODate(date) ? `/lieux-de-travail/historique/${date}` : "/lieux-de-travail");
}
