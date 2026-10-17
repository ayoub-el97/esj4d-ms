"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Plus, Save, Trash2, UserPlus } from "lucide-react";
import { saveSheet } from "@/lib/actions/attendance";
import type { EmployeeOption, SheetRow } from "@/lib/attendance-types";
import { formatDateFr } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/config";
import { formatDateTimeFr } from "@/lib/dates";
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS, POSITION_LABELS, TEAM_LABELS, WEEKDAY_SHORT, WORKED_STATUSES, isSubstitutePosition, type AttendanceStatus, type TeamType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  date: string;
  team: TeamType;
  initialRows: SheetRow[];
  initialTeamLead: string;
  /** Chefs d'équipe définis dans le profil de l'entreprise (suggestions) */
  teamLeadOptions: string[];
  options: EmployeeOption[];
  canEdit: boolean;
  agency: string;
  company: string;
  logo: string | null;
};

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: "",
  repos_travaille: "bg-violet-50",
  repos: "bg-amber-50",
  ferie: "bg-sky-50",
  absent: "bg-red-50",
  absent_maladie: "bg-orange-50",
  conge: "bg-emerald-50",
  recuperation: "bg-teal-50",
};

/** Heures et HS saisissables seulement pour un jour travaillé */
const isWorked = (s: AttendanceStatus) => WORKED_STATUSES.includes(s);

