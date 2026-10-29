"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/client";

/**
 * Sélecteur de date (ou de mois) synchronisé avec l'URL (?date=… / ?mois=…).
 * Permet de consulter et saisir des journées précédentes.
 * `label` est une clé de traduction (texte français).
 */
export function DateField({
  value,
  param = "date",
  type = "date",
  label = "Date d'activité",
  max,
}: {
  value: string;
  param?: string;
  type?: "date" | "month";
  label?: string;
  max?: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={`date-${param}`} className="whitespace-nowrap text-sm">
        {t(label)}
      </Label>
      <Input
        id={`date-${param}`}
        type={type}
        value={value}
        max={max}
        className="w-auto"
        onChange={(e) => {
          // Feuille de présence modifiée et non enregistrée : confirmation avant de changer de date
          if ((window as unknown as { __pointageDirty?: boolean }).__pointageDirty && !window.confirm(t("Des modifications ne sont pas enregistrées. Changer de date quand même ?"))) return;
          if (!e.target.value) return;
          const params = new URLSearchParams(searchParams.toString());
          params.set(param, e.target.value);
          router.replace(`${pathname}?${params.toString()}`);
        }}
      />
    </div>
  );
}
