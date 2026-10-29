import Link from "next/link";
import { PdfExportButton } from "@/components/pdf-export-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { expectedEnd, fmtHours } from "@/lib/overtime";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getAttendanceHistory } from "@/lib/data/attendance";
import { getEmployees, employeeName } from "@/lib/data/employees";
import { formatDateFr, formatDateTimeFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS, POSITION_LABELS, TEAM_LABELS, type AttendanceStatus, type Position, type TeamType, ALL_POSITIONS } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const generateMetadata = pageTitle("Recherche détaillée du pointage");

type SP = { from?: string; to?: string; employee?: string; team?: string; position?: string; status?: string };

export default async function HistoriqueLignesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [, t] = await Promise.all([requireModule("pointage"), getT()]);
  const sp = await searchParams;
  const [rows, employees] = await Promise.all([getAttendanceHistory(sp), getEmployees()]);

  return (
    <div>
      <ModuleHeader title={t("Recherche détaillée du pointage")} subtitle={t("{count} ligne(s)", { count: rows.length })} backHref="/pointage/historique">
        <PdfExportButton kind="pointage-historique" params={Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>} label="Exporter l'historique en PDF" />
        <ExcelExportButton kind="pointage-historique" params={Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>} />
      </ModuleHeader>
      <p className="mb-3 text-xs text-muted-foreground">{t("Recherche ligne par ligne (employé, poste, statut). Cliquez sur une date pour ouvrir la feuille de présence de ce jour et la modifier.")}</p>

      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={sp.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={sp.to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="employee">{t("Employé")}</Label>
          <NativeSelect id="employee" name="employee" defaultValue={sp.employee ?? ""}>
            <option value="">{t("Tous")}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {employeeName(e)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="team">{t("Équipe")}</Label>
          <NativeSelect id="team" name="team" defaultValue={sp.team ?? ""}>
            <option value="">{t("Toutes")}</option>
            <option value="collecte">{t("Collecte")}</option>
            <option value="nettoiement">{t("Nettoiement")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="position">{t("Poste")}</Label>
          <NativeSelect id="position" name="position" defaultValue={sp.position ?? ""}>
            <option value="">{t("Tous")}</option>
            {ALL_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {t(POSITION_LABELS[p])}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">{t("Statut")}</Label>
          <NativeSelect id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">{t("Tous")}</option>
            {ATTENDANCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(ATTENDANCE_STATUS_LABELS[s])}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-6">
          <Button type="submit">
            <Search /> {t("Filtrer")}
          </Button>
          <LinkButton href="/pointage/historique/lignes" variant="outline">
            {t("Réinitialiser")}
          </LinkButton>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Date d'activité")}</TableHead>
              <TableHead>{t("Équipe")}</TableHead>
              <TableHead>{t("NB")}</TableHead>
              <TableHead>{t("Nom")}</TableHead>
              <TableHead>{t("Poste")}</TableHead>
              <TableHead>{t("Statut")}</TableHead>
              <TableHead>{t("Entrée")}</TableHead>
              <TableHead>{t("Fin prévue")}</TableHead>
              <TableHead>{t("Sortie")}</TableHead>
              <TableHead title={t("Total = automatiques + manuelles")}>{t("HS (auto + manuel)")}</TableHead>
              <TableHead>{t("Observation")}</TableHead>
              <TableHead>{t("Dernière saisie")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  {t("Aucun pointage trouvé.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/pointage/${r.team_type}?date=${r.activity_date}`} className="font-medium hover:underline">
                    {formatDateFr(r.activity_date)}
                  </Link>
                </TableCell>
                <TableCell>{t(TEAM_LABELS[r.team_type as TeamType])}</TableCell>
                <TableCell>{r.order_number}</TableCell>
                <TableCell>
                  {r.name}
                  {r.shift > 1 && (
                    <Badge variant="outline" className="ms-1">
                      {t("service {n}", { n: r.shift })}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{t(POSITION_LABELS[r.position as Position])}</TableCell>
                <TableCell>
                  {t(ATTENDANCE_STATUS_LABELS[r.status as AttendanceStatus])}
                  {r.sick_departure && <span className="block text-xs text-rose-700 dark:text-rose-400">{t("départ anticipé : heures en HS manuelles")}</span>}
                </TableCell>
                <TableCell>{r.time_in?.slice(0, 5) ?? ""}</TableCell>
                <TableCell className="text-muted-foreground">{(() => {
                  const x = r.time_in && ["present", "repos_travaille"].includes(r.status) ? expectedEnd(r.time_in) : null;
                  return x ? `${x.time}${x.nextDay ? " +1" : ""}` : "";
                })()}</TableCell>
                <TableCell>{r.time_out?.slice(0, 5) ?? ""}</TableCell>
                <TableCell className="whitespace-nowrap">{(() => {
                  const auto = Number(r.overtime_auto) || 0;
                  const manual = Number(r.overtime_manual) || 0;
                  if (!auto && !manual) return "";
                  return auto && manual ? `${fmtHours(auto + manual)} (${fmtHours(auto)} + ${fmtHours(manual)})` : fmtHours(auto + manual);
                })()}</TableCell>
                <TableCell className="max-w-48 truncate">{r.observation}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTimeFr(r.updated_at)}
                  {r.updated_by_email && <div dir="ltr">{r.updated_by_email}</div>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ModuleButtons monthlyHref="/pointage/mensuel" />
    </div>
  );
}