export function SheetForm({ date, team, initialRows, initialTeamLead, teamLeadOptions, options, canEdit, agency, company, logo }: Props) {
  const { t } = useT();
  const router = useRouter();
  const [rows, setRows] = useState<SheetRow[]>(initialRows);
  const [teamLead, setTeamLead] = useState(initialTeamLead);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState<{ chauffeurId: string | null } | null>(null);

  const optionsById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const dow = new Date(`${date}T12:00:00`).getDay();

  const update = (idx: number, patch: Partial<SheetRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const remove = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };
  const addShift = (idx: number) => {
    const base = rows[idx];
    const maxShift = Math.max(...rows.filter((r) => r.employee_id === base.employee_id).map((r) => r.shift));
    if (maxShift >= 3) return toast.error(t("Maximum 3 services par jour."));
    setRows((prev) => [
      ...prev.slice(0, idx + 1),
      { ...base, id: null, shift: maxShift + 1, status: "present", time_in: "", time_out: "", overtime_hours: 0, observation: "", entered_at: null },
      ...prev.slice(idx + 1),
    ]);
    setDirty(true);
  };
  const addEmployee = (employeeId: string, replacingId: string | null, chauffeurId: string | null) => {
    const o = optionsById.get(employeeId);
    if (!o) return;
    if (rows.some((r) => r.employee_id === employeeId && r.shift === 1)) return toast.error(t("Cet employé figure déjà sur la feuille."));
    setRows((prev) => [
      ...prev,
      {
        id: null,
        employee_id: o.id,
        shift: 1,
        status: o.rest_day === dow ? "repos_travaille" : "present",
        time_in: "",
        time_out: "",
        overtime_hours: 0,
        observation: "",
        entered_at: null,
        planned: null,
        replacing_employee_id: replacingId,
        chauffeur_id: team === "collecte" && o.position !== "chauffeur" ? chauffeurId : null,
        // Un employé de la collecte garde son poste ; un employé d'une autre équipe renforce comme rippeur
        position: team === "nettoiement" ? "balayeur" : o.team_type === "collecte" ? o.position : "rippeur",
        team_type: team,
        order_number: o.order_number,
        name: o.name,
        matricule: o.matricule,
        rest_day: o.rest_day,
        is_extra: true,
        substitute_id: o.substitute_id,
      },
    ]);
    setDirty(true);
    setAdding(null);
  };

  /** Fait remplacer un titulaire (en repos, absent…) par son remplaçant attitré. */
  const assignSubstitute = (titularIndex: number) => {
    const titular = rows[titularIndex];
    if (!titular.substitute_id) return;
    const crewChauffeur = titular.position === "chauffeur" ? titular.employee_id : titular.chauffeur_id;
    const subIndex = rows.findIndex((r) => r.employee_id === titular.substitute_id && r.shift === 1);
    if (subIndex < 0) return addEmployee(titular.substitute_id, titular.employee_id, crewChauffeur);
    const sub = rows[subIndex];
    if (sub.replacing_employee_id && sub.replacing_employee_id !== titular.employee_id) {
      const other = optionsById.get(sub.replacing_employee_id);
      if (!window.confirm(t("{name} remplace déjà {other} ce jour. Le réaffecter ?", { name: sub.name, other: other?.name ?? "?" }))) return;
    }
    update(subIndex, {
      replacing_employee_id: titular.employee_id,
      chauffeur_id: crewChauffeur,
      status: isWorked(sub.status) ? sub.status : sub.rest_day === dow ? "repos_travaille" : "present",
    });
  };

  const save = () =>
    start(async () => {
      const r = await saveSheet({ activity_date: date, team_type: team, team_lead: teamLead, rows });
      if (r.ok) {
        toast.success(r.message);
        setDirty(false);
        router.refresh();
      } else toast.error(r.error);
    });

  // Regroupement : collecte = par chauffeur ; nettoiement = liste simple
  const groups = useMemo(() => {
    type Group = { key: string; title: string | null; chauffeurId: string | null; idx: number[] };
    if (team === "nettoiement") return [{ key: "all", title: null, chauffeurId: null, idx: rows.map((_, i) => i) }] as Group[];
    const chauffeurs = rows.filter((r) => r.position === "chauffeur" && r.shift === 1);
    const used = new Set<number>();
    const result: Group[] = chauffeurs.map((c) => {
      const idx = rows.map((r, i) => (r.employee_id === c.employee_id || r.chauffeur_id === c.employee_id ? i : -1)).filter((i) => i >= 0);
      idx.forEach((i) => used.add(i));
      return { key: c.employee_id, title: t("Équipe {name}", { name: c.name }), chauffeurId: c.employee_id, idx };
    });
    const rest = rows.map((_, i) => i).filter((i) => !used.has(i));
    const freeSubstitutes = rest.filter((i) => isSubstitutePosition(rows[i].position));
    const others = rest.filter((i) => !isSubstitutePosition(rows[i].position));
    if (freeSubstitutes.length) result.push({ key: "subs", title: t("Remplaçants sans remplacement ce jour"), chauffeurId: null, idx: freeSubstitutes });
    if (others.length) result.push({ key: "none", title: t("Sans équipe affectée"), chauffeurId: null, idx: others });
    return result;
  }, [rows, team, t]);

  const counts = useMemo(() => {
    const c: Partial<Record<AttendanceStatus, number>> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* En-tête de la feuille (logo, agence, chef d'équipe, date) */}
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-center">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={company} className="size-14 rounded-lg object-contain" />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-lg bg-indigo-600 text-xl font-bold text-white">{company.slice(0, 1)}</div>
        )}
        <div className="text-sm">
          <div className="text-muted-foreground">{t("Agence")}</div>
          <div className="font-medium">{agency}</div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="team_lead" className="text-muted-foreground">
            {t("Chef d'équipe")}
          </Label>
          <Input
            id="team_lead"
            list="team-lead-options"
            value={teamLead}
            disabled={!canEdit}
            onChange={(e) => {
              setTeamLead(e.target.value);
              setDirty(true);
            }}
            placeholder={t("Nom du chef d'équipe")}
          />
          <datalist id="team-lead-options">
            {teamLeadOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div className="text-sm sm:text-end">
          <div className="text-muted-foreground">{t("Date")}</div>
          <div className="font-medium">{formatDateFr(date)}</div>
        </div>
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-start">{t("NB")}</th>
              <th className="px-2 py-2 text-start">{t("Poste")}</th>
              <th className="px-2 py-2 text-start">{t("Nom et prénom")}</th>
              <th className="px-2 py-2 text-start">{t("Repos")}</th>
              <th className="px-2 py-2 text-start">{t("Statut / motif")}</th>
              <th className="px-2 py-2 text-start">{t("H. entrée")}</th>
              <th className="px-2 py-2 text-start">{t("H. sortie")}</th>
              <th className="px-2 py-2 text-start">{t("HS")}</th>
              <th className="px-2 py-2 text-start">{t("Observation")}</th>
              <th className="px-2 py-2 text-start">{t("Saisie")}</th>
              {canEdit && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows
                key={g.key}
                t={t}
                dow={dow}
                title={g.title}
                rows={rows}
                idx={g.idx}
                canEdit={canEdit}
                optionsById={optionsById}
                onUpdate={update}
                onRemove={remove}
                onAddShift={addShift}
                onAssignSubstitute={assignSubstitute}
                onAddMember={team === "collecte" && g.chauffeurId ? () => setAdding({ chauffeurId: g.chauffeurId }) : undefined}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-muted-foreground">
                  {t("Aucun employé actif dans cette équipe. Ajoutez des employés dans le module Employés.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Résumé + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {ATTENDANCE_STATUSES.filter((s) => counts[s]).map((s) => (
            <span key={s} className={cn("rounded-md border px-2 py-1", STATUS_COLORS[s])}>
              {t(ATTENDANCE_STATUS_LABELS[s])} : <strong>{counts[s]}</strong>
            </span>
          ))}
          <span className="rounded-md border px-2 py-1">
            {t("Total")} : <strong>{rows.length}</strong>
          </span>
        </div>
        {canEdit && (
          <div className="ms-auto flex gap-2">
            <Button variant="outline" onClick={() => setAdding({ chauffeurId: null })}>
              <UserPlus /> {team === "collecte" ? t("Ajouter un remplaçant / renfort") : t("Ajouter un agent")}
            </Button>
            <Button onClick={save} disabled={pending || !dirty}>
              <Save /> {pending ? t("Enregistrement…") : t("Enregistrer la feuille")}
            </Button>
          </div>
        )}
      </div>

      {adding && <AddEmployeeDialog date={date} team={team} options={options} rows={rows} defaultChauffeurId={adding.chauffeurId} onClose={() => setAdding(null)} onAdd={addEmployee} />}
    </div>
  );
}

function GroupRows({
  t,
  dow,
  title,
  rows,
  idx,
  canEdit,
  optionsById,
  onUpdate,
  onRemove,
  onAddShift,
  onAssignSubstitute,
  onAddMember,
}: {
  t: TFunction;
  dow: number;
  title: string | null;
  rows: SheetRow[];
  idx: number[];
  canEdit: boolean;
  optionsById: Map<string, EmployeeOption>;
  onUpdate: (i: number, patch: Partial<SheetRow>) => void;
  onRemove: (i: number) => void;
  onAddShift: (i: number) => void;
  onAssignSubstitute: (i: number) => void;
  onAddMember?: () => void;
}) {
  return (
    <>
      {title && (
        <tr className="bg-indigo-50/60">
          <td colSpan={11} className="px-2 py-1.5 text-xs font-semibold text-indigo-900">
            <span>{title}</span>
            {canEdit && onAddMember && (
              <button type="button" onClick={onAddMember} className="ms-3 inline-flex items-center gap-1 text-indigo-700 hover:underline">
                <Plus className="size-3" /> {t("remplaçant")}
              </button>
            )}
          </td>
        </tr>
      )}
      {idx.map((i) => {
        const r = rows[i];
        const replacing = r.replacing_employee_id ? optionsById.get(r.replacing_employee_id) : null;
        const substitute = r.substitute_id ? optionsById.get(r.substitute_id) : null;
        const substituteRow = substitute ? rows.find((x) => x.employee_id === substitute.id && x.shift === 1) : undefined;
        const coveredBySubstitute = substituteRow?.replacing_employee_id === r.employee_id;
        return (
          <tr key={`${r.employee_id}-${r.shift}`} className={cn("border-t", STATUS_COLORS[r.status], r.is_extra && "italic")}>
            <td className="px-2 py-1 text-muted-foreground">{r.order_number || "—"}</td>
            <td className="px-2 py-1">{t(POSITION_LABELS[r.position])}</td>
            <td className="px-2 py-1 font-medium">
              {r.name}
              {r.shift > 1 && <span className="ms-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-800">{t("service {n}", { n: r.shift })}</span>}
              {replacing && <div className="text-[11px] font-normal text-muted-foreground">{t("remplace {name}", { name: replacing.name })}</div>}
              {r.is_extra && !replacing && <div className="text-[11px] font-normal text-muted-foreground">{t("ajouté pour la journée")}</div>}
              {substitute && r.shift === 1 && (
                <div className="text-[11px] font-normal text-muted-foreground">
                  {t("Remplaçant : {name}", { name: substitute.name })}
                  {coveredBySubstitute && <span className="ms-1 text-emerald-700">✓ {t("remplace aujourd'hui")}</span>}
                </div>
              )}
            </td>
            <td className="px-2 py-1 text-muted-foreground">{r.rest_day == null ? "—" : t(WEEKDAY_SHORT[r.rest_day])}</td>
            <td className="px-2 py-1">
              <NativeSelect value={r.status} disabled={!canEdit} onChange={(e) => onUpdate(i, { status: e.target.value as AttendanceStatus })} className="min-w-32">
                {ATTENDANCE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(ATTENDANCE_STATUS_LABELS[s])}
                  </option>
                ))}
              </NativeSelect>
              {r.status === "present" && r.rest_day === dow && r.shift === 1 && (
                <button
                  type="button"
                  disabled={!canEdit}
                  className="mt-0.5 block text-start text-[11px] text-violet-700 underline-offset-2 hover:underline"
                  onClick={() => onUpdate(i, { status: "repos_travaille" })}
                >
                  {t("Jour de repos habituel : marquer « Jour de repos travaillé » ?")}
                </button>
              )}
              {substitute && r.shift === 1 && !isWorked(r.status) && !coveredBySubstitute && canEdit && (
                <button type="button" className="mt-0.5 block text-start text-[11px] text-indigo-700 underline-offset-2 hover:underline" onClick={() => onAssignSubstitute(i)}>
                  {t("Faire remplacer par {name}", { name: substitute.name })}
                </button>
              )}
              {r.planned && r.status !== r.planned && (
                <div className="mt-0.5 text-[11px] text-emerald-700">
                  {r.planned === "conge" ? t("Congé accepté pour cette date") : t("Récupération acceptée pour cette date")}
                </div>
              )}
            </td>
            <td className="px-2 py-1">
              <Input type="time" value={r.time_in} disabled={!canEdit || !isWorked(r.status)} onChange={(e) => onUpdate(i, { time_in: e.target.value })} className="w-28" />
            </td>
            <td className="px-2 py-1">
              <Input type="time" value={r.time_out} disabled={!canEdit || !isWorked(r.status)} onChange={(e) => onUpdate(i, { time_out: e.target.value })} className="w-28" />
            </td>
            <td className="px-2 py-1">
              <Input type="number" min={0} max={24} step={0.5} value={r.overtime_hours} disabled={!canEdit || !isWorked(r.status)} onChange={(e) => onUpdate(i, { overtime_hours: Number(e.target.value) })} className="w-20" />
            </td>
            <td className="px-2 py-1">
              <Input value={r.observation} disabled={!canEdit} onChange={(e) => onUpdate(i, { observation: e.target.value })} className="min-w-40" placeholder="—" />
            </td>
            <td className="whitespace-nowrap px-2 py-1 text-[11px] text-muted-foreground" title={t("Date et heure de saisie (la date d'activité est celle de la feuille)")}>
              {r.entered_at ? formatDateTimeFr(r.entered_at) : "—"}
            </td>
            {canEdit && (
              <td className="whitespace-nowrap px-1 py-1">
                <Button variant="ghost" size="icon-xs" title={t("Ajouter un 2e service (jour doublé)")} onClick={() => onAddShift(i)}>
                  <Copy />
                </Button>
                {(r.is_extra || r.shift > 1) && (
                  <Button variant="ghost" size="icon-xs" title={t("Retirer de la feuille")} onClick={() => onRemove(i)}>
                    <Trash2 />
                  </Button>
                )}
              </td>
            )}
          </tr>
        );
      })}
    </>
  );
}

