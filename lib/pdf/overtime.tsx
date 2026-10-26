import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { WEEKDAY_INITIALS, weekdayOf } from "@/lib/attendance-grid";
import type { OvertimeGrid } from "@/lib/data/attendance-grid";
import { formatDateFr } from "@/lib/dates";
import { POSITION_LABELS } from "@/lib/types";
import { usePdf } from "./context";

// A3 paysage, même disposition que la grille mensuelle
const PAGE_W = 1191;
const PAD = 18;
const ID = { nb: 20, nom: 74, prenom: 64, fonction: 62 };
const TOTAL_W = 30;
const B = "#9ca3af";
const s = StyleSheet.create({
  page: { padding: PAD, paddingBottom: 28, fontSize: 7, fontFamily: "Helvetica", color: "#111" },
  row: { flexDirection: "row" },
  cell: { borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: B, justifyContent: "center", height: 12 },
  head: { backgroundColor: "#e5e7eb", fontFamily: "Helvetica-Bold" },
  txt: { fontSize: 6.5, textAlign: "center" },
  left: { fontSize: 6.5, paddingLeft: 2 },
  footer: { position: "absolute", bottom: 10, left: PAD, right: PAD, fontSize: 7, color: "#777", flexDirection: "row", justifyContent: "space-between" },
});
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
const trunc = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

