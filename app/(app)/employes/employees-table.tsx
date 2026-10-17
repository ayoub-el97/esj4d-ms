"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Search, UserCheck, UserX } from "lucide-react";
import { setEmployeeActive } from "@/lib/actions/employees";
import type { EmployeeRow } from "@/lib/data/employees";
import { useT } from "@/lib/i18n/client";
import { POSITION_LABELS, TEAM_LABELS, WEEKDAY_LABELS } from "@/lib/types";
import { formatDateFr } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";

export function EmployeesTable({
  rows,
  canEdit,
  filters,
  returnTo,
}: {
  rows: EmployeeRow[];
  canEdit: boolean;
  filters: { equipe?: string; poste?: string; statut?: string; q?: string };
  /** Page de retour après modification d'un employé */
  returnTo?: string;
}) {
  const { t } = useT();
  const editHref = (id: string) => `/employes/${id}${returnTo ? `?retour=${encodeURIComponent(returnTo)}` : ""}`;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();

  // Conserve les autres paramètres d'URL (ex. ?onglet=employes sur la page Profil)
  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("ok");
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute start-2 top-2 size-4 text-muted-foreground" />
          <Input className="ps-8" placeholder={t("Rechercher un nom ou un matricule…")} defaultValue={filters.q ?? ""} onChange={(e) => setFilter("q", e.target.value)} />
        </div>
        <NativeSelect className="w-auto" value={filters.equipe ?? ""} onChange={(e) => setFilter("equipe", e.target.value)}>
          <option value="">{t("Toutes les équipes")}</option>
          <option value="collecte">{t("Collecte")}</option>
          <option value="nettoiement">{t("Nettoiement")}</option>
        </NativeSelect>
        <NativeSelect className="w-auto" value={filters.poste ?? ""} onChange={(e) => setFilter("poste", e.target.value)}>
          <option value="">{t("Tous les postes")}</option>
          <option value="chauffeur">{t("Chauffeur")}</option>
          <option value="rippeur">{t("Rippeur")}</option>
          <option value="balayeur">{t("Balayeur")}</option>
        </NativeSelect>
        <NativeSelect className="w-auto" value={filters.statut ?? ""} onChange={(e) => setFilter("statut", e.target.value)}>
          <option value="">{t("Actifs")}</option>
          <option value="inactif">{t("Inactifs")}</option>
          <option value="tous">{t("Tous")}</option>
        </NativeSelect>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">{t("NB")}</TableHead>
              <TableHead>{t("Matricule")}</TableHead>
              <TableHead>{t("Nom et prénom")}</TableHead>
              <TableHead>{t("Poste")}</TableHead>
              <TableHead>{t("Équipe")}</TableHead>
              <TableHead>{t("Affectation")}</TableHead>
              <TableHead>{t("Repos")}</TableHead>
              <TableHead>{t("Début de travail")}</TableHead>
              <TableHead>{t("Statut")}</TableHead>
              {canEdit && <TableHead className="text-end">{t("Actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  {t("Aucun employé ne correspond aux filtres.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((e) => (
              <TableRow key={e.id} className={!e.is_active ? "opacity-60" : undefined}>
                <TableCell>{e.order_number}</TableCell>
                <TableCell className="font-mono text-xs">{e.matricule}</TableCell>
                <TableCell className="font-medium">
                  <Link href={editHref(e.id)} className="hover:underline">
                    {e.last_name} {e.first_name}
                  </Link>
                </TableCell>
                <TableCell>{t(POSITION_LABELS[e.position])}</TableCell>
                <TableCell>{t(TEAM_LABELS[e.team_type])}</TableCell>
                <TableCell className="text-muted-foreground">
                  {e.position === "chauffeur" && (e.truck_label ? t("Camion {matricule}", { matricule: e.truck_label }) : "—")}
                  {e.position === "rippeur" && (e.chauffeur_label ? t("Équipe {name}", { name: e.chauffeur_label }) : "—")}
                  {e.position === "balayeur" && "—"}
                </TableCell>
                <TableCell>{e.rest_day == null ? "—" : t(WEEKDAY_LABELS[e.rest_day])}</TableCell>
                <TableCell>{e.hire_date ? formatDateFr(e.hire_date) : "—"}</TableCell>
                <TableCell>{e.is_active ? <Badge>{t("Actif")}</Badge> : <Badge variant="destructive">{t("Inactif")}</Badge>}</TableCell>
                {canEdit && (
                  <TableCell className="space-x-1 whitespace-nowrap text-end">
                    <Button variant="outline" size="icon-sm" onClick={() => router.push(editHref(e.id))} aria-label={t("Modifier")}>
                      <Pencil />
                    </Button>
                    <Button
                      variant={e.is_active ? "destructive" : "default"}
                      size="icon-sm"
                      disabled={pending}
                      aria-label={e.is_active ? t("Désactiver") : t("Réactiver")}
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
