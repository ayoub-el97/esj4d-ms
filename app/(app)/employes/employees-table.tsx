"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Search, Trash2, UserCheck, UserX } from "lucide-react";
import { checkEmployeeDeletion, deactivateEmployee, deleteEmployee, reactivateEmployee, type EmployeeDependency } from "@/lib/actions/employees";
import type { EmployeeRow } from "@/lib/data/employees";
import { useT } from "@/lib/i18n/client";
import { POSITIONS, POSITION_LABELS, TEAM_LABELS, WEEKDAY_LABELS } from "@/lib/types";
import { formatDateFr, todayISO } from "@/lib/dates";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const DEPARTURE_REASON_LABELS: Record<string, string> = { demission: "Démission", fin_contrat: "Fin de contrat", licenciement: "Licenciement", autre: "Autre" };
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";

export function EmployeesTable({
  rows,
  canEdit,
  canDelete = false,
  filters,
  returnTo,
}: {
  rows: EmployeeRow[];
  canEdit: boolean;
  /** Suppression définitive : administrateur uniquement */
  canDelete?: boolean;
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
  const [leaving, setLeaving] = useState<EmployeeRow | null>(null);
  const [deleting, setDeleting] = useState<{ e: EmployeeRow; deps: EmployeeDependency[] } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        after?.();
        router.refresh();
      } else toast.error(r.error, { duration: 9000 });
    });
  const askDelete = (e: EmployeeRow) =>
    start(async () => {
      const r = await checkEmployeeDeletion(e.id);
      if (r.ok && r.data) setDeleting({ e, deps: r.data.dependencies });
      else if (!r.ok) toast.error(r.error);
    });

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
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {t(POSITION_LABELS[p])}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect className="w-auto" value={filters.statut ?? ""} onChange={(e) => setFilter("statut", e.target.value)}>
          <option value="">{t("Employés actifs")}</option>
          <option value="inactif">{t("Employés inactifs")}</option>
          <option value="partis">{t("Employés ayant quitté l'entreprise")}</option>
          <option value="tous">{t("Tous les employés")}</option>
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
                  {(e.position === "balayeur" || e.position === "chauffeur_remplacant" || e.position === "rippeur_remplacant") && "—"}
                  {e.substitute_label && <div className="text-xs">{t("Remplaçant : {name}", { name: e.substitute_label })}</div>}
                </TableCell>
                <TableCell>{e.rest_day == null ? "—" : t(WEEKDAY_LABELS[e.rest_day])}</TableCell>
                <TableCell>
                  {e.hire_date ? (
                    formatDateFr(e.hire_date)
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      {t("Non renseignée")}
                      {e.in_service_before_start && <span className="block not-italic">{t("en poste au début du projet")}</span>}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {e.is_active ? <Badge>{t("Actif")}</Badge> : <Badge variant="destructive">{t("Inactif")}</Badge>}
                  {e.departure_date && (
                    <div className="mt-0.5 text-xs text-muted-foreground" title={e.departure_comment || undefined}>
                      {t("Départ le {date}", { date: formatDateFr(e.departure_date) })}
                      {e.departure_reason ? ` · ${t(DEPARTURE_REASON_LABELS[e.departure_reason])}` : ""}
                    </div>
                  )}
                </TableCell>
                {canEdit && (
                  <TableCell className="whitespace-nowrap text-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm" })} disabled={pending} aria-label={t("Actions pour {name}", { name: `${e.last_name} ${e.first_name}` })}>
                        <MoreHorizontal /> {t("Actions")}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(editHref(e.id))}>
                          <Pencil /> {t("Modifier")}
                        </DropdownMenuItem>
                        {e.is_active ? (
                          <DropdownMenuItem onClick={() => setLeaving(e)}>
                            <UserX /> {t("Désactiver (départ)")}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => {
                              if (window.confirm(t("Réactiver {name} ? Il sera de nouveau proposé dans le pointage et les nouvelles affectations.", { name: `${e.last_name} ${e.first_name}` }))) run(() => reactivateEmployee(e.id));
                            }}
                          >
                            <UserCheck /> {t("Réactiver")}
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => askDelete(e)}>
                              <Trash2 /> {t("Supprimer définitivement")}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {leaving && <DepartureDialog employee={leaving} pending={pending} onClose={() => setLeaving(null)} onConfirm={(v) => run(() => deactivateEmployee({ id: leaving.id, ...v }), () => setLeaving(null))} />}
      {deleting && (
        <DeleteDialog
          employee={deleting.e}
          dependencies={deleting.deps}
          pending={pending}
          onClose={() => setDeleting(null)}
          onDeactivate={() => {
            const e = deleting.e;
            setDeleting(null);
            if (e.is_active) setLeaving(e);
          }}
          onConfirm={(matricule) => run(() => deleteEmployee(deleting.e.id, matricule), () => setDeleting(null))}
        />
      )}
    </div>
  );
}

