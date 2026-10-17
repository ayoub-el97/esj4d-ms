"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLocale } from "@/lib/actions/locale";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";
import { useT } from "@/lib/i18n/client";

/** Sélecteur de langue : Français / English / العربية. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <label className={`inline-flex items-center gap-1 text-sm ${className ?? ""}`}>
      <Languages className="size-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">{t("Langue")}</span>
      <select
        value={locale}
        disabled={pending}
        aria-label={t("Langue")}
        className="h-7 rounded-md border border-input bg-background px-1 text-sm"
        onChange={(e) =>
          start(async () => {
            await setLocale(e.target.value);
            router.refresh();
          })
        }
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