export function OvertimePdf({ grid, company, generatedBy, today, monthName, filtersLabel }: { grid: OvertimeGrid; company: string; generatedBy: string; today: string; monthName: string; filtersLabel: string }) {
  const { t, locale, logoUrl, companyDetails } = usePdf();
  const idW = ID.nb + ID.nom + ID.prenom + ID.fonction;
  const dayW = Math.min(30, (PAGE_W - 2 * PAD - idW - 3 * TOTAL_W - 2) / Math.max(grid.dates.length, 1));
  const title = t("Heures supplémentaires");
  const ids = (a: string, b: string, c: string, d: string, head = false) => (
    <>
      {[
        [a, ID.nb, s.txt],
        [b, ID.nom, s.left],
        [c, ID.prenom, s.left],
        [d, ID.fonction, s.left],
      ].map(([v, w, st], i) => (
        <View key={i} style={[s.cell, { width: w as number }, i === 0 ? { borderLeftWidth: 0.5 } : {}, i === 3 ? { borderRightWidth: 1 } : {}, head ? s.head : {}]}>
          <Text style={st as typeof s.txt}>{v as string}</Text>
        </View>
      ))}
    </>
  );
  return (
    <Document title={`${title} — ${monthName}`} author={company} language={locale}>
      <Page size="A3" orientation="landscape" style={s.page}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", width: 320 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {logoUrl ? <Image src={logoUrl} style={{ width: 52, height: 52, objectFit: "contain" }} /> : null}
            <View style={{ marginLeft: 10 }}>
              {[
                [t("Mois"), monthName],
                [t("Date début"), formatDateFr(grid.from)],
                [t("Date fin"), formatDateFr(grid.to)],
                [t("Date d'aujourd'hui"), formatDateFr(today)],
              ].map(([l, v]) => (
                <View key={l} style={s.row}>
                  <Text style={{ width: 82, color: "#555", fontSize: 8 }}>{l}</Text>
                  <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>{v}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "center" }}>{title}</Text>
            <Text style={{ fontSize: 11, textAlign: "center", marginTop: 3 }}>
              {t("Du")} {formatDateFr(grid.from)}   {t("Au")} {formatDateFr(grid.to)}
            </Text>
            {filtersLabel ? <Text style={{ fontSize: 7.5, color: "#555", textAlign: "center" }}>{filtersLabel}</Text> : null}
          </View>
          <View style={{ width: 320, alignItems: "flex-end" }}>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{company}</Text>
            {(companyDetails ?? []).map((l, i) => (
              <Text key={i} style={{ fontSize: 8, color: "#555" }}>
                {l}
              </Text>
            ))}
            <Text style={{ fontSize: 8, color: "#555" }}>{t("Total des heures supplémentaires")} : {fmt(grid.total)} h</Text>
            <Text style={{ fontSize: 8, color: "#555" }}>{t("dont automatiques {auto} h + manuelles {manual} h", { auto: fmt(grid.auto), manual: fmt(grid.manual) })}</Text>
          </View>
        </View>
        <View fixed>
          <View style={[s.row, { borderTopWidth: 0.5, borderColor: B }]}>
            {ids(t("Nombre"), t("Nom"), t("Prénom"), t("Fonction"), true)}
            {grid.dates.map((d) => (
              <View key={d} style={[s.cell, s.head, { width: dayW }]}>
                <Text style={[s.txt, { fontSize: 6 }]}>
                  {d.slice(8, 10)}/{d.slice(5, 7)}
                </Text>
              </View>
            ))}
            {["Auto", "Manuel", "Total"].map((h) => (
              <View key={h} style={[s.cell, s.head, { width: TOTAL_W }]}>
                <Text style={s.txt}>{t(h)}</Text>
              </View>
            ))}
          </View>
          <View style={s.row}>
            {ids("", "", "", "", true)}
            {grid.dates.map((d) => (
              <View key={d} style={[s.cell, s.head, { width: dayW }]}>
                <Text style={s.txt}>{WEEKDAY_INITIALS[weekdayOf(d)]}</Text>
              </View>
            ))}
            {[0, 1, 2].map((k) => (
              <View key={k} style={[s.cell, s.head, { width: TOTAL_W }]}>
                <Text style={s.txt}> </Text>
              </View>
            ))}
          </View>
        </View>
        {grid.rows.map((r) => (
          <View key={r.id} style={s.row} wrap={false}>
            {ids(String(r.order_number), trunc(r.last_name, 18), trunc(r.first_name, 16), trunc(r.job_title || t(POSITION_LABELS[r.position] ?? r.position), 15))}
            {grid.dates.map((d) => (
              <View key={d} style={[s.cell, { width: dayW }, r.hours[d] ? { backgroundColor: "#e0e7ff" } : {}]}>
                <Text style={[s.txt, r.hours[d] ? { fontFamily: "Helvetica-Bold" } : {}]}>{r.hours[d] ? fmt(r.hours[d].total) : ""}</Text>
              </View>
            ))}
            {(["auto", "manual", "total"] as const).map((k) => (
              <View key={k} style={[s.cell, { width: TOTAL_W, backgroundColor: "#f3f4f6" }]}>
                <Text style={[s.txt, k === "total" ? { fontFamily: "Helvetica-Bold" } : {}]}>{r[k] ? fmt(r[k]) : "—"}</Text>
              </View>
            ))}
          </View>
        ))}
        {grid.rows.length > 0 && (
          <View style={{ marginTop: 2 }} wrap={false}>
            {(
              [
                ["auto", "Heures automatiques du jour"],
                ["manual", "Heures manuelles du jour"],
                ["total", "Total du jour (heures)"],
              ] as const
            ).map(([k, label]) => (
              <View key={k} style={s.row}>
                <View style={[s.cell, s.head, { width: idW, borderLeftWidth: 0.5, borderRightWidth: 1 }]}>
                  <Text style={s.left}>{t(label)}</Text>
                </View>
                {grid.dates.map((d) => (
                  <View key={d} style={[s.cell, { width: dayW, backgroundColor: "#f3f4f6" }]}>
                    <Text style={[s.txt, k === "total" ? { fontFamily: "Helvetica-Bold" } : {}]}>{fmt(grid.dayTotals[d]?.[k] ?? 0)}</Text>
                  </View>
                ))}
                {(["auto", "manual", "total"] as const).map((c) => (
                  <View key={c} style={[s.cell, s.head, { width: TOTAL_W }]}>
                    <Text style={s.txt}>{c === k ? fmt(grid[k]) : ""}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
        <Text style={{ fontSize: 7.5, color: "#555", marginTop: 6 }}>{t("Total = heures automatiques (dépassement de l'heure d'entrée + 8 h, arrondi à l'heure supérieure) + heures manuelles accordées dans le Pointage, toujours additionnées.")}</Text>
        <View style={s.footer} fixed>
          <Text>{t("{company} — généré le {date} par {user}", { company, date: new Date().toLocaleString(locale === "en" ? "en-GB" : "fr-FR"), user: generatedBy })}</Text>
          <Text render={({ pageNumber, totalPages }) => t("Page {n} / {total}", { n: pageNumber, total: totalPages ?? pageNumber })} />
        </View>
      </Page>
    </Document>
  );
}
