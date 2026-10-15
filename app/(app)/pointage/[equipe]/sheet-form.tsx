"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Plus, Save, Trash2, UserPlus } from "lucide-react";
import { saveSheet } from "@/lib/actions/attendance";
import type { EmployeeOption, SheetRow } from "@/lib/attendance-types";
import { formatDateFr } from "@/lib/dates";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  POSITION_LABELS,
  WEEKDAY_SHORT,
  type AttendanceStatus,
  type TeamType,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  date: string;
  team: TeamType;
  initialRows: SheetRow[];
  initialTeamLead: string;
  options: EmployeeOption[];
  canEdit: boolean;
  agency: string;
  company: string;
};

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: "",
  repos: "bg-amber-50",
  ferie: "bg-sky-50",
  absent: "bg-red-50",
  absent_maladie: "bg-orange-50",
  conge: "bg-emerald-50",
};

export function SheetForm({ date, team, initialRows, initialTeamLead, options, canEdit, agency, company }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<SheetRow[]>(initialRows);
  const [teamLead, setTeamLead] = useState(initialTeamLead);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState<{ chauffeurId: string | null } | null>(null);

  const optionsById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

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
    if (maxShift >= 3) return toast.error("Maximum 3 services par jour.");
    setRows((prev) => [
      ...prev.slice(0, idx + 1),
      { ...base, id: null, shift: maxShift + 1, status: "present", time_in: "", time_out: "", overtime_hours: 0, observation: "" },
      ...prev.slice(idx + 1),
    ]);
    setDirty(true);
  };
  const addEmployee = (employeeId: string, replacingId: string | null, chauffeurId: string | null) => {
    const o = optionsById.get(employeeId);
    if (!o) return;
    if (rows.some((r) => r.employee_id === employeeId && r.shift === 1)) {
      return toast.error("Cet employé figure déjà sur la feuille.");
    }
    setRows((prev) => [
      ...prev,
      {
        id: null,
        employee_id: o.id,
        shift: 1,
        status: "present",
        time_in: "",
        time_out: "",
        overtime_hours: 0,
        observation: "",
        replacing_employee_id: replacingId,
        chauffeur_id: team === "collecte" && o.position !== "chauffeur" ? chauffeurId : null,
        position: team === "nettoiement" ? "balayeur" : o.position === "chauffeur" ? "chauffeur" : "rippeur",
        team_type: team,
        order_number: o.order_number,
        name: o.name,
        matricule: o.matricule,
        rest_day: o.rest_day,
        is_extra: true,
      },
    ]);
    setDirty(true);
    setAdding(null);
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
    if (team === "nettoiement") return [{ key: "all", title: null as string | null, chauffeurId: null as string | null, idx: rows.map((_, i) => i) }];
    const chauffeurs = rows.filter((r) => r.position === "chauffeur" && r.shift === 1);
    const used = new Set<number>();
    const result: { key: string; title: string | null; chauffeurId: string | null; idx: number[] }[] = chauffeurs.map((c) => {
      const idx = rows
        .map((r, i) => (r.employee_id === c.employee_id || r.chauffeur_id === c.employee_id ? i : -1))
        .filter((i) => i >= 0);
      idx.forEach((i) => used.add(i));
      return { key: c.employee_id, title: `Équipe ${c.name}`, chauffeurId: c.employee_id, idx };
    });
    const rest = rows.map((_, i) => i).filter((i) => !used.has(i));
    if (rest.length) result.push({ key: "none", title: "Sans équipe affectée", chauffeurId: null, idx: rest });
    return result;
  }, [rows, team]);

  const counts = useMemo(() => {
    const c: Partial<Record<AttendanceStatus, number>> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* En-tête de la feuille (logo, agence, chef d'équipe, date) */}
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-center">
        <div className="flex size-14 items-center justify-center rounded-lg bg-indigo-600 text-xl font-bold text-white">{company.slice(0, 1)}</div>
        <div className="text-sm">
          <div className="text-muted-foreground">Agence</div>
          <div className="font-medium">{agency}</div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="team_lead" className="text-muted-foreground">
            Chef d&apos;équipe
          </Label>
          <Input id="team_lead" value={teamLead} disabled={!canEdit} onChange={(e) => { setTeamLead(e.target.value); setDirty(true); }} placeholder="Nom du chef d'équipe" />
        </div>
        <div className="text-sm sm:text-right">
          <div className="text-muted-foreground">Date</div>
          <div className="font-medium">{formatDateFr(date)}</div>
        </div>
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">NB</th>
              <th className="px-2 py-2 text-left">Poste</th>
              <th className="px-2 py-2 text-left">Nom et prénom</th>
              <th className="px-2 py-2 text-left">Repos</th>
              <th className="px-2 py-2 text-left">Statut / motif</th>
              <th className="px-2 py-2 text-left">H. entrée</th>
              <th className="px-2 py-2 text-left">H. sortie</th>
              <th className="px-2 py-2 text-left">HS</th>
              <th className="px-2 py-2 text-left">Observation</th>
              {canEdit && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows
                key={g.key}
                title={g.title}
                rows={rows}
                idx={g.idx}
                canEdit={canEdit}
                optionsById={optionsById}
                onUpdate={update}
                onRemove={remove}
                onAddShift={addShift}
                onAddMember={team === "collecte" && g.chauffeurId ? () => setAdding({ chauffeurId: g.chauffeurId }) : undefined}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-muted-foreground">
                  Aucun employé actif dans cette équipe. Ajoutez des employés dans le module Employés.
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
              {ATTENDANCE_STATUS_LABELS[s]} : <strong>{counts[s]}</strong>
            </span>
          ))}
          <span className="rounded-md border px-2 py-1">Total : <strong>{rows.length}</strong></span>
        </div>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setAdding({ chauffeurId: null })}>
              <UserPlus /> {team === "collecte" ? "Ajouter un remplaçant / renfort" : "Ajouter un agent"}
            </Button>
            <Button onClick={save} disabled={pending || !dirty}>
              <Save /> {pending ? "Enregistrement…" : "Enregistrer la feuille"}
            </Button>
          </div>
        )}
      </div>

      {adding && (
        <AddEmployeeDialog
          date={date}
          team={team}
          options={options}
          rows={rows}
          defaultChauffeurId={adding.chauffeurId}
          onClose={() => setAdding(null)}
          onAdd={addEmployee}
        />
      )}
    </div>
  );
}

