"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addDaysISO } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

/** Jour précédent / suivant (?date=…), avec confirmation si la feuille a des modifications non enregistrées. */
export function DayNav({ value, param = "date" }: { value: string; param?: string }) {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const go = (n: number) => {
    if ((window as unknown as { __pointageDirty?: boolean }).__pointageDirty && !window.confirm(t("Des modifications ne sont pas enregistrées. Changer de date quand même ?"))) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(param, addDaysISO(value, n));
    router.replace(`${pathname}?${params.toString()}`);
  };
  return (
    <div className="flex gap-1">
      <Button type="button" variant="outline" size="sm" onClick={() => go(-1)} title={t("Jour précédent")}>
        <ChevronLeft className="rtl:rotate-180" /> <span className="max-sm:sr-only">{t("Jour précédent")}</span>
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => go(1)} title={t("Jour suivant")}>
        <span className="max-sm:sr-only">{t("Jour suivant")}</span> <ChevronRight className="rtl:rotate-180" />
      </Button>
    </div>
  );
}
