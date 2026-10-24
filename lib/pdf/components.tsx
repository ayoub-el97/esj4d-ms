import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { usePdf } from "./context";
import type { PhotoItem } from "@/lib/photo-types";

export const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  logo: { width: 40, height: 40, backgroundColor: "#4f46e5", color: "#fff", fontSize: 18, textAlign: "center", paddingTop: 11, borderRadius: 6 },
  logoImage: { width: 44, height: 44, objectFit: "contain" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "center" },
  subtitle: { fontSize: 9, color: "#555", textAlign: "center", marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8, fontSize: 9 },
  metaBox: { borderWidth: 1, borderColor: "#999", padding: 4, minWidth: 120 },
  table: { borderWidth: 1, borderColor: "#999", borderBottomWidth: 0 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#999", minHeight: 16 },
  th: { backgroundColor: "#e5e7eb", fontFamily: "Helvetica-Bold" },
  td: { padding: 3, borderRightWidth: 1, borderColor: "#999", justifyContent: "center" },
  tdLast: { borderRightWidth: 0 },
  groupRow: { backgroundColor: "#eef2ff", fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 14, left: 28, right: 28, fontSize: 7, color: "#777", flexDirection: "row", justifyContent: "space-between" },
  section: { marginTop: 10, marginBottom: 4, fontSize: 11, fontFamily: "Helvetica-Bold" },
  small: { fontSize: 8, color: "#555" },
});

/** `label` : clé de traduction (texte français), traduite à l'affichage. */
export type Column = { key: string; label: string; width: number; align?: "left" | "center" | "right" };

export function PdfTable({ columns, rows }: { columns: Column[]; rows: (Record<string, ReactNode> & { _group?: string })[] }) {
  const { t } = usePdf();
  return (
    <View style={styles.table}>
      <View style={[styles.tr, styles.th]} fixed>
        {columns.map((c, i) => (
          <View key={c.key} style={[styles.td, { width: `${c.width}%` }, i === columns.length - 1 ? styles.tdLast : {}]}>
            <Text style={{ textAlign: c.align ?? "left" }}>{t(c.label)}</Text>
          </View>
        ))}
      </View>
      {rows.map((r, idx) =>
        r._group ? (
          <View key={idx} style={[styles.tr, styles.groupRow]} wrap={false}>
            <View style={[styles.td, styles.tdLast, { width: "100%" }]}>
              <Text>{r._group}</Text>
            </View>
          </View>
        ) : (
          <View key={idx} style={styles.tr} wrap={false}>
            {columns.map((c, i) => (
              <View key={c.key} style={[styles.td, { width: `${c.width}%` }, i === columns.length - 1 ? styles.tdLast : {}]}>
                <Text style={{ textAlign: c.align ?? "left" }}>{r[c.key] ?? ""}</Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}

function Logo({ company }: { company: string }) {
  const { logoUrl } = usePdf();
  // eslint-disable-next-line jsx-a11y/alt-text
  if (logoUrl) return <Image src={logoUrl} style={styles.logoImage} />;
  return <Text style={styles.logo}>{company.slice(0, 1).toUpperCase()}</Text>;
}

/** En-tête : logo de la société, titre (déjà traduit) et sous-titre. */
export function PdfHeader({ company, title, subtitle }: { company: string; title: string; subtitle?: string }) {
  const { companyDetails } = usePdf();
  return (
    <View style={styles.header} fixed>
      <Logo company={company} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <View style={{ width: 130, alignItems: "flex-end" }}>
        <Text style={[styles.small, { textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{company}</Text>
        {(companyDetails ?? []).map((l, i) => (
          <Text key={i} style={[styles.small, { textAlign: "right", fontSize: 7 }]}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function PdfFooter({ company, generatedBy }: { company: string; generatedBy: string }) {
  const { t, locale } = usePdf();
  return (
    <View style={styles.footer} fixed>
      <Text>{t("{company} — généré le {date} par {user}", { company, date: new Date().toLocaleString(locale === "en" ? "en-GB" : "fr-FR"), user: generatedBy })}</Text>
      <Text render={({ pageNumber, totalPages }) => t("Page {n} / {total}", { n: pageNumber, total: totalPages ?? pageNumber })} />
    </View>
  );
}

/**
 * Grille de photos (titre = clé de traduction). Images entières (proportions conservées, jamais
 * coupées entre deux pages), deux par ligne ; les photos non chargées sont signalées.
 */
export function PhotoGrid({ title, photos }: { title: string; photos: (PhotoItem & { failed?: boolean })[] }) {
  const { t } = usePdf();
  const ok = photos.filter((p) => p.url && !p.failed);
  const failed = photos.length - ok.length;
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.section} minPresenceAhead={120}>
        {t(title)} ({photos.length})
      </Text>
      {photos.length === 0 ? (
        <Text style={styles.small}>{t("Aucune photo")}</Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {ok.map((p) => (
            <View key={p.id} wrap={false} style={{ width: 252, height: 196, borderWidth: 1, borderColor: "#bbb", padding: 2, alignItems: "center", justifyContent: "center" }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={p.url} style={{ maxWidth: 246, maxHeight: 176, objectFit: "contain" }} />
              <Text style={{ fontSize: 6.5, color: "#555", marginTop: 1 }}>{new Date(p.created_at).toLocaleString("fr-FR", { timeZone: "Africa/Casablanca", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Text>
            </View>
          ))}
        </View>
      )}
      {failed > 0 && <Text style={[styles.small, { color: "#b45309", marginTop: 3 }]}>{t("{count} photo(s) n'ont pas pu être incluses (image indisponible ou format non lisible) ; elles restent consultables dans l'application.", { count: failed })}</Text>}
    </View>
  );
}

export function PdfDocument({
  title,
  company,
  generatedBy,
  orientation = "portrait",
  children,
}: {
  title: string;
  company: string;
  generatedBy: string;
  orientation?: "portrait" | "landscape";
  children: ReactNode;
}) {
  const { locale } = usePdf();
  return (
    <Document title={title} author={company} language={locale}>
      <Page size="A4" orientation={orientation} style={styles.page}>
        {children}
        <PdfFooter company={company} generatedBy={generatedBy} />
      </Page>
    </Document>
  );
}
