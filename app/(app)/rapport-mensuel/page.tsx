import { requireModule } from "@/lib/auth";
import { UnderConstruction } from "@/components/under-construction";

export const metadata = { title: "Rapport mensuel" };

export default async function Page() {
  await requireModule("rapport_mensuel");
  return <UnderConstruction title="Rapport mensuel" />;
}
