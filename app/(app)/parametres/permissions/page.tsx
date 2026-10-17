import { requireModule } from "@/lib/auth";
import { getT, pageTitle } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import type { AppModule, AppRole } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PermissionsForm } from "./permissions-form";

export const generateMetadata = pageTitle("Permissions");

export default async function PermissionsPage() {
  const [, t] = await Promise.all([requireModule("parametres"), getT()]);
  const supabase = await createClient();
  const { data } = await supabase.from("role_permissions").select("role, module, can_view, can_edit");

  const perms: Record<string, { can_view: boolean; can_edit: boolean }> = {};
  for (const p of data ?? []) perms[`${p.role as AppRole}:${p.module as AppModule}`] = { can_view: p.can_view, can_edit: p.can_edit };

  return (
    <div>
      <ModuleHeader title={t("Permissions par rôle")} backHref="/parametres" />
      <PermissionsForm perms={perms} />
      <ModuleButtons />
    </div>
  );
}
