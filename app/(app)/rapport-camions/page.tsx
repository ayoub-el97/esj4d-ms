import { requireModule } from "@/lib/auth";
import { UnderConstruction } from "@/components/under-construction";

export const metadata = { title: "Rapport camions" };

export default async function Page() {
  await requireModule("rapport_camions");
  return <UnderConstruction title="Rapport camions" />;
}
