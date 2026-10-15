"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Power } from "lucide-react";
import { saveTruck, setTruckActive } from "@/lib/actions/employees";
import type { Truck } from "@/lib/data/employees";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

export function TrucksUI({ trucks, canEdit }: { trucks: Truck[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<Truck | null>(null);
  const [state, action] = useActionState(saveTruck, null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>Liste des camions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matricule</TableHead>
                <TableHead>Marque</TableHead>
                <TableHead>Statut</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {trucks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Aucun camion enregistré.
                  </TableCell>
                </TableRow>
              )}
              {trucks.map((t) => (
                <TableRow key={t.id} className={!t.is_active ? "opacity-60" : undefined}>
                  <TableCell className="font-mono">{t.matricule}</TableCell>
                  <TableCell>{t.brand || "—"}</TableCell>
                  <TableCell>{t.is_active ? <Badge>Actif</Badge> : <Badge variant="destructive">Inactif</Badge>}</TableCell>
                  {canEdit && (
                    <TableCell className="space-x-1 text-right whitespace-nowrap">
                      <Button variant="outline" size="icon-sm" onClick={() => setEditing(t)} aria-label="Modifier">
                        <Pencil />
                      </Button>
                      <Button
                        variant={t.is_active ? "destructive" : "default"}
                        size="icon-sm"
                        disabled={pending}
                        aria-label={t.is_active ? "Désactiver" : "Réactiver"}
                        onClick={() =>
                          start(async () => {
                            const r = await setTruckActive(t.id, !t.is_active);
                            if (r.ok) toast.success(r.message);
                            else toast.error(r.error);
                          })
                        }
                      >
                        <Power />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>{editing ? `Modifier ${editing.matricule}` : "Nouveau camion"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              key={editing?.id ?? "new"}
              action={async (fd) => {
                action(fd);
                setEditing(null);
              }}
              className="space-y-3"
            >
              <input type="hidden" name="id" value={editing?.id ?? ""} />
              <ActionMessage state={state} />
              <div className="space-y-1">
                <Label htmlFor="matricule">Matricule</Label>
                <Input id="matricule" name="matricule" defaultValue={editing?.matricule} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="brand">Marque</Label>
                <Input id="brand" name="brand" defaultValue={editing?.brand} placeholder="Ex. Renault, Isuzu…" />
              </div>
              <div className="flex gap-2">
                <SubmitButton className="flex-1">{editing ? "Enregistrer" : "Ajouter"}</SubmitButton>
                {editing && (
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    Annuler
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
