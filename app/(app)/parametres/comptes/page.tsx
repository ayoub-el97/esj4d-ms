import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { CreateUserForm, UsersTable } from "./users-ui";

export const metadata = { title: "Comptes utilisateurs" };

export default async function ComptesPage() {
  const me = await requireModule("parametres");
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .order("full_name")
    .returns<Profile[]>();

  return (
    <div>
      <ModuleHeader title="Comptes utilisateurs" backHref="/parametres" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <UsersTable users={users ?? []} currentUserId={me.id} />
        <CreateUserForm />
      </div>
      <ModuleButtons />
    </div>
  );
}
