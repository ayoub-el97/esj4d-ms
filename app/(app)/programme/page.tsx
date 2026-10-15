import { requireModule } from "@/lib/auth";
import { UnderConstruction } from "@/components/under-construction";

export const metadata = { title: "Programme de travail" };

export default async function Page() {
  await requireModule("programme");
  return <UnderConstruction title="Programme de travail" />;
}
