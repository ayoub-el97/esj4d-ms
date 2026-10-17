import Link from "next/link";
import { Pencil, Plus, Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getTrucks } from "@/lib/data/employees";
import { getTruckReports } from "@/lib/data/reports";
import { formatDateFr, isISODate } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TruckTabs } from "./truck-tabs";

export const generateMetadata = pageTitle("Rapport camions");

type SP = { date?: string; from?: string; to?: string; truck?: string; ok?: string };

export default async function RapportCamionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [user, t] = await Promise.all([requireModule("rapport_camions"), getT()]);
  const sp = await searchParams;
  const filters = { date: isISODate(sp.date) ? sp.date : undefined, from: sp.from, to: sp.to, truck: sp.truck };
  const [rows, trucks] = await Promise.all([getTruckReports(filters), getTrucks()]);
  const canEdit = user.permissions.rapport_camions.can_edit;
  const pdfParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) if (v) pdfParams[k] = v;

  return (
    <div>
      <ModuleHeader title={t("Rapport camions")} subtitle={t("{count} ligne(s)", { count: rows.length })}>
        {canEdit && (
          <LinkButton href="/rapport-camions/nouveau" size="sm">
            <Plus /> {t("Nouvelle ligne")}
          </LinkButton>
        )}
      </ModuleHeader>
      <TruckTabs active="general" />

      {sp.ok && (
        <Alert className="mb-4">
          <AlertDescription>{t("Rapport camion enregistré.")}</AlertDescription>
        </Alert>
      )}

      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="date">{t("Date exacte")}</Label>
          <Input id="date" name="date" type="date" defaultValue={sp.date} />
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
          <Label htmlFor="truck">{t("Matricule")}</Label>
          <NativeSelect id="truck" name="truck" defaultValue={sp.truck ?? ""}>
            <option value="">{t("Tous")}</option>
            {trucks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.matricule}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">
            <Search /> {t("Filtrer")}
          </Button>
          <LinkButton href="/rapport-camions" variant="outline">
            {t("Tout")}
          </LinkButton>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Date")}</TableHead>
              <TableHead>{t("Marque")}</TableHead>
              <TableHead>{t("Matricule")}</TableHead>
              <TableHead>{t("Chauffeur")}</TableHead>
              <TableHead>{t("Ticket")}</TableHead>
              <TableHead className="text-end">{t("Tonnage")}</TableHead>
              <TableHead>{t("2e ticket")}</TableHead>
              <TableHead className="text-end">{t("2e tonnage")}</TableHead>
              <TableHead className="text-end">{t("Vidages")}</TableHead>
              <TableHead>{t("Équipe (rippeurs)")}</TableHead>
              <TableHead className="text-end">{t("Km")}</TableHead>
              <TableHead>{t("Observations")}</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={13} className="text-center text-muted-foreground">
                  {t("Aucune ligne.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{formatDateFr(r.activity_date)}</TableCell>
                <TableCell>{r.truck?.brand}</TableCell>
                <TableCell className="font-mono">{r.truck?.matricule}</TableCell>
                <TableCell>{r.chauffeur_name || "—"}</TableCell>
                <TableCell>{r.ticket1}</TableCell>
                <TableCell className="text-end">{r.tonnage1 ?? ""}</TableCell>
                <TableCell>{r.ticket2}</TableCell>
                <TableCell className="text-end">{r.tonnage2 ?? ""}</TableCell>
                <TableCell className="text-end">{r.dumps_count}</TableCell>
                <TableCell className="min-w-40 text-xs">{r.crew.length ? r.crew.join(", ") : r.rippers_count ? t("{count} rippeur(s)", { count: r.rippers_count }) : "—"}</TableCell>
                <TableCell className="text-end">{r.km ?? ""}</TableCell>
                <TableCell className="max-w-48 truncate">{r.observations}</TableCell>
                {canEdit && (
                  <TableCell>
                    <Link href={`/rapport-camions/${r.id}`} aria-label={t("Modifier")}>
                      <Pencil className="size-4 text-muted-foreground" />
                    </Link>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ModuleButtons pdfSlot={<PdfExportButton kind="camions" params={pdfParams} />} historyHref="/rapport-camions?from=" monthlyHref="/rapport-camions/mensuel" />
    </div>
  );
}
