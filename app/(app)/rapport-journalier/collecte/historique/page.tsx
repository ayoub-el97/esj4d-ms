import Link from "next/link";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getTrucks, employeeName } from "@/lib/data/employees";
import { getCollectionReports } from "@/lib/data/reports";
import { formatDateFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const generateMetadata = pageTitle("Historique des rapports de collecte");

export default async function CollecteHistoriquePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; truck?: string }> }) {
  const [, t] = await Promise.all([requireModule("rapport_journalier"), getT()]);
  const sp = await searchParams;
  const [reports, trucks] = await Promise.all([getCollectionReports(sp), getTrucks()]);

  return (
    <div>
      <ModuleHeader title={t("Historique des rapports de collecte")} subtitle={t("{count} rapport(s)", { count: reports.length })} backHref="/rapport-journalier/collecte" />
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={sp.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={sp.to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="truck">{t("Camion")}</Label>
          <NativeSelect id="truck" name="truck" defaultValue={sp.truck ?? ""}>
            <option value="">{t("Tous")}</option>
            {trucks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.matricule}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> {t("Filtrer")}
          </Button>
        </div>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Date")}</TableHead>
              <TableHead>{t("Camion")}</TableHead>
              <TableHead>{t("Chauffeur")}</TableHead>
              <TableHead>{t("Rippeurs")}</TableHead>
              <TableHead>{t("Secteurs")}</TableHead>
              <TableHead className="text-end">{t("Tonnage")}</TableHead>
              <TableHead className="text-end">{t("Photos")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {t("Aucun rapport.")}
                </TableCell>
              </TableRow>
            )}
            {reports.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/rapport-journalier/collecte/${r.id}`} className="font-medium hover:underline">
                    {formatDateFr(r.activity_date)}
                  </Link>
                </TableCell>
                <TableCell className="font-mono">{r.truck?.matricule}</TableCell>
                <TableCell>{r.chauffeur ? employeeName(r.chauffeur) : "—"}</TableCell>
                <TableCell>{r.rippers.length}</TableCell>
                <TableCell className="max-w-56 truncate">{r.sectors}</TableCell>
                <TableCell className="text-end">{r.truckReport ? Number(r.truckReport.tonnage1 ?? 0) + Number(r.truckReport.tonnage2 ?? 0) : ""}</TableCell>
                <TableCell className="text-end">{r.photosAvant.length + r.photosApres.length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ModuleButtons monthlyHref="/rapport-camions/mensuel" />
    </div>
  );
}
