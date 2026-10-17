"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound, UserCheck, UserX } from "lucide-react";
import { createUser, resetUserPassword, setUserActive, updateUserRole } from "@/lib/actions/admin";
import { useT } from "@/lib/i18n/client";
import { ROLES, ROLE_LABELS, type ActionResult, type Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

function notify(result: ActionResult) {
  if (result.ok) toast.success(result.message);
  else toast.error(result.error);
}

export function UsersTable({ users, currentUserId }: { users: Profile[]; currentUserId: string }) {
  const { t } = useT();
  const [pending, start] = useTransition();

  const askPassword = (u: Profile) => {
    const pwd = window.prompt(t("Nouveau mot de passe pour {email} (8 caractères minimum) :", { email: u.email }));
    if (!pwd) return;
    start(async () => notify(await resetUserPassword(u.id, pwd)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Utilisateurs ({count})", { count: users.length })}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Nom")}</TableHead>
              <TableHead>{t("E-mail")}</TableHead>
              <TableHead>{t("Rôle")}</TableHead>
              <TableHead>{t("Statut")}</TableHead>
              <TableHead className="text-end">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={!u.is_active ? "opacity-60" : undefined}>
                <TableCell className="font-medium">
                  {u.full_name} {u.id === currentUserId && <Badge variant="outline">{t("vous")}</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground" dir="ltr">{u.email}</TableCell>
                <TableCell>
                  <NativeSelect
                    className="w-auto min-w-40"
                    defaultValue={u.role}
                    disabled={pending || u.id === currentUserId}
                    onChange={(e) => start(async () => notify(await updateUserRole(u.id, e.target.value)))}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(ROLE_LABELS[r])}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell>{u.is_active ? <Badge>{t("Actif")}</Badge> : <Badge variant="destructive">{t("Désactivé")}</Badge>}</TableCell>
                <TableCell className="space-x-1 whitespace-nowrap text-end">
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => askPassword(u)} title={t("Réinitialiser le mot de passe")}>
                    <KeyRound />
                  </Button>
                  {u.id !== currentUserId && (
                    <Button
                      variant={u.is_active ? "destructive" : "default"}
                      size="sm"
                      disabled={pending}
                      onClick={() => start(async () => notify(await setUserActive(u.id, !u.is_active)))}
                      title={u.is_active ? t("Désactiver") : t("Réactiver")}
                    >
                      {u.is_active ? <UserX /> : <UserCheck />}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function CreateUserForm() {
  const { t } = useT();
  const [state, action] = useActionState(createUser, null);
  const [key, setKey] = useState(0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Nouveau compte")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          key={key}
          action={async (fd) => {
            action(fd);
            setKey((k) => k + 1);
          }}
          className="space-y-3"
        >
          <ActionMessage state={state} />
          <div className="space-y-1">
            <Label htmlFor="full_name">{t("Nom complet")}</Label>
            <Input id="full_name" name="full_name" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">{t("E-mail")}</Label>
            <Input id="email" name="email" type="email" required dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="role">{t("Rôle")}</Label>
            <NativeSelect id="role" name="role" defaultValue="lecture">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(ROLE_LABELS[r])}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">{t("Mot de passe initial")}</Label>
            <Input id="password" name="password" type="text" minLength={8} required dir="ltr" />
            <p className="text-xs text-muted-foreground">{t("À communiquer à l'utilisateur. 8 caractères minimum.")}</p>
          </div>
          <SubmitButton className="w-full">{t("Créer le compte")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
