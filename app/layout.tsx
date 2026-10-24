import type { Metadata, Viewport } from "next";
import { Cairo, Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n/client";
import { LOCALE_DIR } from "@/lib/i18n/config";
import { getLocale, getMessages, getT } from "@/lib/i18n/server";
import { getBranding } from "@/lib/data/settings";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
// Police arabe (Geist ne contient pas de glyphes arabes)
const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-arabic" });

export async function generateMetadata(): Promise<Metadata> {
  const [t, branding] = await Promise.all([getT(), getBranding().catch(() => ({ companyName: "" }))]);
  const name = branding.companyName || t("Gestion Collecte & Nettoiement");
  return {
    title: { default: branding.companyName ? t("{name} — Gestion", { name }) : name, template: `%s · ${name}` },
    description: t("Système de gestion Collecte & Nettoiement"),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dir = LOCALE_DIR[locale];
  return (
    <html lang={locale} dir={dir} className={`h-full antialiased font-sans ${geist.variable} ${cairo.variable}`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <I18nProvider locale={locale} messages={getMessages(locale)}>
          {children}
          <Toaster position="top-center" richColors dir={dir} />
        </I18nProvider>
      </body>
    </html>
  );
}
