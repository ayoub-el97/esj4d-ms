import Link from "next/link";
import { Camera, Eye, Moon, Pencil, Plus, Sun } from "lucide-react";
import { ModifiedBadge } from "@/components/last-change";
import type { TruckReportRow } from "@/lib/data/reports";
import { formatDateFr } from "@/lib/dates";
import type { TFunction } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Sum = { tonnage: number; dumps: number; km: number; lines: number };
const sumOf = (rows: TruckReportRow[]): Sum =>
  rows.reduce((a, r) => ({ tonnage: a.tonnage + r.tonnage_total, dumps: a.dumps + r.dumps_count, km: a.km + Number(r.km ?? 0), lines: a.lines + 1 }), { tonnage: 0, dumps: 0, km: 0, lines: 0 });

export function ShiftBadge({ shift, t }: { shift: "matin" | "soir"; t: TFunction }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        shift === "matin" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
      )}
    >
      {shift === "matin" ? <Sun className="size-3" /> : <Moon className="size-3" />}
      {shift === "matin" ? t("Matin") : t("Soir")}
    </span>
  );
}

/**
 * Rapport camions du jour : lignes regroupées par date et par camion, Matin puis Soir,
 * avec sous-totaux par poste et total de la journée du camion. Chaque ligne n'est comptée qu'une fois.
 */
