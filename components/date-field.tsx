"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Sélecteur de date (ou de mois) synchronisé avec l'URL (?date=… / ?mois=…).
 * Permet de consulter et saisir des journées précédentes.
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={`date-${param}`} className="whitespace-nowrap text-sm">
        {label}
      </Label>
      <Input
        id={`date-${param}`}
        type={type}
        value={value}
        max={max}
        className="w-auto"
        onChange={(e) => {
          if (!e.target.value) return;
          const params = new URLSearchParams(searchParams.toString());
          params.set(param, e.target.value);
          router.replace(`${pathname}?${params.toString()}`);
        }}
      />
    </div>
  );
}
