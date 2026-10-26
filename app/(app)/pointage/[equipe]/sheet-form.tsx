"use client";

import { useMemo, useState, useTransition } from "react";
import { cleaningGroups, displayNumbers } from "@/lib/sheet-order";
import { autoOvertime, expectedEnd, fmtHours, standardHours } from "@/lib/overtime";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Lock, Plus, Save, Trash2, UserPlus } from "lucide-react";
import { authorizeLeaveOverride, revokeLeaveOverride, saveSheet } from "@/lib/actions/attendance";
import type { EmployeeOption, SheetRow, ElsewhereRow } from "@/lib/attendance-types";
import { formatDateFr } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/config";
import { formatDateTimeFr } from "@/lib/dates";
import { COLLECTE_STAFF_GROUPS, ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS, POSITION_LABELS, TEAM_LABELS, WEEKDAY_SHORT, WORKED_STATUSES, isSubstitutePosition, type AttendanceStatus, type TeamType , POSITIONS, type Position, WEEKDAY_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  /** Camions actifs (camion du jour des chauffeurs) */
  trucks: { id: string; matricule: string; brand: string }[];
  /** Peut autoriser une modification sur une date de congé approuvé (droits congés + pointage) */
  canAuthorize?: boolean;
  /** Date fériée : « Présent » s'affiche « Jour férié travaillé » (même statut enregistré) */
  isHoliday?: boolean;
  /** Employés déjà pointés ce jour dans l'autre équipe */
  elsewhere?: ElsewhereRow[];
};

/** Fonctions du jour rattachées à une équipe de camion (chauffeur). */
const TEAM_MEMBER_POSITIONS: Position[] = ["rippeur", "rippeur_remplacant", "chauffeur_remplacant", "balayeur", "autre", "mecanicien", "gardien"];

const LEAVE_WARNING =
  "Attention : cet employé bénéficie d'un congé approuvé pour cette date. Le pointage est automatiquement défini sur « Congé ». Toute modification nécessite une autorisation.";

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
/** Départ anticipé pour maladie (choisi explicitement) : heures saisies conservées, comptées en HS manuelles */
const sickDeparture = (r: SheetRow) => r.status === "absent_maladie" && !!r.sick_departure;

