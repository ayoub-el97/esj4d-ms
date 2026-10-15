"use client";

import { useActionState } from "react";
import { savePermissions } from "@/lib/actions/admin";
import { MODULES, MODULE_LABELS, ROLES, ROLE_LABELS } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

export function PermissionsForm({
  perms,
}: {
  perms: Record<string, { can_view: boolean; can_edit: boolean }>;
}) {
  const [state, action] = useActionState(savePermissions, null);
  const roles = ROLES.filter((r) => r !== "admin");

  return (
    <form action={action}>
      <Card>
        <CardHeader>
          <CardTitle>Droits par module</CardTitle>
          <CardDescription>
            <strong>V</strong> = consultation, <strong>M</strong> = modification. L&apos;administrateur a toujours tous les droits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionMessage state={state} />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  {roles.map((r) => (
                    <TableHead key={r} className="text-center">
                      {ROLE_LABELS[r]}
                      <div className="text-[10px] font-normal text-muted-foreground">V&nbsp;&nbsp;/&nbsp;&nbsp;M</div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODULES.map((m) => (
                  <TableRow key={m}>
                    <TableCell className="font-medium">{MODULE_LABELS[m]}</TableCell>
                    {roles.map((r) => {
                      const p = perms[`${r}:${m}`] ?? { can_view: false, can_edit: false };
                      return (
                        <TableCell key={r} className="text-center">
                          <label className="mx-1 inline-flex items-center gap-1 text-xs">
                            <input type="checkbox" name={`view:${r}:${m}`} defaultChecked={p.can_view} className="size-4 accent-indigo-600" />
                          </label>
                          <label className="mx-1 inline-flex items-center gap-1 text-xs">
                            <input type="checkbox" name={`edit:${r}:${m}`} defaultChecked={p.can_edit} className="size-4 accent-indigo-600" />
                          </label>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <SubmitButton>Enregistrer les permissions</SubmitButton>
        </CardContent>
      </Card>
    </form>
  );
}
