import { requireModule } from "@/lib/auth";
import { UnderConstruction } from "@/components/under-construction";

export const metadata = { title: "Rapport journalier" };

export default async function Page() {
  await requireModule("rapport_journalier");
  return <UnderConstruction title="Rapport journalier" />;
}
