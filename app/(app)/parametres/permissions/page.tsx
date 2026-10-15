import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AppModule, AppRole } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PermissionsForm } from "./permissions-form";

export const metadata = { title: "Permissions" };

export default async function PermissionsPage() {
  await requireModule("parametres");
  const supabase = await createClient();
  const { data } = await supabase.from("role_permissions").select("role, module, can_view, can_edit");

  const perms: Record<string, { can_view: boolean; can_edit: boolean }> = {};
  for (const p of data ?? []) perms[`${p.role as AppRole}:${p.module as AppModule}`] = { can_view: p.can_view, can_edit: p.can_edit };

  return (
    <div>
      <ModuleHeader title="Permissions par rôle" backHref="/parametres" />
      <PermissionsForm perms={perms} />
      <ModuleButtons />
    </div>
  );
}
