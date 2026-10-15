"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/native-select";

/** Filtre d'équipe synchronisé avec l'URL (?equipe=…). */
export function TeamFilter({ value, param = "equipe" }: { value: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <NativeSelect
      className="w-auto"
      value={value}
      aria-label="Équipe"
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) params.set(param, e.target.value);
        else params.delete(param);
        router.replace(`${pathname}?${params.toString()}`);
      }}
    >
      <option value="">Toutes les équipes</option>
      <option value="collecte">Collecte</option>
      <option value="nettoiement">Nettoiement</option>
    </NativeSelect>
  );
}
