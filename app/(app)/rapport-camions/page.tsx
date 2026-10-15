import Link from "next/link";
import { Pencil, Plus, Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getTrucks } from "@/lib/data/employees";
import { getTruckReports } from "@/lib/data/reports";
import { formatDateFr, isISODate } from "@/lib/dates";
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

export const metadata = { title: "Rapport camions" };

type SP = { date?: string; from?: string; to?: string; truck?: string; ok?: string };

export default async function RapportCamionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireModule("rapport_camions");
  const sp = await searchParams;
  const filters = { date: isISODate(sp.date) ? sp.date : undefined, from: sp.from, to: sp.to, truck: sp.truck };
  const [rows, trucks] = await Promise.all([getTruckReports(filters), getTrucks()]);
  const canEdit = user.permissions.rapport_camions.can_edit;
  const pdfParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) if (v) pdfParams[k] = v;

  return (
    <div>
      <ModuleHeader title="Rapport camions" subtitle={`${rows.length} ligne(s)`}>
        {canEdit && (
          <LinkButton href="/rapport-camions/nouveau" size="sm">
            <Plus /> Nouvelle ligne
          </LinkButton>
        )}
      </ModuleHeader>

      {sp.ok && (
        <Alert className="mb-4">
          <AlertDescription>Rapport camion enregistré.</AlertDescription>
        </Alert>
      )}

      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="date">Date exacte</Label>
          <Input id="date" name="date" type="date" defaultValue={sp.date} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">Du</Label>
          <Input id="from" name="from" type="date" defaultValue={sp.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Au</Label>
          <Input id="to" name="to" type="date" defaultValue={sp.to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="truck">Matricule</Label>
          <NativeSelect id="truck" name="truck" defaultValue={sp.truck ?? ""}>
            <option value="">Tous</option>
            {trucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.matricule}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">
            <Search /> Filtrer
          </Button>
          <LinkButton href="/rapport-camions" variant="outline">
            Tout
          </LinkButton>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Marque</TableHead>
              <TableHead>Matricule</TableHead>
              <TableHead>Chauffeur</TableHead>
              <TableHead>Ticket</TableHead>
              <TableHead className="text-right">Tonnage</TableHead>
              <TableHead>2e ticket</TableHead>
              <TableHead className="text-right">2e tonnage</TableHead>
              <TableHead className="text-right">Vidages</TableHead>
              <TableHead className="text-right">Rippeurs</TableHead>
              <TableHead className="text-right">Km</TableHead>
              <TableHead className="text-right">Carburant</TableHead>
              <TableHead>Observations</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={14} className="text-center text-muted-foreground">
                  Aucune ligne.
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
                <TableCell className="text-right">{r.tonnage1 ?? ""}</TableCell>
                <TableCell>{r.ticket2}</TableCell>
                <TableCell className="text-right">{r.tonnage2 ?? ""}</TableCell>
                <TableCell className="text-right">{r.dumps_count}</TableCell>
                <TableCell className="text-right">{r.rippers_count}</TableCell>
                <TableCell className="text-right">{r.km ?? ""}</TableCell>
                <TableCell className="text-right">{r.fuel ?? ""}</TableCell>
                <TableCell className="max-w-48 truncate">{r.observations}</TableCell>
                {canEdit && (
                  <TableCell>
                    <Link href={`/rapport-camions/${r.id}`} aria-label="Modifier">
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
