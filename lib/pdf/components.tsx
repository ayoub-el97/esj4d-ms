import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

export const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  logo: { width: 40, height: 40, backgroundColor: "#4f46e5", color: "#fff", fontSize: 18, textAlign: "center", paddingTop: 11, borderRadius: 6 },
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

export type Column = { key: string; label: string; width: number; align?: "left" | "center" | "right" };

export function PdfTable({ columns, rows }: { columns: Column[]; rows: (Record<string, ReactNode> & { _group?: string })[] }) {
  return (
    <View style={styles.table}>
      <View style={[styles.tr, styles.th]} fixed>
        {columns.map((c, i) => (
          <View key={c.key} style={[styles.td, { width: `${c.width}%` }, i === columns.length - 1 ? styles.tdLast : {}]}>
            <Text style={{ textAlign: c.align ?? "left" }}>{c.label}</Text>
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

export function PdfHeader({ company, title, subtitle }: { company: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.header} fixed>
      <Text style={styles.logo}>{company.slice(0, 1).toUpperCase()}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <Text style={[styles.logo, { backgroundColor: "#64748b" }]}>{company.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function PdfFooter({ company, generatedBy }: { company: string; generatedBy: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        {company} — généré le {new Date().toLocaleString("fr-FR")} par {generatedBy}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
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
  return (
    <Document title={title} author={company} language="fr">
      <Page size="A4" orientation={orientation} style={styles.page}>
        {children}
        <PdfFooter company={company} generatedBy={generatedBy} />
      </Page>
    </Document>
  );
}
