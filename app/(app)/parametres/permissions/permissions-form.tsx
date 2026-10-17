"use client";

import { useActionState } from "react";
import { savePermissions } from "@/lib/actions/admin";
import { useT } from "@/lib/i18n/client";
import { MODULES, MODULE_LABELS, ROLES, ROLE_LABELS } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

export function PermissionsForm({ perms }: { perms: Record<string, { can_view: boolean; can_edit: boolean }> }) {
  const { t } = useT();
  const [state, action] = useActionState(savePermissions, null);
  const roles = ROLES.filter((r) => r !== "admin");
  const v = t("V");
  const m = t("M");

  return (
    <form action={action}>
      <Card>
        <CardHeader>
          <CardTitle>{t("Droits par module")}</CardTitle>
          <CardDescription>{t("V = consultation, M = modification. L'administrateur a toujours tous les droits.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionMessage state={state} />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Module")}</TableHead>
                  {roles.map((r) => (
                    <TableHead key={r} className="text-center">
                      {t(ROLE_LABELS[r])}
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {v}&nbsp;&nbsp;/&nbsp;&nbsp;{m}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODULES.map((mod) => (
                  <TableRow key={mod}>
                    <TableCell className="font-medium">{t(MODULE_LABELS[mod])}</TableCell>
                    {roles.map((r) => {
                      const p = perms[`${r}:${mod}`] ?? { can_view: false, can_edit: false };
                      return (
                        <TableCell key={r} className="text-center">
                          <input type="checkbox" name={`view:${r}:${mod}`} defaultChecked={p.can_view} aria-label={`${v} ${t(ROLE_LABELS[r])}`} className="mx-1 size-4 accent-indigo-600" />
                          <input type="checkbox" name={`edit:${r}:${mod}`} defaultChecked={p.can_edit} aria-label={`${m} ${t(ROLE_LABELS[r])}`} className="mx-1 size-4 accent-indigo-600" />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <SubmitButton>{t("Enregistrer les permissions")}</SubmitButton>
        </CardContent>
      </Card>
    </form>
  );
}
