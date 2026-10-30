"use client";

import { Printer } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  const { t } = useT();
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <Printer /> {t("Imprimer")}
    </Button>
  );
}
