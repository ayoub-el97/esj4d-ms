import { CODE_DEF, GRID_CODES, WEEKDAY_INITIALS, weekdayOf, type GridCell, type GridCode, type GridData } from "@/lib/attendance-grid";
import { formatDateFr } from "@/lib/dates";
import type { TFunction } from "@/lib/i18n/config";
import { ATTENDANCE_STATUS_LABELS, POSITION_LABELS, WEEKDAY_LABELS, type AttendanceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Libellé d'un statut du Pointage (statut inconnu : affiché tel quel). */
const statusLabel = (t: TFunction, s: string) => (s in ATTENDANCE_STATUS_LABELS ? t(ATTENDANCE_STATUS_LABELS[s as AttendanceStatus]) : s);

function Cell({ cell, date, today, t }: { cell: GridCell | undefined; date: string; today: string; t: TFunction }) {
  const base = "h-7 min-w-8 border-e border-b p-0 text-center text-[11px] font-semibold leading-7";
  if (!cell || !cell.statuses.length) {
    const pending = date <= today;
    return <td className={cn(base, pending ? "bg-muted/40 text-muted-foreground/60" : "")} title={pending ? t("Aucun pointage enregistré") : undefined}>{pending ? "·" : ""}</td>;
  }
  if (cell.conflict || cell.unknown) {
    return (
      <td className={cn(base, "bg-white text-red-700 ring-2 ring-inset ring-red-500 dark:bg-red-950/40")} title={`${cell.conflict ? t("Statuts différents le même jour : à vérifier") : t("Statut sans code dans la grille")} — ${cell.statuses.map((s) => statusLabel(t, s)).join(" / ")}`}>
        {cell.conflict ? "!" : "?"}
      </td>
    );
  }
  const def = CODE_DEF[cell.code!];
  return (
    <td className={base} style={{ backgroundColor: def.bg, color: def.fg }} title={`${t(def.label)}${cell.double ? ` — ${t("{count} services", { count: cell.statuses.length })}` : ""}`}>
      {def.code}
      {cell.double && <sup className="ms-px text-[8px]">×{cell.statuses.length}</sup>}
    </td>
  );
}

/** Grille mensuelle : colonnes employé figées, une colonne par date, totaux par employé et par date. */
export function GridTable({ grid, t, today, locale }: { grid: GridData; t: TFunction; today: string; locale: string }) {
  const codes: GridCode[] = GRID_CODES.filter((c) => !c.extra || grid.extraCodes.includes(c.code)).map((c) => c.code);
  const longDate = new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : locale, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const stickyHead = "sticky top-0 z-20 bg-muted";
  const col = {
    nb: "sticky start-0 z-10 w-10 min-w-10",
    nom: "sticky start-10 z-10 w-32 min-w-32",
    prenom: "md:sticky md:start-42 z-10 w-28 min-w-28",
    fonction: "md:sticky md:start-70 z-10 w-28 min-w-28 border-e-2",
  };
  return (
    <div className="max-h-[75vh] overflow-auto rounded-xl border bg-card">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            {(["NB", "Nom", "Prénom", "Fonction"] as const).map((h, i) => (
              <th key={h} rowSpan={2} className={cn(stickyHead, "border-e border-b px-2 text-start font-semibold", [col.nb, col.nom, col.prenom, col.fonction][i], "z-30")}>
                {t(h === "NB" ? "Nombre" : h)}
              </th>
            ))}
            {grid.dates.map((d) => {
              const holiday = grid.holidays[d];
              return (
                <th key={d} className={cn(stickyHead, "h-[1.375rem] border-e border-b px-0.5 pt-1 text-center text-[10px] font-semibold", holiday && "bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200", d === today && "bg-primary text-primary-foreground")} title={`${longDate.format(new Date(`${d}T00:00:00Z`))}${holiday ? ` — ${holiday}` : ""}`}>
                  {d.slice(8, 10)}/{d.slice(5, 7)}
                </th>
              );
            })}
            {codes.map((c) => (
              <th key={c} rowSpan={2} className={cn(stickyHead, "border-e border-b px-1 text-center text-[10px] font-bold")} title={t(CODE_DEF[c].label)}>
                <span className="inline-block min-w-8 rounded px-1 py-0.5" style={{ backgroundColor: CODE_DEF[c].bg, color: CODE_DEF[c].fg }}>
                  {c}
                </span>
              </th>
            ))}
          </tr>
          <tr>
            {grid.dates.map((d) => (
              <th key={d} className={cn("sticky top-[1.375rem] z-20 border-e border-b bg-muted px-0.5 pb-1 text-center text-[10px] font-medium text-muted-foreground", grid.holidays[d] && "bg-purple-100 dark:bg-purple-950", d === today && "bg-primary text-primary-foreground")} title={t(WEEKDAY_LABELS[weekdayOf(d)])}>
                {WEEKDAY_INITIALS[weekdayOf(d)]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.length === 0 && (
            <tr>
              <td colSpan={4 + grid.dates.length + codes.length} className="p-6 text-center text-muted-foreground">
                {t("Aucun employé pour cette période et ces filtres.")}
              </td>
            </tr>
          )}
          {grid.rows.map((r) => (
            <tr key={r.id} className="hover:[&>td]:brightness-95">
              <td className={cn(col.nb, "border-e border-b bg-card px-2 text-center tabular-nums")} title={`${t("Matricule")} ${r.matricule}`}>
                {r.order_number}
              </td>
              <td className={cn(col.nom, "truncate border-e border-b bg-card px-2 font-medium")}>{r.last_name}</td>
              <td className={cn(col.prenom, "truncate border-e border-b bg-card px-2")}>{r.first_name}</td>
              <td className={cn(col.fonction, "truncate border-b bg-card px-2 text-muted-foreground")}>{r.job_title || t(POSITION_LABELS[r.position] ?? r.position)}</td>
              {grid.dates.map((d) => (
                <Cell key={d} cell={r.cells[d]} date={d} today={today} t={t} />
              ))}
              {codes.map((c) => (
                <td key={c} className="border-e border-b bg-muted/30 px-1 text-center font-semibold tabular-nums">
                  {r.totals[c] || ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {grid.rows.length > 0 && (
          <tfoot>
            {codes.map((c, i) => (
              <tr key={c} className={i === 0 ? "[&>td]:border-t-2" : ""}>
                <td colSpan={4} className="sticky start-0 z-10 border-e-2 border-b bg-muted px-2 font-semibold">
                  <span className="me-1 inline-block w-9 rounded px-1 text-center text-[10px] font-bold" style={{ backgroundColor: CODE_DEF[c].bg, color: CODE_DEF[c].fg }}>
                    {c}
                  </span>
                  {t("Total {code}", { code: c })} — {t(CODE_DEF[c].label)}
                </td>
                {grid.dates.map((d) => (
                  <td key={d} className="border-e border-b bg-muted/40 text-center text-[11px] tabular-nums" title={`${formatDateFr(d)} — ${t(CODE_DEF[c].label)}`}>
                    {grid.dayTotals[d]?.[c] || ""}
                  </td>
                ))}
                {codes.map((c2) => (
                  <td key={c2} className="border-e border-b bg-muted px-1 text-center font-bold tabular-nums">
                    {c2 === c ? grid.totals[c] : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Légende des codes et couleurs. */
export function GridLegend({ t, extraCodes }: { t: TFunction; extraCodes: GridCode[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
      {GRID_CODES.filter((c) => !c.extra || extraCodes.includes(c.code)).map((c) => (
        <span key={c.code} className="inline-flex items-center gap-1.5">
          <span className="inline-block min-w-9 rounded px-1.5 py-0.5 text-center text-[11px] font-bold" style={{ backgroundColor: c.bg, color: c.fg }}>
            {c.code}
          </span>
          {t(c.label)}
          {c.extra && <span className="text-amber-700 dark:text-amber-400">({t("hors liste")})</span>}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block min-w-9 rounded border bg-muted/40 px-1.5 py-0.5 text-center text-muted-foreground">·</span>
        {t("Non pointé")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block min-w-9 rounded px-1.5 py-0.5 text-center font-bold text-red-700 ring-2 ring-inset ring-red-500">!</span>
        {t("À vérifier")}
      </span>
    </div>
  );
}
