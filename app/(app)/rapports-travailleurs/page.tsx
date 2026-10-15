import { requireModule } from "@/lib/auth";
import { UnderConstruction } from "@/components/under-construction";

export const metadata = { title: "Rapports travailleurs" };

export default async function Page() {
  await requireModule("rapports_travailleurs");
  return <UnderConstruction title="Rapports travailleurs" />;
}