function AddEmployeeDialog({
  date,
  team,
  options,
  rows,
  defaultChauffeurId,
  onClose,
  onAdd,
}: {
  date: string;
  team: TeamType;
  options: EmployeeOption[];
  rows: SheetRow[];
  defaultChauffeurId: string | null;
  onClose: () => void;
  onAdd: (employeeId: string, replacingId: string | null, chauffeurId: string | null) => void;
}) {
  const { t } = useT();
  const present = new Set(rows.map((r) => r.employee_id));
  const candidates = options.filter((o) => !present.has(o.id));
  const chauffeurs = rows.filter((r) => r.position === "chauffeur" && r.shift === 1);
  const [employeeId, setEmployeeId] = useState(candidates[0]?.id ?? "");
  const [replacingId, setReplacingId] = useState("");
  const [chauffeurId, setChauffeurId] = useState(defaultChauffeurId ?? "");

  const teamMembers = rows.filter((r) => r.shift === 1 && (team === "nettoiement" || !chauffeurId || r.employee_id === chauffeurId || r.chauffeur_id === chauffeurId));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{team === "collecte" ? t("Ajouter un remplaçant / renfort") : t("Ajouter un agent à la feuille")}</DialogTitle>
          <DialogDescription>{t("L'agent est ajouté uniquement pour la journée du {date}.", { date: formatDateFr(date) })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("Employé")}</Label>
            <NativeSelect value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {candidates.length === 0 && <option value="">{t("Aucun employé disponible")}</option>}
              {candidates.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} — {t(POSITION_LABELS[o.position])} ({t(TEAM_LABELS[o.team_type])})
                </option>
              ))}
            </NativeSelect>
          </div>
          {team === "collecte" && (
            <div className="space-y-1">
              <Label>{t("Équipe (chauffeur)")}</Label>
              <NativeSelect value={chauffeurId} onChange={(e) => setChauffeurId(e.target.value)}>
                <option value="">{t("— Sans équipe —")}</option>
                {chauffeurs.map((c) => (
                  <option key={c.employee_id} value={c.employee_id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="space-y-1">
            <Label>{t("Remplace (agent en repos) — facultatif")}</Label>
            <NativeSelect value={replacingId} onChange={(e) => setReplacingId(e.target.value)}>
              <option value="">{t("— Renfort, ne remplace personne —")}</option>
              {teamMembers.map((r) => (
                <option key={r.employee_id} value={r.employee_id}>
                  {r.name} ({t(ATTENDANCE_STATUS_LABELS[r.status])})
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("Annuler")}
          </Button>
          <Button disabled={!employeeId} onClick={() => onAdd(employeeId, replacingId || null, chauffeurId || null)}>
            {t("Ajouter")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