export function TruckDayTable({ rows, canEdit, t, modified }: { rows: TruckReportRow[]; canEdit: boolean; t: TFunction; /** Lignes corrigées après la première saisie */ modified?: Set<string> }) {
  // Groupes (date, camion) dans l'ordre des lignes (déjà triées)
  const groups: { key: string; date: string; rows: TruckReportRow[] }[] = [];
  for (const r of rows) {
    const key = `${r.activity_date}:${r.truck_id}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, date: r.activity_date, rows: [r] });
  }
  const total = sumOf(rows);
  const cols = 13;

  const subtotal = (label: string, s: Sum, strong = false) => (
    <TableRow className={cn(strong ? "bg-muted/70 font-semibold" : "bg-muted/30 text-muted-foreground")}>
      <TableCell colSpan={5} className="text-end text-xs">
        {label}
      </TableCell>
      <TableCell className="text-end tabular-nums">{s.tonnage.toFixed(2)}</TableCell>
      <TableCell className="text-end tabular-nums">{s.dumps}</TableCell>
      <TableCell colSpan={3} />
      <TableCell className="text-end tabular-nums">{s.km ? s.km.toFixed(1) : ""}</TableCell>
      <TableCell colSpan={cols - 11} />
    </TableRow>
  );

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Date")}</TableHead>
            <TableHead>{t("Matricule")}</TableHead>
            <TableHead>{t("Poste")}</TableHead>
            <TableHead>{t("Chauffeur")}</TableHead>
            <TableHead>{t("Vidages (ticket — tonnage)")}</TableHead>
            <TableHead className="text-end">{t("Tonnage total")}</TableHead>
            <TableHead className="text-end">{t("Vidages")}</TableHead>
            <TableHead>{t("Équipe (rippeurs)")}</TableHead>
            <TableHead className="text-end">{t("Km départ")}</TableHead>
            <TableHead className="text-end">{t("Km fin")}</TableHead>
            <TableHead className="text-end">{t("Km parcourus")}</TableHead>
            <TableHead>{t("Observations")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={cols} className="text-center text-muted-foreground">
                {t("Aucune ligne.")}
              </TableCell>
            </TableRow>
          )}
          {groups.map((g) => {
            const matin = g.rows.filter((r) => r.shift === "matin");
            const soir = g.rows.filter((r) => r.shift === "soir");
            const first = g.rows[0];
            return [
              ...g.rows.map((r, i) => (
                <TableRow key={r.id} className={cn(i === 0 && "border-t-2")}>
                  <TableCell className="font-medium whitespace-nowrap">{i === 0 ? formatDateFr(r.activity_date) : ""}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {i === 0 && (
                      <>
                        <span className="font-mono font-semibold">{r.truck?.matricule}</span>
                        {r.truck?.brand && <span className="block text-xs text-muted-foreground">{r.truck.brand}</span>}
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <ShiftBadge shift={r.shift} t={t} />
                  </TableCell>
                  <TableCell>{r.chauffeur_name || "—"}</TableCell>
                  <TableCell className="min-w-44 text-xs">
                    {r.loads.length === 0
                      ? "—"
                      : r.loads.map((l, k) => (
                          <div key={k} className="tabular-nums">
                            {k + 1}. {l.ticket || "—"} — {l.tonnage != null ? `${l.tonnage} t` : "—"}
                          </div>
                        ))}
                  </TableCell>
                  <TableCell className="text-end font-semibold tabular-nums">{r.tonnage_total.toFixed(2)}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {r.dumps_count}
                    {r.dumps_override && <span className="block text-[10px] font-medium text-orange-700">{t("manuel")}</span>}
                  </TableCell>
                  <TableCell className="min-w-36 text-xs">{r.crew.length ? r.crew.join(", ") : r.rippers_count ? t("{count} rippeur(s)", { count: r.rippers_count }) : "—"}</TableCell>
                  <TableCell className="text-end">{r.km_start ?? ""}</TableCell>
                  <TableCell className="text-end">{r.km_end ?? ""}</TableCell>
                  <TableCell className="text-end">{r.km ?? ""}</TableCell>
                  <TableCell className="max-w-48 text-xs">
                    <span className="line-clamp-2">{r.observations}</span>
                    {r.photos.length > 0 && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-muted-foreground">
                        <Camera className="size-3" /> {r.photos.length}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/rapport-camions/${r.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      {canEdit ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />} {canEdit ? t("Modifier") : t("Voir")}
                    </Link>
                    {modified?.has(r.id) && <ModifiedBadge t={t} className="mt-1 flex w-fit" />}
                  </TableCell>
                </TableRow>
              )),
              // Sous-totaux : par poste s'il y a plusieurs lignes, puis total de la journée du camion
              matin.length > 0 && (matin.length > 1 || soir.length > 0) ? <TableRowFragment key={`${g.key}-m`}>{subtotal(t("Total Matin"), sumOf(matin))}</TableRowFragment> : null,
              soir.length > 0 && (soir.length > 1 || matin.length > 0) ? <TableRowFragment key={`${g.key}-s`}>{subtotal(t("Total Soir"), sumOf(soir))}</TableRowFragment> : null,
              g.rows.length > 1 ? <TableRowFragment key={`${g.key}-j`}>{subtotal(t("Total journée — {matricule}", { matricule: first.truck?.matricule ?? "" }), sumOf(g.rows), true)}</TableRowFragment> : null,
              canEdit ? (
                <TableRow key={`${g.key}-add`}>
                  <TableCell colSpan={cols} className="py-1 text-xs">
                    <a href={`/api/pdf/camions?date=${g.date}&truck=${first.truck_id}`} target="_blank" rel="noopener" className="me-3 inline-flex items-center gap-1 text-primary hover:underline">
                      {t("PDF de ce rapport")}
                    </a>
                    <Link href={`/rapport-camions/nouveau?date=${g.date}&camion=${first.truck_id}&poste=${soir.length ? "matin" : "soir"}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <Plus className="size-3" /> {soir.length ? t("Ajouter une ligne pour ce camion") : t("Ajouter le travail du soir pour ce camion")}
                    </Link>
                  </TableCell>
                </TableRow>
              ) : null,
            ];
          })}
        </TableBody>
        {rows.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5}>{t("Total ({count} ligne(s))", { count: rows.length })}</TableCell>
              <TableCell className="text-end tabular-nums">{total.tonnage.toFixed(2)}</TableCell>
              <TableCell className="text-end tabular-nums">{total.dumps}</TableCell>
              <TableCell colSpan={3} />
              <TableCell className="text-end tabular-nums">{total.km.toFixed(1)}</TableCell>
              <TableCell colSpan={cols - 11} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

function TableRowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