export function SheetForm({ date, team, initialRows, initialTeamLead, teamLeadOptions, options, canEdit, agency, company, logo, trucks, canAuthorize = false, isHoliday = false, elsewhere = [] }: Props) {
  const { t } = useT();
  const router = useRouter();
  const [rows, setRows] = useState<SheetRow[]>(initialRows);
  const [teamLead, setTeamLead] = useState(initialTeamLead);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState<{ chauffeurId: string | null } | null>(null);
  const [overrideFor, setOverrideFor] = useState<number | null>(null);

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
      { ...base, id: null, shift: maxShift + 1, status: "present", time_in: "", time_out: "", overtime_manual: 0, overtime_auto: 0, observation: "", entered_at: null },
      ...prev.slice(idx + 1),
    ]);
    setDirty(true);
  };
  const addEmployee = (employeeId: string, replacingId: string | null, chauffeurId: string | null, dayPosition: Position) => {
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
        overtime_manual: 0,
        overtime_auto: 0,
        observation: "",
        entered_at: null,
        planned: null,
        replacing_employee_id: replacingId,
        chauffeur_id: team === "collecte" && dayPosition !== "chauffeur" ? chauffeurId : null,
        // Fonction du jour choisie à l'ajout ; la fiche de l'employé n'est pas modifiée
        position: dayPosition,
        usual_position: o.position,
        team_type: team,
        order_number: o.order_number,
        name: o.name,
        matricule: o.matricule,
        rest_day: o.rest_day,
        is_extra: true,
        substitute_id: o.substitute_id,
        truck_id: null,
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
    if (subIndex < 0) return addEmployee(titular.substitute_id, titular.employee_id, crewChauffeur, optionsById.get(titular.substitute_id)?.position ?? (titular.position === "chauffeur" ? "chauffeur_remplacant" : "rippeur_remplacant"));
    const sub = rows[subIndex];
    if (sub.replacing_employee_id && sub.replacing_employee_id !== titular.employee_id) {
      const other = optionsById.get(sub.replacing_employee_id);
      if (!window.confirm(t("{name} remplace déjà {other} ce jour. Le réaffecter ?", { name: sub.name, other: other?.name ?? "?" }))) return;
    }
    update(subIndex, {
      replacing_employee_id: titular.employee_id,
      chauffeur_id: crewChauffeur,
      ...(titular.position === "chauffeur" ? { truck_id: titular.truck_id } : {}),
      status: isWorked(sub.status) ? sub.status : sub.rest_day === dow ? "repos_travaille" : "present",
    });
  };

  const save = () =>
    start(async () => {
      let r = await saveSheet({ activity_date: date, team_type: team, team_lead: teamLead, rows });
      if (!r.ok && r.conflicts?.length) {
        if (!window.confirm(`${t("Affectations à confirmer :")}\n\n• ${r.conflicts.join("\n• ")}\n\n${t("Confirmer et enregistrer ?")}`)) return;
        r = await saveSheet({ activity_date: date, team_type: team, team_lead: teamLead, rows, confirm_conflicts: true });
      }
      if (r.ok) {
        toast.success(r.message);
        setDirty(false);
        router.refresh();
      } else toast.error(r.error);
    });

  // Regroupement : collecte = par chauffeur ; nettoiement = liste simple
  const groups = useMemo(() => {
    type Group = { key: string; title: string | null; chauffeurId: string | null; idx: number[]; tone?: string };
    if (team === "nettoiement")
      return cleaningGroups(rows).map((g, n) => ({
        key: g.key,
        chauffeurId: null,
        idx: g.idx,
        tone: g.restDay === "autres" ? undefined : n % 2 ? "bg-sky-50 text-sky-950 dark:bg-sky-950/40 dark:text-sky-100" : "bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100",
        title:
          g.restDay === "autres"
            ? t("Autres fonctions — {count} employé(s)", { count: g.employees })
            : g.restDay === null
              ? t("Repos non défini — {count} employé(s)", { count: g.employees })
              : t("Repos : {day} — {count} employé(s)", { day: t(WEEKDAY_LABELS[g.restDay]), count: g.employees }),
      })) as Group[];
    const chauffeurs = rows.filter((r) => r.position === "chauffeur" && r.shift === 1);
    const used = new Set<number>();
    const result: Group[] = [];
    const staffGroup = (g: (typeof COLLECTE_STAFF_GROUPS)[number]) => {
      const idx = rows.map((r, i) => (r.position === g.position ? i : -1)).filter((i) => i >= 0);
      idx.forEach((i) => used.add(i));
      if (idx.length) result.push({ key: g.position, title: t(g.title), chauffeurId: null, idx });
    };
    COLLECTE_STAFF_GROUPS.filter((g) => g.placement === "top").forEach(staffGroup);
    result.push(...chauffeurs.map((c) => {
      const idx = rows.map((r, i) => (r.employee_id === c.employee_id || r.chauffeur_id === c.employee_id ? i : -1)).filter((i) => i >= 0);
      idx.forEach((i) => used.add(i));
      const driver = idx.map((i) => rows[i]).find((r) => (r.employee_id === c.employee_id || r.position === "chauffeur_remplacant") && isWorked(r.status) && r.truck_id);
      const plate = (driver?.truck_id ? trucks.find((tr) => tr.id === driver.truck_id)?.matricule : null) ?? (c.truck_id ? trucks.find((tr) => tr.id === c.truck_id)?.matricule : null);
      const title = plate ? t("Équipe {name} — camion {plate}", { name: c.name, plate }) : t("Équipe {name}", { name: c.name });
      return { key: c.employee_id, title, chauffeurId: c.employee_id, idx };
    }));
    COLLECTE_STAFF_GROUPS.filter((g) => g.placement === "after").forEach(staffGroup);
    const rest = rows.map((_, i) => i).filter((i) => !used.has(i));
    const freeSubstitutes = rest.filter((i) => isSubstitutePosition(rows[i].position));
    const others = rest.filter((i) => !isSubstitutePosition(rows[i].position));
    if (freeSubstitutes.length) result.push({ key: "subs", title: t("Remplaçants sans remplacement ce jour"), chauffeurId: null, idx: freeSubstitutes });
    if (others.length) result.push({ key: "none", title: t("Sans équipe affectée"), chauffeurId: null, idx: others });
    return result;
  }, [rows, team, t, trucks]);

  // Numérotation 1, 2, 3… dans l'ordre affiché (jamais un identifiant)
  const numbers = useMemo(() => displayNumbers(rows, groups.flatMap((g) => g.idx)), [rows, groups]);

  const supervisorNames = useMemo(
    () =>
      Array.from(new Set(rows.filter((r) => r.position === "superviseur").map((r) => r.name)))
        .join(", "),
    [rows],
  );

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
          {team === "collecte" && (
            <div className="mt-1">
              <span className="text-muted-foreground">{t("Superviseur")} : </span>
              <span className="font-medium">{supervisorNames || t("aucun (ajoutez un employé au poste Superviseur)")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-start" title={t("Numéro d'ordre dans la liste (calculé automatiquement, ce n'est pas un matricule)")}>{t("N°")}</th>
              <th className="px-2 py-2 text-start">{t("Poste")}</th>
              <th className="px-2 py-2 text-start">{t("Nom et prénom")}</th>
              <th className="px-2 py-2 text-start">{t("Repos")}</th>
              <th className="px-2 py-2 text-start">{t("Statut / motif")}</th>
              <th className="px-2 py-2 text-start">{t("H. entrée")}</th>
              <th className="px-2 py-2 text-start">{t("H. sortie")}</th>
              <th className="px-2 py-2 text-start" title={t("Heures supplémentaires : automatiques (après l'heure de fin normale) + manuelles (accordées par le responsable)")}>
                {t("HS")}
                <span className="block text-[10px] font-normal text-muted-foreground">{t("auto + manuel")}</span>
              </th>
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
                tone={g.tone}
                numbers={numbers}
                rows={rows}
                idx={g.idx}
                canEdit={canEdit}
                optionsById={optionsById}
                onUpdate={update}
                onRemove={remove}
                onAddShift={addShift}
                onAssignSubstitute={assignSubstitute}
                canAuthorize={canAuthorize}
                isHoliday={isHoliday}
                onAuthorize={(i) => setOverrideFor(i)}
                onRevoke={(i) => {
                  const ov = rows[i].leave_override;
                  if (!ov || !window.confirm(t("Retirer l'autorisation ? Le pointage repassera en « Congé ».")))
                    return;
                  start(async () => {
                    const r = await revokeLeaveOverride(ov.id);
                    if (r.ok) {
                      update(i, { leave_override: null, status: "conge", time_in: "", time_out: "", overtime_manual: 0 });
                      toast.success(r.message);
                    } else toast.error(r.error);
                  });
                }}
                trucks={trucks}
                teams={team === "collecte" ? rows.filter((x) => x.position === "chauffeur" && x.shift === 1).map((x) => ({ id: x.employee_id, name: x.name })) : []}
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
            {t("Employés")} : <strong>{new Set(rows.map((r) => r.employee_id)).size}</strong>
            {rows.length !== new Set(rows.map((r) => r.employee_id)).size && <span> · {t("{count} ligne(s)", { count: rows.length })}</span>}
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

      {overrideFor != null && rows[overrideFor] && (
        <LeaveOverrideDialog
          name={rows[overrideFor].name}
          date={date}
          onClose={() => setOverrideFor(null)}
          onConfirm={(reason) =>
            start(async () => {
              const r = await authorizeLeaveOverride(rows[overrideFor].employee_id, date, reason);
              if (r.ok && r.data) {
                update(overrideFor, { leave_override: r.data });
                toast.success(r.message, { duration: 7000 });
                setOverrideFor(null);
              } else if (!r.ok) toast.error(r.error, { duration: 8000 });
            })
          }
          pending={pending}
        />
      )}

      {adding && <AddEmployeeDialog date={date} team={team} options={options} rows={rows} elsewhere={elsewhere} defaultChauffeurId={adding.chauffeurId} onClose={() => setAdding(null)} onAdd={addEmployee} />}
    </div>
  );
}

