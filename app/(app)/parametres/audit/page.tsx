import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getT, pageTitle } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeFr } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const generateMetadata = pageTitle("Journal d'audit");

const TABLE_LABELS: Record<string, string> = {
  profiles: "Comptes",
  settings: "Réglages",
  role_permissions: "Permissions",
  trucks: "Camions",
  employees: "Employés",
  team_leads: "Chefs d'équipe",
  work_days: "Journées",
  attendance: "Pointage",
  photos: "Photos",
  cleaning_reports: "Rapport nettoiement",
  cleaning_report_agents: "Agents nettoiement",
  collection_reports: "Rapport collecte",
  truck_daily_reports: "Rapport camions",
  cleaning_daily_summary: "Récap. nettoiement",
  leave_requests: "Congés",
  leave_adjustments: "Ajustements congés",
  warnings: "Avertissements",
  green_waste_entries: "Déchet vert",
  work_tasks: "Programme",
};

const ACTION_LABELS: Record<string, string> = { INSERT: "Création", UPDATE: "Modification", DELETE: "Suppression", CLOSE_DAY: "Clôture", REOPEN_DAY: "Réouverture" };

type AuditRow = { id: number; table_name: string; record_id: string; action: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; user_email: string | null; created_at: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ table?: string; action?: string; from?: string; to?: string; q?: string }> }) {
  const [user, t] = await Promise.all([getCurrentUser(), getT()]);
  if (user.role !== "admin") redirect("/?error=acces_refuse");
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("audit_log").select("id, table_name, record_id, action, old_data, new_data, user_email, created_at").order("created_at", { ascending: false }).limit(300);
  if (sp.table) q = q.eq("table_name", sp.table);
  if (sp.action) q = q.eq("action", sp.action);
  if (sp.from) q = q.gte("created_at", `${sp.from}T00:00:00`);
  if (sp.to) q = q.lte("created_at", `${sp.to}T23:59:59`);
  if (sp.q) q = q.ilike("user_email", `%${sp.q}%`);
  const { data } = await q.returns<AuditRow[]>();
  const rows = data ?? [];

  return (
    <div>
      <ModuleHeader title={t("Journal d'audit")} subtitle={t("Qui a créé, modifié ou supprimé quoi, et quand (300 dernières entrées)")} backHref="/parametres" />
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="table">{t("Donnée")}</Label>
          <NativeSelect id="table" name="table" defaultValue={sp.table ?? ""}>
            <option value="">{t("Toutes")}</option>
            {Object.entries(TABLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {t(v)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="action">{t("Action")}</Label>
          <NativeSelect id="action" name="action" defaultValue={sp.action ?? ""}>
            <option value="">{t("Toutes")}</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {t(v)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={sp.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={sp.to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="q">{t("Utilisateur (e-mail)")}</Label>
          <div className="flex gap-2">
            <Input id="q" name="q" defaultValue={sp.q} dir="ltr" />
            <Button type="submit" size="icon" aria-label={t("Filtrer")}>
              <Search />
            </Button>
          </div>
        </div>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Date / heure")}</TableHead>
              <TableHead>{t("Utilisateur")}</TableHead>
              <TableHead>{t("Action")}</TableHead>
              <TableHead>{t("Donnée")}</TableHead>
              <TableHead>{t("Enregistrement")}</TableHead>
              <TableHead>{t("Détail")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t("Aucune entrée.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{formatDateTimeFr(r.created_at)}</TableCell>
                <TableCell dir="ltr">{r.user_email ?? t("système")}</TableCell>
                <TableCell>
                  <Badge variant={r.action === "DELETE" ? "destructive" : r.action === "INSERT" ? "default" : "secondary"}>{t(ACTION_LABELS[r.action] ?? r.action)}</Badge>
                </TableCell>
                <TableCell>{t(TABLE_LABELS[r.table_name] ?? r.table_name)}</TableCell>
                <TableCell className="font-mono text-xs">{r.record_id.slice(0, 10)}</TableCell>
                <TableCell className="max-w-md truncate text-xs text-muted-foreground" dir="ltr" title={JSON.stringify(r.new_data ?? r.old_data)}>
                  {summarize(r)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ModuleButtons />
    </div>
  );
}

function summarize(r: AuditRow): string {
  const data = r.new_data ?? r.old_data ?? {};
  if (r.action === "UPDATE" && r.old_data && r.new_data) {
    const changes = Object.keys(r.new_data)
      .filter((k) => !["updated_at", "updated_by"].includes(k) && JSON.stringify(r.old_data![k]) !== JSON.stringify(r.new_data![k]))
      .map((k) => `${k}: ${fmt(r.old_data![k])} → ${fmt(r.new_data![k])}`);
    return changes.join(" ; ") || "—";
  }
  return Object.entries(data)
    .filter(([k]) => !["id", "created_at", "created_by", "updated_at", "updated_by"].includes(k))
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${fmt(v)}`)
    .join(" ; ");
}

function fmt(v: unknown): string {
  if (v == null || v === "") return "∅";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).slice(0, 40);
}
