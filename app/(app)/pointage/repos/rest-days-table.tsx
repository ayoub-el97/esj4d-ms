"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { setRestDay, setSubstitute } from "@/lib/actions/employees";
import { useT } from "@/lib/i18n/client";
import { POSITIONS, POSITION_LABELS, SUBSTITUTE_POSITION, TEAM_LABELS, WEEKDAY_LABELS, type Position, type TeamType } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type RestDayRow = {
  id: string;
  order_number: number;
  matricule: string;
  name: string;
  position: Position;
  team_type: TeamType;
  crew: string;
  rest_day: number | null;
  substitute_id: string | null;
};

type Substitute = { id: string; name: string; position: Position; rest_day: number | null };

export function RestDaysTable({ rows: initial, substitutes, canEdit }: { rows: RestDayRow[]; substitutes: Substitute[]; canEdit: boolean }) {
  const { t } = useT();
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");
  const [poste, setPoste] = useState("");
  const [pending, start] = useTransition();

  const dayName = (d: number | null) => (d == null ? "—" : t(WEEKDAY_LABELS[d]));

  const visible = useMemo(
    () =>
      rows
        .filter((r) => !team || r.team_type === team)
        .filter((r) => !poste || r.position === poste)
        .filter((r) => !q || `${r.name} ${r.matricule}`.toLowerCase().includes(q.toLowerCase())),
    [rows, team, poste, q],
  );

  const changeRestDay = (row: RestDayRow, value: string) => {
    const previous = row.rest_day;
    const next = value === "" ? null : Number(value);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, rest_day: next } : r)));
    start(async () => {
      const res = await setRestDay(row.id, value);
      if (res.ok) toast.success(t("{name} : repos le {day}.", { name: row.name, day: dayName(next) }));
      else {
        toast.error(res.error);
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, rest_day: previous } : r)));
      }
    });
  };

  const changeSubstitute = (row: RestDayRow, value: string) => {
    const previous = row.substitute_id;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, substitute_id: value || null } : r)));
    start(async () => {
      const res = await setSubstitute(row.id, value);
      if (res.ok) toast.success(res.message);
      else {
        toast.error(res.error);
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, substitute_id: previous } : r)));
      }
    });
  };

  /** Alerte : le remplaçant a le même jour de repos que le titulaire */
  const sameRestDay = (row: RestDayRow) => {
    const sub = substitutes.find((s) => s.id === row.substitute_id);
    return sub && sub.rest_day != null && sub.rest_day === row.rest_day;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute start-2 top-2 size-4 text-muted-foreground" />
          <Input className="ps-8" placeholder={t("Rechercher un nom ou un matricule…")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect className="w-auto" value={team} onChange={(e) => setTeam(e.target.value)} aria-label={t("Équipe")}>
          <option value="">{t("Toutes les équipes")}</option>
          <option value="collecte">{t("Collecte")}</option>
          <option value="nettoiement">{t("Nettoiement")}</option>
        </NativeSelect>
        <NativeSelect className="w-auto" value={poste} onChange={(e) => setPoste(e.target.value)} aria-label={t("Poste")}>
          <option value="">{t("Tous les postes")}</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {t(POSITION_LABELS[p])}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("NB")}</TableHead>
              <TableHead>{t("Nom et prénom")}</TableHead>
              <TableHead>{t("Poste")}</TableHead>
              <TableHead>{t("Équipe")}</TableHead>
              <TableHead>{t("Jour de repos habituel")}</TableHead>
              <TableHead>{t("Remplaçant attitré")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t("Aucun employé ne correspond aux filtres.")}
                </TableCell>
              </TableRow>
            )}
            {visible.map((r) => {
              const subPosition = SUBSTITUTE_POSITION[r.position];
              const options = subPosition ? substitutes.filter((s) => s.position === subPosition) : [];
              return (
                <TableRow key={r.id}>
                  <TableCell>{r.order_number}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/employes/${r.id}`} className="hover:underline" title={t("Fiche et historique du jour de repos")}>
                      {r.name}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{r.matricule}</div>
                  </TableCell>
                  <TableCell>{t(POSITION_LABELS[r.position])}</TableCell>
                  <TableCell>
                    {t(TEAM_LABELS[r.team_type])}
                    {r.crew && <div className="text-xs text-muted-foreground">{t("Équipe {name}", { name: r.crew })}</div>}
                  </TableCell>
                  <TableCell>
                    <NativeSelect className="w-36" value={r.rest_day ?? ""} disabled={!canEdit || pending} onChange={(e) => changeRestDay(r, e.target.value)} aria-label={t("Jour de repos habituel")}>
                      <option value="">{t("— Non défini —")}</option>
                      {WEEKDAY_LABELS.map((d, i) => (
                        <option key={i} value={i}>
                          {t(d)}
                        </option>
                      ))}
                    </NativeSelect>
                  </TableCell>
                  <TableCell>
                    {subPosition ? (
                      <>
                        <NativeSelect className="min-w-48" value={r.substitute_id ?? ""} disabled={!canEdit || pending} onChange={(e) => changeSubstitute(r, e.target.value)} aria-label={t("Remplaçant attitré")}>
                          <option value="">{t("— Aucun —")}</option>
                          {options.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({t("repos")} : {dayName(s.rest_day)})
                            </option>
                          ))}
                        </NativeSelect>
                        {sameRestDay(r) && <div className="mt-0.5 text-[11px] text-destructive">{t("Attention : même jour de repos que le titulaire.")}</div>}
                        {options.length === 0 && <div className="mt-0.5 text-[11px] text-muted-foreground">{t("Aucun {poste} : créez-en un avec le poste correspondant.", { poste: t(POSITION_LABELS[subPosition]).toLowerCase() })}</div>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
