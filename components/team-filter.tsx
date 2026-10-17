"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/native-select";
import { useT } from "@/lib/i18n/client";

/** Filtre d'équipe synchronisé avec l'URL (?equipe=…). */
export function TeamFilter({ value, param = "equipe" }: { value: string; param?: string }) {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <NativeSelect
      className="w-auto"
      value={value}
      aria-label={t("Équipe")}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) params.set(param, e.target.value);
        else params.delete(param);
        router.replace(`${pathname}?${params.toString()}`);
      }}
    >
      <option value="">{t("Toutes les équipes")}</option>
      <option value="collecte">{t("Collecte")}</option>
      <option value="nettoiement">{t("Nettoiement")}</option>
    </NativeSelect>
  );
}
