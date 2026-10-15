import Link from "next/link";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getGreenWasteEntries } from "@/lib/data/green-waste";
import { formatDateFr, formatMonthFr, isMonth, monthRange } from "@/lib/dates";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Historique — Déchet vert" };

export default async function DechetVertHistoriquePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; mois?: string }> }) {
  await requireModule("dechet_vert");
  const sp = await searchParams;
  const range = isMonth(sp.mois) ? monthRange(sp.mois) : { from: sp.from, to: sp.to };
  const entries = await getGreenWasteEntries(range);
  const pdfParams: Record<string, string> = {};
  if (range.from) pdfParams.from = range.from;
  if (range.to) pdfParams.to = range.to;

  return (
    <div>
      <ModuleHeader title="Historique — Déchet vert" subtitle={isMonth(sp.mois) ? formatMonthFr(sp.mois) : `${entries.length} intervention(s)`} backHref="/dechet-vert" />
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="from">Du</Label>
          <Input id="from" name="from" type="date" defaultValue={range.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Au</Label>
          <Input id="to" name="to" type="date" defaultValue={range.to} />
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> Filtrer
          </Button>
        </div>
      </form>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Lieu</TableHead>
              <TableHead>Commentaire</TableHead>
              <TableHead className="text-right">Photos avant / après</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Aucune intervention.
                </TableCell>
              </TableRow>
            )}
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <Link href={`/dechet-vert/${e.id}`} className="font-medium hover:underline">
                    {formatDateFr(e.activity_date)}
                  </Link>
                </TableCell>
                <TableCell>{e.location || "—"}</TableCell>
                <TableCell className="max-w-72 truncate">{e.comment}</TableCell>
                <TableCell className="text-right">
                  {e.photosAvant.length} / {e.photosApres.length}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ModuleButtons pdfSlot={entries.length ? <PdfExportButton kind="dechet-vert" params={pdfParams} /> : undefined} />
    </div>
  );
}
