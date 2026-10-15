"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound, UserCheck, UserX } from "lucide-react";
import { createUser, resetUserPassword, setUserActive, updateUserRole } from "@/lib/actions/admin";
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
  if (result.ok) toast.success(result.message ?? "Enregistré.");
  else toast.error(result.error);
}

export function UsersTable({ users, currentUserId }: { users: Profile[]; currentUserId: string }) {
  const [pending, start] = useTransition();

  const askPassword = (u: Profile) => {
    const pwd = window.prompt(`Nouveau mot de passe pour ${u.email} (8 caractères minimum) :`);
    if (!pwd) return;
    start(async () => notify(await resetUserPassword(u.id, pwd)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Utilisateurs ({users.length})</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={!u.is_active ? "opacity-60" : undefined}>
                <TableCell className="font-medium">
                  {u.full_name} {u.id === currentUserId && <Badge variant="outline">vous</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <NativeSelect
                    className="w-auto min-w-40"
                    defaultValue={u.role}
                    disabled={pending || u.id === currentUserId}
                    onChange={(e) => start(async () => notify(await updateUserRole(u.id, e.target.value)))}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell>
                  {u.is_active ? <Badge>Actif</Badge> : <Badge variant="destructive">Désactivé</Badge>}
                </TableCell>
                <TableCell className="space-x-1 text-right whitespace-nowrap">
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => askPassword(u)} title="Réinitialiser le mot de passe">
                    <KeyRound />
                  </Button>
                  {u.id !== currentUserId && (
                    <Button
                      variant={u.is_active ? "destructive" : "default"}
                      size="sm"
                      disabled={pending}
                      onClick={() => start(async () => notify(await setUserActive(u.id, !u.is_active)))}
                      title={u.is_active ? "Désactiver" : "Réactiver"}
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
  const [state, action] = useActionState(createUser, null);
  const [key, setKey] = useState(0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouveau compte</CardTitle>
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
            <Label htmlFor="full_name">Nom complet</Label>
            <Input id="full_name" name="full_name" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="role">Rôle</Label>
            <NativeSelect id="role" name="role" defaultValue="lecture">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Mot de passe initial</Label>
            <Input id="password" name="password" type="text" minLength={8} required />
            <p className="text-xs text-muted-foreground">À communiquer à l&apos;utilisateur. 8 caractères minimum.</p>
          </div>
          <SubmitButton className="w-full">Créer le compte</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
