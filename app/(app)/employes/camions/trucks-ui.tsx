"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Pencil, Power, Trash2 } from "lucide-react";
import { deleteTruck, saveTruck, setTruckActive } from "@/lib/actions/employees";
import type { Truck } from "@/lib/data/employees";
import { useT } from "@/lib/i18n/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

export function TrucksUI({ trucks, canEdit }: { trucks: Truck[]; canEdit: boolean }) {
  const { t } = useT();
  const [editing, setEditing] = useState<Truck | null>(null);
  const [state, action] = useActionState(saveTruck, null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>{t("Véhicules")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Matricule")}</TableHead>
                <TableHead>{t("Marque")}</TableHead>
                <TableHead>{t("Statut")}</TableHead>
                {canEdit && <TableHead className="text-end">{t("Actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {trucks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t("Aucun véhicule enregistré.")}
                  </TableCell>
                </TableRow>
              )}
              {trucks.map((tr) => (
                <TableRow key={tr.id} className={!tr.is_active ? "opacity-60" : undefined}>
                  <TableCell className="font-mono">{tr.matricule}</TableCell>
                  <TableCell>
                    {tr.brand || "—"}
                    {tr.model && <span className="text-muted-foreground"> · {tr.model}</span>}
                  </TableCell>
                  <TableCell>{tr.is_active ? <Badge>{t("Actif")}</Badge> : <Badge variant="destructive">{t("Inactif")}</Badge>}</TableCell>
                  {canEdit && (
                    <TableCell className="space-x-1 whitespace-nowrap text-end">
                      <Button variant="outline" size="icon-sm" onClick={() => setEditing(tr)} aria-label={t("Modifier")}>
                        <Pencil />
                      </Button>
                      <Button
                        variant={tr.is_active ? "destructive" : "default"}
                        size="icon-sm"
                        disabled={pending}
                        aria-label={tr.is_active ? t("Désactiver") : t("Réactiver")}
                        onClick={() =>
                          start(async () => {
                            const r = await setTruckActive(tr.id, !tr.is_active);
                            if (r.ok) toast.success(r.message);
                            else toast.error(r.error);
                          })
                        }
                      >
                        <Power />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label={t("Supprimer")}
                        title={t("Supprimer")}
                        onClick={() => {
                          if (!window.confirm(t("Supprimer définitivement le véhicule {matricule} ?", { matricule: tr.matricule }))) return;
                          start(async () => {
                            const r = await deleteTruck(tr.id);
                            if (r.ok) {
                              toast.success(r.message);
                              if (editing?.id === tr.id) setEditing(null);
                              router.refresh();
                            } else toast.error(r.error, { duration: 8000 });
                          });
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>{editing ? t("Modifier {matricule}", { matricule: editing.matricule }) : t("Nouveau véhicule")}</CardTitle>
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
                <Label htmlFor="matricule">{t("Matricule")}</Label>
                <Input id="matricule" name="matricule" defaultValue={editing?.matricule} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="brand">{t("Marque")}</Label>
                <Input id="brand" name="brand" defaultValue={editing?.brand} placeholder={t("Ex. Renault, Isuzu…")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="model">{t("Modèle (facultatif)")}</Label>
                <Input id="model" name="model" defaultValue={editing?.model} placeholder={t("Ex. BOM 16 m³")} />
              </div>
              <div className="flex gap-2">
                <SubmitButton className="flex-1">{editing ? t("Enregistrer") : t("Ajouter")}</SubmitButton>
                {editing && (
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    {t("Annuler")}
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
