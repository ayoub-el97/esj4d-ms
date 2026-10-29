"use client";

import { FileSpreadsheet } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Téléchargement Excel (.xlsx) généré côté serveur avec les données enregistrées (droits du module). */
export function ExcelExportButton({ kind, params, label = "Exporter Excel", className }: { kind: string; params: Record<string, string>; label?: string; className?: string }) {
  const { t } = useT();
  const qs = new URLSearchParams(params).toString();
  return (
    <a href={`/api/excel/${kind}?${qs}`} download className={cn(buttonVariants({ variant: "outline" }), className)}>
      <FileSpreadsheet /> {t(label)}
    </a>
  );
}
