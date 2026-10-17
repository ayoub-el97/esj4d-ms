import Link from "next/link";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getGreenWasteEntries } from "@/lib/data/green-waste";
import { formatDateFr, formatWorkMonth, isMonth, workMonthRange } from "@/lib/dates";
import { getProjectStart } from "@/lib/data/settings";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const generateMetadata = pageTitle("Historique — Déchet vert");

export default async function DechetVertHistoriquePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; mois?: string }> }) {
  const [, { t, locale }] = await Promise.all([requireModule("dechet_vert"), getI18n()]);
  const sp = await searchParams;
  const projectStart = await getProjectStart();
  const range = isMonth(sp.mois) ? workMonthRange(sp.mois, projectStart) : { from: sp.from, to: sp.to };
  const entries = await getGreenWasteEntries(range);
  const pdfParams: Record<string, string> = {};
  if (range.from) pdfParams.from = range.from;
  if (range.to) pdfParams.to = range.to;

  return (
    <div>
      <ModuleHeader title={t("Historique — Déchet vert")} subtitle={isMonth(sp.mois) ? formatWorkMonth(sp.mois, projectStart, locale) : t("{count} intervention(s)", { count: entries.length })} backHref="/dechet-vert" />
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={range.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={range.to} />
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> {t("Filtrer")}
          </Button>
        </div>
      </form>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Date")}</TableHead>
              <TableHead>{t("Lieu")}</TableHead>
              <TableHead>{t("Commentaire")}</TableHead>
              <TableHead className="text-end">{t("Photos avant / après")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {t("Aucune intervention.")}
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
                <TableCell className="text-end">
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
