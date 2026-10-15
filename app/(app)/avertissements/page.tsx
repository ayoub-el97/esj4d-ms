import { requireModule } from "@/lib/auth";
import { UnderConstruction } from "@/components/under-construction";

export const metadata = { title: "Avertissements" };

export default async function Page() {
  await requireModule("avertissements");
  return <UnderConstruction title="Avertissements" />;
}