/** Départ : date (dernier jour de travail), motif, commentaire → désactivation. */
function DepartureDialog({ employee, pending, onClose, onConfirm }: { employee: EmployeeRow; pending: boolean; onClose: () => void; onConfirm: (v: { departure_date: string; departure_reason: string; departure_comment: string }) => void }) {
  const { t } = useT();
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("demission");
  const [comment, setComment] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Départ de {name}", { name: `${employee.last_name} ${employee.first_name}` })}</DialogTitle>
          <DialogDescription>
            {t("L'employé est désactivé, pas supprimé : il n'est plus proposé pour le pointage ni pour les nouvelles affectations après sa date de départ, mais tout son historique (pointage, rapports, congés, rapports mensuels) reste consultable et inchangé.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="departure_date">{t("Date de départ (dernier jour de travail)")}</Label>
            <Input id="departure_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} min={employee.hire_date ?? undefined} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="departure_reason">{t("Motif de départ")}</Label>
            <NativeSelect id="departure_reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {Object.entries(DEPARTURE_REASON_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {t(l)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="departure_comment">{t("Commentaire (facultatif)")}</Label>
            <Textarea id="departure_comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("Annuler")}
          </Button>
          <Button variant="destructive" disabled={pending || !date} onClick={() => onConfirm({ departure_date: date, departure_reason: reason, departure_comment: comment })}>
            <UserX /> {t("Confirmer le départ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Suppression définitive : refusée s'il existe un historique ; sinon confirmation par le matricule. */
function DeleteDialog({
  employee,
  dependencies,
  pending,
  onClose,
  onDeactivate,
  onConfirm,
}: {
  employee: EmployeeRow;
  dependencies: EmployeeDependency[];
  pending: boolean;
  onClose: () => void;
  onDeactivate: () => void;
  onConfirm: (matricule: string) => void;
}) {
  const { t } = useT();
  const [typed, setTyped] = useState("");
  const blocked = dependencies.length > 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Supprimer définitivement {name} ?", { name: `${employee.last_name} ${employee.first_name}` })}</DialogTitle>
          <DialogDescription>
            {blocked
              ? t("Suppression impossible : cet employé figure dans l'historique de l'entreprise. Le supprimer casserait les rapports passés. Désactivez-le à la place : il disparaît des listes, son historique est conservé.")
              : t("Aucun enregistrement ne concerne cet employé (aucun pointage, rapport, congé, avertissement…). La suppression est définitive et inscrite au journal.")}
          </DialogDescription>
        </DialogHeader>
        {blocked ? (
          <ul className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
            {dependencies.map((d) => (
              <li key={d.table_name} className="flex justify-between gap-2">
                <span>{t(d.label)}</span>
                <span className="font-semibold tabular-nums">{d.records}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="confirm_matricule">{t("Pour confirmer, saisissez le matricule « {matricule} »", { matricule: employee.matricule })}</Label>
            <Input id="confirm_matricule" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("Annuler")}
          </Button>
          {blocked ? (
            employee.is_active && (
              <Button onClick={onDeactivate} disabled={pending}>
                <UserX /> {t("Désactiver à la place")}
              </Button>
            )
          ) : (
            <Button variant="destructive" disabled={pending || typed.trim() !== employee.matricule} onClick={() => onConfirm(typed.trim())}>
              <Trash2 /> {t("Supprimer définitivement")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
