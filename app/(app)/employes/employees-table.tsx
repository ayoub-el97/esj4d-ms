"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Search, UserCheck, UserX } from "lucide-react";
import { setEmployeeActive } from "@/lib/actions/employees";
import type { Employee } from "@/lib/data/employees";
import { POSITION_LABELS, TEAM_LABELS, WEEKDAY_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";

type Row = Employee & { truck_label: string; chauffeur_label: string };

export function EmployeesTable({
  rows,
  canEdit,
  filters,
}: {
  rows: Row[];
  canEdit: boolean;
  filters: { equipe?: string; poste?: string; statut?: string; q?: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams();
    const next = { ...filters, [key]: value };
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    router.replace(`/employes?${params.toString()}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Rechercher un nom ou un matricule…"
            defaultValue={filters.q ?? ""}
            onChange={(e) => setFilter("q", e.target.value)}
          />
        </div>
        <NativeSelect className="w-auto" value={filters.equipe ?? ""} onChange={(e) => setFilter("equipe", e.target.value)}>
          <option value="">Toutes les équipes</option>
          <option value="collecte">Collecte</option>
          <option value="nettoiement">Nettoiement</option>
        </NativeSelect>
        <NativeSelect className="w-auto" value={filters.poste ?? ""} onChange={(e) => setFilter("poste", e.target.value)}>
          <option value="">Tous les postes</option>
          <option value="chauffeur">Chauffeur</option>
          <option value="rippeur">Rippeur</option>
          <option value="balayeur">Balayeur</option>
        </NativeSelect>
        <NativeSelect className="w-auto" value={filters.statut ?? ""} onChange={(e) => setFilter("statut", e.target.value)}>
          <option value="">Actifs</option>
          <option value="inactif">Inactifs</option>
          <option value="tous">Tous</option>
        </NativeSelect>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">NB</TableHead>
              <TableHead>Matricule</TableHead>
              <TableHead>Nom et prénom</TableHead>
              <TableHead>Poste</TableHead>
              <TableHead>Équipe</TableHead>
              <TableHead>Affectation</TableHead>
              <TableHead>Repos</TableHead>
              <TableHead>Statut</TableHead>
              {canEdit && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Aucun employé ne correspond aux filtres.
                </TableCell>
              </TableRow>
            )}
            {rows.map((e) => (
              <TableRow key={e.id} className={!e.is_active ? "opacity-60" : undefined}>
                <TableCell>{e.order_number}</TableCell>
                <TableCell className="font-mono text-xs">{e.matricule}</TableCell>
                <TableCell className="font-medium">
                  <Link href={`/employes/${e.id}`} className="hover:underline">
                    {e.last_name} {e.first_name}
                  </Link>
                </TableCell>
                <TableCell>{POSITION_LABELS[e.position]}</TableCell>
                <TableCell>{TEAM_LABELS[e.team_type]}</TableCell>
                <TableCell className="text-muted-foreground">
                  {e.position === "chauffeur" && (e.truck_label ? `Camion ${e.truck_label}` : "—")}
                  {e.position === "rippeur" && (e.chauffeur_label ? `Équipe ${e.chauffeur_label}` : "—")}
                  {e.position === "balayeur" && "—"}
                </TableCell>
                <TableCell>{e.rest_day == null ? "—" : WEEKDAY_LABELS[e.rest_day]}</TableCell>
                <TableCell>{e.is_active ? <Badge>Actif</Badge> : <Badge variant="destructive">Inactif</Badge>}</TableCell>
                {canEdit && (
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    <Button variant="outline" size="icon-sm" onClick={() => router.push(`/employes/${e.id}`)} aria-label="Modifier">
                      <Pencil />
                    </Button>
                    <Button
                      variant={e.is_active ? "destructive" : "default"}
                      size="icon-sm"
                      disabled={pending}
                      aria-label={e.is_active ? "Désactiver" : "Réactiver"}
                      onClick={() =>
                        start(async () => {
                          const r = await setEmployeeActive(e.id, !e.is_active);
                          if (r.ok) toast.success(r.message);
                          else toast.error(r.error);
                        })
                      }
                    >
                      {e.is_active ? <UserX /> : <UserCheck />}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