function GroupRows({
  title,
  rows,
  idx,
  canEdit,
  optionsById,
  onUpdate,
  onRemove,
  onAddShift,
  onAddMember,
}: {
  title: string | null;
  rows: SheetRow[];
  idx: number[];
  canEdit: boolean;
  optionsById: Map<string, EmployeeOption>;
  onUpdate: (i: number, patch: Partial<SheetRow>) => void;
  onRemove: (i: number) => void;
  onAddShift: (i: number) => void;
  onAddMember?: () => void;
}) {
  return (
    <>
      {title && (
        <tr className="bg-indigo-50/60">
          <td colSpan={10} className="px-2 py-1.5 text-xs font-semibold text-indigo-900">
            <span>{title}</span>
            {canEdit && onAddMember && (
              <button type="button" onClick={onAddMember} className="ml-3 inline-flex items-center gap-1 text-indigo-700 hover:underline">
                <Plus className="size-3" /> remplaçant
              </button>
            )}
          </td>
        </tr>
      )}
      {idx.map((i) => {
        const r = rows[i];
        const replacing = r.replacing_employee_id ? optionsById.get(r.replacing_employee_id) : null;
        return (
          <tr key={`${r.employee_id}-${r.shift}`} className={cn("border-t", STATUS_COLORS[r.status], r.is_extra && "italic")}>
            <td className="px-2 py-1 text-muted-foreground">{r.order_number || "—"}</td>
            <td className="px-2 py-1">{POSITION_LABELS[r.position]}</td>
            <td className="px-2 py-1 font-medium">
              {r.name}
              {r.shift > 1 && <span className="ml-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-800">service {r.shift}</span>}
              {replacing && <div className="text-[11px] font-normal text-muted-foreground">remplace {replacing.name}</div>}
              {r.is_extra && !replacing && <div className="text-[11px] font-normal text-muted-foreground">ajouté pour la journée</div>}
            </td>
            <td className="px-2 py-1 text-muted-foreground">{r.rest_day == null ? "—" : WEEKDAY_SHORT[r.rest_day]}</td>
            <td className="px-2 py-1">
              <NativeSelect value={r.status} disabled={!canEdit} onChange={(e) => onUpdate(i, { status: e.target.value as AttendanceStatus })} className="min-w-32">
                {ATTENDANCE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ATTENDANCE_STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </td>
            <td className="px-2 py-1">
              <Input type="time" value={r.time_in} disabled={!canEdit || r.status !== "present"} onChange={(e) => onUpdate(i, { time_in: e.target.value })} className="w-28" />
            </td>
            <td className="px-2 py-1">
              <Input type="time" value={r.time_out} disabled={!canEdit || r.status !== "present"} onChange={(e) => onUpdate(i, { time_out: e.target.value })} className="w-28" />
            </td>
            <td className="px-2 py-1">
              <Input type="number" min={0} max={24} step={0.5} value={r.overtime_hours} disabled={!canEdit || r.status !== "present"} onChange={(e) => onUpdate(i, { overtime_hours: Number(e.target.value) })} className="w-20" />
            </td>
            <td className="px-2 py-1">
              <Input value={r.observation} disabled={!canEdit} onChange={(e) => onUpdate(i, { observation: e.target.value })} className="min-w-40" placeholder="—" />
            </td>
            {canEdit && (
              <td className="px-1 py-1 whitespace-nowrap">
                <Button variant="ghost" size="icon-xs" title="Ajouter un 2e service (jour doublé)" onClick={() => onAddShift(i)}>
                  <Copy />
                </Button>
                {(r.is_extra || r.shift > 1) && (
                  <Button variant="ghost" size="icon-xs" title="Retirer de la feuille" onClick={() => onRemove(i)}>
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
          <DialogTitle>{team === "collecte" ? "Ajouter un remplaçant / renfort" : "Ajouter un agent à la feuille"}</DialogTitle>
          <DialogDescription>L&apos;agent est ajouté uniquement pour la journée du {formatDateFr(date)}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Employé</Label>
            <NativeSelect value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {candidates.length === 0 && <option value="">Aucun employé disponible</option>}
              {candidates.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} — {POSITION_LABELS[o.position]} ({o.team_type})
                </option>
              ))}
            </NativeSelect>
          </div>
          {team === "collecte" && (
            <div className="space-y-1">
              <Label>Équipe (chauffeur)</Label>
              <NativeSelect value={chauffeurId} onChange={(e) => setChauffeurId(e.target.value)}>
                <option value="">— Sans équipe —</option>
                {chauffeurs.map((c) => (
                  <option key={c.employee_id} value={c.employee_id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="space-y-1">
            <Label>Remplace (agent en repos) — facultatif</Label>
            <NativeSelect value={replacingId} onChange={(e) => setReplacingId(e.target.value)}>
              <option value="">— Renfort, ne remplace personne —</option>
              {teamMembers.map((r) => (
                <option key={r.employee_id} value={r.employee_id}>
                  {r.name} ({ATTENDANCE_STATUS_LABELS[r.status]})
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!employeeId} onClick={() => onAdd(employeeId, replacingId || null, chauffeurId || null)}>
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
