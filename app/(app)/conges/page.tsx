import { requireModule } from "@/lib/auth";
import { UnderConstruction } from "@/components/under-construction";

export const metadata = { title: "Congés" };

export default async function Page() {
  await requireModule("conges");
  return <UnderConstruction title="Congés" />;
}