function GroupRows({
  t,
  dow,
  title,
  tone,
  numbers,
  rows,
  idx,
  canEdit,
  optionsById,
  onUpdate,
  onRemove,
  onAddShift,
  onAssignSubstitute,
  canAuthorize,
  isHoliday,
  onAuthorize,
  onRevoke,
  trucks,
  teams,
  onAddMember,
}: {
  tone?: string;
  /** Numéro d'affichage de chaque ligne (1, 2, 3… dans l'ordre de la liste) */
  numbers: Map<number, number>;
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
  canAuthorize: boolean;
  isHoliday: boolean;
  onAuthorize: (i: number) => void;
  onRevoke: (i: number) => void;
  trucks: { id: string; matricule: string; brand: string }[];
  teams: { id: string; name: string }[];
  onAddMember?: () => void;
}) {
  return (
    <>
      {title && (
        <tr className={cn("bg-indigo-50/60", tone && "border-t-2 border-t-emerald-300")}>
          <td colSpan={11} className={cn("px-2 py-1.5 text-xs font-semibold text-indigo-900", tone)}>
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
        const teamHeads = rows.filter((x) => x.position === "chauffeur" && x.shift === 1 && x.employee_id !== r.employee_id);
        const replacing = r.replacing_employee_id ? optionsById.get(r.replacing_employee_id) : null;
        const substitute = r.substitute_id ? optionsById.get(r.substitute_id) : null;
        const substituteRow = substitute ? rows.find((x) => x.employee_id === substitute.id && x.shift === 1) : undefined;
        const coveredBySubstitute = substituteRow?.replacing_employee_id === r.employee_id;
        return (
          <tr key={`${r.employee_id}-${r.shift}`} className={cn("border-t", STATUS_COLORS[r.status], r.is_extra && "italic")}>
            <td className="px-2 py-1 font-semibold tabular-nums text-muted-foreground" title={[r.matricule && `${t("Matricule")} ${r.matricule}`, r.order_number && `${t("NB")} ${r.order_number}`].filter(Boolean).join(" · ") || undefined}>
              {numbers.get(i) ?? ""}
            </td>
            <td className="px-2 py-1">
              {canEdit ? (
                <NativeSelect
                  className="h-7 w-auto min-w-28 py-0 text-xs not-italic"
                  aria-label={t("Fonction du jour")}
                  title={t("Fonction du jour")}
                  value={r.position}
                  onChange={(e) => {
                    const p = e.target.value as Position;
                    onUpdate(i, { position: p, ...(p === "chauffeur" ? { chauffeur_id: null } : {}), ...(p !== "chauffeur" && p !== "chauffeur_remplacant" ? { truck_id: null } : {}) });
                  }}
                >
                  {!POSITIONS.includes(r.position) && <option value={r.position}>{t("{position} (poste retiré)", { position: t(POSITION_LABELS[r.position] ?? r.position) })}</option>}
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {t(POSITION_LABELS[p])}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                t(POSITION_LABELS[r.position])
              )}
              {r.usual_position && r.usual_position !== r.position && (
                <div className="mt-0.5 text-[11px] font-normal not-italic text-amber-700 dark:text-amber-400">{t("habituellement {usual}", { usual: t(POSITION_LABELS[r.usual_position]) })}</div>
              )}
              {canEdit && r.team_type === "collecte" && r.shift === 1 && TEAM_MEMBER_POSITIONS.includes(r.position) && (
                <NativeSelect className="mt-1 h-6 w-auto py-0 text-[11px] not-italic" aria-label={t("Équipe (chauffeur)")} value={r.chauffeur_id ?? ""} onChange={(e) => onUpdate(i, { chauffeur_id: e.target.value || null })}>
                  <option value="">{t("— Sans équipe —")}</option>
                  {teamHeads.map((h) => (
                    <option key={h.employee_id} value={h.employee_id}>
                      {t("Équipe {name}", { name: h.name })}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </td>
            <td className="px-2 py-1 font-medium">
              {r.name}
              {r.shift > 1 && <span className="ms-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-800">{t("service {n}", { n: r.shift })}</span>}
              {replacing && <div className="text-[11px] font-normal text-muted-foreground">{t("remplace {name}", { name: replacing.name })}</div>}
              {r.is_extra && !replacing && <div className="text-[11px] font-normal text-muted-foreground">{t("ajouté pour la journée")}</div>}
              {canEdit && r.team_type === "collecte" && r.shift === 1 && (r.position === "chauffeur" || (r.position === "chauffeur_remplacant" && r.chauffeur_id)) && isWorked(r.status) && (
                <label className="mt-1 flex items-center gap-1 text-[11px] font-normal not-italic text-muted-foreground">
                  {t("Camion du jour")}
                  <NativeSelect className="h-6 w-auto py-0 text-xs" value={r.truck_id ?? ""} onChange={(e) => onUpdate(i, { truck_id: e.target.value || null })}>
                    <option value="">{t("— Aucun —")}</option>
                    {trucks.map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {tr.matricule}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {!canEdit && r.truck_id && (r.position === "chauffeur" || r.position === "chauffeur_remplacant") && (
                <div className="text-[11px] font-normal text-muted-foreground">{t("Camion {matricule}", { matricule: trucks.find((tr) => tr.id === r.truck_id)?.matricule ?? "?" })}</div>
              )}
              {canEdit && r.team_type === "collecte" && r.shift === 1 && (r.position === "rippeur" || r.position === "rippeur_remplacant") && teams.length > 0 && (
                <label className="mt-1 flex items-center gap-1 text-[11px] font-normal not-italic text-muted-foreground">
                  {t("Équipe du jour")}
                  <NativeSelect className="h-6 w-auto py-0 text-xs" value={r.chauffeur_id ?? ""} onChange={(e) => onUpdate(i, { chauffeur_id: e.target.value || null })}>
                    <option value="">{t("— Sans équipe —")}</option>
                    {teams.map((tm) => (
                      <option key={tm.id} value={tm.id}>
                        {tm.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {substitute && r.shift === 1 && (
                <div className="text-[11px] font-normal text-muted-foreground">
                  {t("Remplaçant : {name}", { name: substitute.name })}
                  {coveredBySubstitute && <span className="ms-1 text-emerald-700">✓ {t("remplace aujourd'hui")}</span>}
                </div>
              )}
            </td>
            <td className="px-2 py-1 text-muted-foreground">{r.rest_day == null ? "—" : t(WEEKDAY_SHORT[r.rest_day])}</td>
            <td className="px-2 py-1">
              <NativeSelect
                value={r.status}
                disabled={!canEdit}
                onChange={(e) => {
                  const next = e.target.value as AttendanceStatus;
                  // Congé approuvé : changement bloqué, sauf modification autorisée
                  if (r.leave_lock && !r.leave_override && next !== "conge") {
                    toast.warning(t(LEAVE_WARNING), { duration: 9000 });
                    return;
                  }
                  onUpdate(i, { status: next, ...(next !== "absent_maladie" ? { sick_departure: false } : {}) });
                }}
                className={cn("min-w-32", r.leave_lock && !r.leave_override && "border-emerald-400 font-medium")}
              >
                {ATTENDANCE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {isHoliday && s === "present" ? t("Jour férié travaillé") : isHoliday && s === "repos_travaille" ? t("Jour férié travaillé (jour de repos)") : t(ATTENDANCE_STATUS_LABELS[s])}
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
              {r.status === "absent_maladie" && (
                <div className="mt-1 space-y-1 rounded-md border border-rose-200 bg-rose-50/70 p-1.5 text-[11px] not-italic dark:border-rose-900 dark:bg-rose-950/30">
                  <label className="flex items-start gap-1.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-3.5"
                      checked={!!r.sick_departure}
                      disabled={!canEdit}
                      onChange={(e) => onUpdate(i, e.target.checked ? { sick_departure: true } : { sick_departure: false, time_in: "", time_out: "", overtime_manual: 0 })}
                    />
                    <span>
                      <span className="font-medium">{t("Départ anticipé pour maladie")}</span>
                      <span className="block text-muted-foreground">{t("A commencé le travail puis est parti malade : 0 h normales ; saisissez l'entrée, le départ et les heures réellement travaillées (colonne HS).")}</span>
                    </span>
                  </label>
                  {r.sick_departure && (
                    <label className="block">
                      <span className="font-medium">{t("Commentaire")}</span>
                      <Input value={r.observation} disabled={!canEdit} onChange={(e) => onUpdate(i, { observation: e.target.value })} className="mt-0.5 h-7 text-xs" placeholder={t("Motif, détails…")} />
                    </label>
                  )}
                </div>
              )}
              {r.leave_lock && !r.leave_override && (
                <div className="mt-0.5 space-y-0.5 text-[11px]">
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                    <Lock className="size-3" /> {t("Congé approuvé")}
                  </span>
                  {canEdit && canAuthorize && (
                    <button type="button" className="block text-start text-indigo-700 underline-offset-2 hover:underline" onClick={() => onAuthorize(i)}>
                      {t("Autoriser la modification")}
                    </button>
                  )}
                </div>
              )}
              {r.leave_lock && r.leave_override && (
                <div className="mt-0.5 space-y-0.5 text-[11px]">
                  <span className="block font-semibold text-orange-700" title={r.leave_override.reason}>
                    {t("Modification autorisée : {reason}", { reason: r.leave_override.reason })}
                  </span>
                  {canEdit && canAuthorize && (
                    <button type="button" className="block text-start text-indigo-700 underline-offset-2 hover:underline" onClick={() => onRevoke(i)}>
                      {t("Rétablir le congé")}
                    </button>
                  )}
                </div>
              )}
              {r.planned && r.status !== r.planned && !r.leave_lock && (
                <div className="mt-0.5 text-[11px] text-emerald-700">
                  {r.planned === "conge" ? t("Congé accepté pour cette date") : t("Récupération acceptée pour cette date")}
                </div>
              )}
            </td>
            <td className="px-2 py-1">
              <Input type="time" value={r.time_in} disabled={!canEdit || !(isWorked(r.status) || sickDeparture(r))} onChange={(e) => onUpdate(i, { time_in: e.target.value })} className="w-28" />
              {isWorked(r.status) && expectedEnd(r.time_in) && (
                <div className="mt-0.5 text-[10px] text-muted-foreground not-italic" title={t("Journée standard de 8 h à partir de l'heure d'entrée")}>
                  {t("fin prévue {time}", { time: expectedEnd(r.time_in)!.time })}
                  {expectedEnd(r.time_in)!.nextDay ? ` ${t("(lendemain)")}` : ""}
                </div>
              )}
            </td>
            <td className="px-2 py-1">
              <Input type="time" value={r.time_out} disabled={!canEdit || !(isWorked(r.status) || sickDeparture(r))} onChange={(e) => onUpdate(i, { time_out: e.target.value })} className="w-28" />
              {sickDeparture(r) && <div className="mt-0.5 text-[10px] text-muted-foreground not-italic">{t("heure de départ")}</div>}
            </td>
            <td className="px-2 py-1">
              {(() => {
                const auto = autoOvertime(r.time_in, r.time_out, r.status);
                const manual = Number(r.overtime_manual) || 0;
                return (
                  <div className="space-y-0.5">
                    <Input
                      type="number"
                      min={0}
                      max={24}
                      step={0.5}
                      value={r.overtime_manual}
                      aria-label={t("Heures supplémentaires manuelles")}
                      title={t("Heures supplémentaires manuelles (ajoutées aux heures automatiques)")}
                      disabled={!canEdit || !(isWorked(r.status) || sickDeparture(r))}
                      onChange={(e) => onUpdate(i, { overtime_manual: Number(e.target.value) })}
                      className="w-20"
                    />
                    {sickDeparture(r) ? (
                      <div className="text-[10px] leading-tight text-rose-800 not-italic dark:text-rose-300">
                        {t("0 h normales · {h} h travaillées (HS manuelles)", { h: fmtHours(manual) })}
                      </div>
                    ) : isWorked(r.status) && (
                      <div className="text-[10px] leading-tight text-muted-foreground not-italic">{t("{h} h normales", { h: standardHours(r.status) })}</div>
                    )}
                    {isWorked(r.status) && (auto > 0 || manual > 0) && (
                      <div className="text-[10px] leading-tight text-muted-foreground not-italic">
                        {t("Auto {auto} + manuel {manual}", { auto: fmtHours(auto), manual: fmtHours(manual) })}
                        <span className="block font-semibold text-foreground">{t("Total {total} h", { total: fmtHours(auto + manual) })}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </td>
            <td className="px-2 py-1">
              <Input value={r.observation} disabled={!canEdit} onChange={(e) => onUpdate(i, { observation: e.target.value })} className="min-w-40" placeholder="—" />
            </td>
            <td className="whitespace-nowrap px-2 py-1 text-[11px] text-muted-foreground" title={t("Date et heure de saisie (la date d'activité est celle de la feuille)")}>
              {r.entered_at ? formatDateTimeFr(r.entered_at) : "—"}
            </td>
            {canEdit && (
              <td className="whitespace-nowrap px-1 py-1">
                {!(r.leave_lock && !r.leave_override) && (
                  <Button variant="ghost" size="icon-xs" title={t("Ajouter un 2e service (jour doublé)")} onClick={() => onAddShift(i)}>
                    <Copy />
                  </Button>
                )}
                {(r.is_extra || r.shift > 1) && !(r.leave_lock && !r.leave_override) && (
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
  elsewhere,
  onClose,
  onAdd,
}: {
  date: string;
  team: TeamType;
  options: EmployeeOption[];
  rows: SheetRow[];
  elsewhere: ElsewhereRow[];
  defaultChauffeurId: string | null;
  onClose: () => void;
  onAdd: (employeeId: string, replacingId: string | null, chauffeurId: string | null, dayPosition: Position) => void;
}) {
  const { t } = useT();
  const present = new Set(rows.map((r) => r.employee_id));
  const candidates = options.filter((o) => !present.has(o.id));
  const chauffeurs = rows.filter((r) => r.position === "chauffeur" && r.shift === 1);
  const [employeeId, setEmployeeId] = useState(candidates[0]?.id ?? "");
  const [replacingId, setReplacingId] = useState("");
  const [chauffeurId, setChauffeurId] = useState(defaultChauffeurId ?? "");
  const otherTeam = new Map(elsewhere.map((x) => [x.employee_id, x]));
  // Fonction du jour proposée : rippeur dans une équipe de camion, balayeur au nettoiement, sinon la fonction habituelle
  const suggest = (id: string, chauf: string): Position => {
    const o = options.find((x) => x.id === id);
    if (!o) return team === "nettoiement" ? "balayeur" : "rippeur";
    if (team === "nettoiement") return o.team_type === "nettoiement" ? o.position : "balayeur";
    if (chauf && o.position !== "rippeur" && o.position !== "rippeur_remplacant") return "rippeur";
    return o.team_type === "collecte" ? o.position : "rippeur";
  };
  const [dayPosition, setDayPosition] = useState<Position>(() => suggest(candidates[0]?.id ?? "", defaultChauffeurId ?? ""));

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
            <NativeSelect
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setDayPosition(suggest(e.target.value, chauffeurId));
              }}
            >
              {candidates.length === 0 && <option value="">{t("Aucun employé disponible")}</option>}
              {candidates.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} — {t(POSITION_LABELS[o.position])} ({t(TEAM_LABELS[o.team_type])})
                  {otherTeam.has(o.id) ? ` — ${t("déjà pointé : {team}", { team: t(TEAM_LABELS[otherTeam.get(o.id)!.team_type]) })}` : ""}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">{t("Tout employé actif peut être affecté, quelle que soit sa fonction habituelle.")}</p>
          </div>
          <div className="space-y-1">
            <Label>{t("Fonction du jour")}</Label>
            <NativeSelect value={dayPosition} onChange={(e) => setDayPosition(e.target.value as Position)}>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {t(POSITION_LABELS[p])}
                </option>
              ))}
            </NativeSelect>
            {employeeId && options.find((o) => o.id === employeeId)?.position !== dayPosition && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t("Fonction habituelle : {usual} — la fiche de l'employé n'est pas modifiée.", { usual: t(POSITION_LABELS[options.find((o) => o.id === employeeId)!.position]) })}
              </p>
            )}
          </div>
          {team === "collecte" && (
            <div className="space-y-1">
              <Label>{t("Équipe (chauffeur)")}</Label>
              <NativeSelect
                value={chauffeurId}
                onChange={(e) => {
                  setChauffeurId(e.target.value);
                  setDayPosition(suggest(employeeId, e.target.value));
                }}
              >
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
          <Button disabled={!employeeId} onClick={() => onAdd(employeeId, replacingId || null, chauffeurId || null, dayPosition)}>
            {t("Ajouter")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Autorisation explicite d'une modification sur une date de congé approuvé (motif obligatoire, journalisé). */
function LeaveOverrideDialog({ name, date, onClose, onConfirm, pending }: { name: string; date: string; onClose: () => void; onConfirm: (reason: string) => void; pending: boolean }) {
  const { t } = useT();
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Autoriser la modification")}</DialogTitle>
          <DialogDescription>
            {t("{name} bénéficie d'un congé approuvé le {date}. En autorisant la modification, vous pourrez changer son statut pour cette date uniquement. La demande de congé n'est pas modifiée ; votre nom, la date et le motif sont enregistrés dans l'historique. Si le congé lui-même doit changer, modifiez ou annulez la demande dans Congé / Récupération.", { name, date: formatDateFr(date) })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="override-reason">{t("Motif (obligatoire)")}</Label>
          <Textarea id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={t("Ex. rappelé pour une urgence, congé annulé oralement…")} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("Annuler")}
          </Button>
          <Button onClick={() => onConfirm(reason)} disabled={pending || reason.trim().length < 5}>
            {t("Autoriser la modification")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
