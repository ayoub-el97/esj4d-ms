import { requireModule } from "@/lib/auth";
import { UnderConstruction } from "@/components/under-construction";

export const metadata = { title: "Déchet vert" };

export default async function Page() {
  await requireModule("dechet_vert");
  return <UnderConstruction title="Déchet vert" />;
}
