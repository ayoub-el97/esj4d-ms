import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { FONT, FONT_BOLD } from "./fonts";
import { CODE_DEF, GRID_CODES, WEEKDAY_INITIALS, weekdayOf, workedDayCounts, type GridCode, type GridData } from "@/lib/attendance-grid";
import { formatDateFr } from "@/lib/dates";
import { POSITION_LABELS } from "@/lib/types";
import { usePdf } from "./context";

// A3 paysage : 1191 × 842 pt
const PAGE_W = 1191;
const PAD = 18;
const ID_W = { nb: 30, nom: 74, prenom: 64, fonction: 62, jft: 18, jp: 18 };
const BORDER = "#9ca3af";

const s = StyleSheet.create({
  page: { padding: PAD, paddingBottom: 28, fontSize: 7, fontFamily: FONT, color: "#111" },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  logo: { width: 52, height: 52, objectFit: "contain" },
  logoFallback: { width: 52, height: 52, backgroundColor: "#4f46e5", color: "#fff", fontSize: 24, textAlign: "center", paddingTop: 13, borderRadius: 6 },
  metaLabel: { width: 82, color: "#555", fontSize: 8 },
  metaValue: { fontSize: 8, fontFamily: FONT_BOLD },
  title: { fontSize: 15, fontFamily: FONT_BOLD, textAlign: "center" },
  range: { fontSize: 11, textAlign: "center", marginTop: 3 },
  row: { flexDirection: "row" },
  cell: { borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: BORDER, justifyContent: "center", height: 12 },
  head: { backgroundColor: "#e5e7eb", fontFamily: FONT_BOLD },
  txt: { fontSize: 6.5, textAlign: "center" },
  txtLeft: { fontSize: 6.5, paddingLeft: 2 },
  footer: { position: "absolute", bottom: 10, left: PAD, right: PAD, fontSize: 7, color: "#777", flexDirection: "row", justifyContent: "space-between" },
});

const trunc = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

export function AttendanceGridPdf({
  grid,
  company,
  agency,
  generatedBy,
  today,
  monthName,
  versionLabel,
  filtersLabel,
}: {
  grid: GridData;
  company: string;
  agency: string;
  generatedBy: string;
  today: string;
  monthName: string;
  versionLabel: string;
  filtersLabel: string;
}) {
  const { t, locale, logoUrl, companyDetails } = usePdf();
  const codes: GridCode[] = GRID_CODES.filter((c) => !c.extra || grid.extraCodes.includes(c.code)).map((c) => c.code);
  const idW = ID_W.nb + ID_W.nom + ID_W.prenom + ID_W.fonction + ID_W.jft + ID_W.jp;
  const avail = PAGE_W - 2 * PAD - idW - 2;
  const dayW = Math.min(30, avail / Math.max(grid.dates.length, 1));
  const title = t("Rapport mensuel de pointage");

  const idCells = (nb: string, nom: string, prenom: string, fonction: string, jft: string, jp: string, head = false) => (
    <>
      <View style={[s.cell, { width: ID_W.nb, borderLeftWidth: 0.5 }, head ? s.head : {}]}>
        <Text style={s.txt}>{nb}</Text>
      </View>
      <View style={[s.cell, { width: ID_W.nom }, head ? s.head : {}]}>
        <Text style={s.txtLeft}>{nom}</Text>
      </View>
      <View style={[s.cell, { width: ID_W.prenom }, head ? s.head : {}]}>
        <Text style={s.txtLeft}>{prenom}</Text>
      </View>
      <View style={[s.cell, { width: ID_W.fonction }, head ? s.head : {}]}>
        <Text style={s.txtLeft}>{fonction}</Text>
      </View>
      <View style={[s.cell, { width: ID_W.jft }, head ? s.head : {}]}>
        <Text style={[s.txt, { fontFamily: FONT_BOLD }]}>{jft}</Text>
      </View>
      <View style={[s.cell, { width: ID_W.jp, borderRightWidth: 1 }, head ? s.head : {}]}>
        <Text style={[s.txt, { fontFamily: FONT_BOLD }]}>{jp}</Text>
      </View>
    </>
  );

  return (
    <Document title={`${title} — ${monthName}`} author={company} language={locale}>
      <Page size="A3" orientation="landscape" style={s.page}>
        {/* En-tête : logo + mois et dates (gauche), Du / Au (centre), société (droite) */}
        <View style={s.header}>
          <View style={{ flexDirection: "row", alignItems: "center", width: 320 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : <Text style={s.logoFallback}>{company.slice(0, 1).toUpperCase()}</Text>}
            <View style={{ marginLeft: 10 }}>
              {[
                [t("Mois"), monthName],
                [t("Date début"), formatDateFr(grid.from)],
                [t("Date fin"), formatDateFr(grid.to)],
                [t("Date d'aujourd'hui"), formatDateFr(today)],
              ].map(([l, v]) => (
                <View key={l} style={s.row}>
                  <Text style={s.metaLabel}>{l}</Text>
                  <Text style={s.metaValue}>{v}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{title}</Text>
            <Text style={s.range}>
              {t("Du")} {formatDateFr(grid.from)}   {t("Au")} {formatDateFr(grid.to)}
            </Text>
            <Text style={{ fontSize: 7.5, color: "#555", textAlign: "center", marginTop: 2 }}>{versionLabel}</Text>
            {filtersLabel ? <Text style={{ fontSize: 7.5, color: "#555", textAlign: "center" }}>{filtersLabel}</Text> : null}
          </View>
          <View style={{ width: 320, alignItems: "flex-end" }}>
            <Text style={{ fontSize: 10, fontFamily: FONT_BOLD }}>{company}</Text>
            {(companyDetails?.length ? companyDetails : [agency]).filter(Boolean).map((l, i) => (
              <Text key={i} style={{ fontSize: 8, color: "#555" }}>
                {l}
              </Text>
            ))}
            <Text style={{ fontSize: 8, color: "#555" }}>{t("{employees} employé(s) · {count} jour(s)", { employees: grid.rows.length, count: grid.dates.length })}</Text>
          </View>
        </View>

        {/* Ligne d'en-tête du tableau, répétée sur chaque page */}
        <View fixed>
          <View style={[s.row, { borderTopWidth: 0.5, borderColor: BORDER }]}>
            {idCells(t("Nombre"), t("Nom"), t("Prénom"), t("Fonction"), "JFT", "JP", true)}
            {grid.dates.map((d) => (
              <View key={d} style={[s.cell, s.head, { width: dayW }, grid.holidays[d] ? { backgroundColor: "#e9d5ff" } : {}]}>
                <Text style={[s.txt, { fontSize: 6 }]}>
                  {d.slice(8, 10)}/{d.slice(5, 7)}
                </Text>
              </View>
            ))}
          </View>
          <View style={s.row}>
            {idCells("", "", "", "", "", "", true)}
            {grid.dates.map((d) => (
              <View key={d} style={[s.cell, s.head, { width: dayW }, grid.holidays[d] ? { backgroundColor: "#e9d5ff" } : {}]}>
                <Text style={s.txt}>{WEEKDAY_INITIALS[weekdayOf(d)]}</Text>
              </View>
            ))}
          </View>
        </View>

        {grid.rows.length === 0 && <Text style={{ marginTop: 8, fontSize: 9, color: "#555" }}>{t("Aucun employé pour cette période et ces filtres.")}</Text>}
        {grid.rows.map((r, i) => {
          const days = workedDayCounts(grid, r);
          return (
          <View key={r.id} style={s.row} wrap={false}>
            {idCells(String(i + 1), trunc(r.last_name, 18), trunc(r.first_name, 16), trunc(r.job_title || t(POSITION_LABELS[r.position] ?? r.position), 15), String(days.jft), String(days.jp))}
            {grid.dates.map((d) => {
              const c = r.cells[d];
              if (!c || !c.statuses.length)
                return (
                  <View key={d} style={[s.cell, { width: dayW }, d <= today ? { backgroundColor: "#f3f4f6" } : {}]}>
                    <Text style={[s.txt, { color: "#9ca3af" }]}>{d <= today ? "·" : ""}</Text>
                  </View>
                );
              if (c.conflict || c.unknown)
                return (
                  <View key={d} style={[s.cell, { width: dayW, borderWidth: 1, borderColor: "#dc2626" }]}>
                    <Text style={[s.txt, { color: "#b91c1c", fontFamily: FONT_BOLD }]}>{c.conflict ? "!" : "?"}</Text>
                  </View>
                );
              const def = CODE_DEF[c.code!];
              return (
                <View key={d} style={[s.cell, { width: dayW, backgroundColor: def.bg }]}>
                  <Text style={[s.txt, { color: def.fg, fontFamily: FONT_BOLD }]}>
                    {def.code}
                    {c.double ? `×${c.statuses.length}` : ""}
                  </Text>
                </View>
              );
            })}
          </View>
          );
        })}

        {/* Totaux par date et par code */}
        {grid.rows.length > 0 && (
          <View wrap={false} style={{ marginTop: 2 }}>
            {codes.map((c) => (
              <View key={c} style={s.row}>
                <View style={[s.cell, { width: idW, borderLeftWidth: 0.5, borderRightWidth: 1, backgroundColor: "#e5e7eb", flexDirection: "row", alignItems: "center", justifyContent: "flex-start" }]}>
                  <Text style={[s.txt, { width: 22, marginLeft: 2, backgroundColor: CODE_DEF[c].bg, color: CODE_DEF[c].fg, fontFamily: FONT_BOLD }]}>{c}</Text>
                  <Text style={[s.txtLeft, { fontFamily: FONT_BOLD }]}>
                    {t(CODE_DEF[c].label)} ({t("période : {count}", { count: grid.totals[c] ?? 0 })})
                  </Text>
                </View>
                {grid.dates.map((d) => {
                  const n = grid.dayTotals[d]?.[c] ?? 0;
                  return (
                    <View key={d} style={[s.cell, { width: dayW, backgroundColor: n ? CODE_DEF[c].bg : "#f3f4f6" }]}>
                      <Text style={[s.txt, n ? { color: CODE_DEF[c].fg, fontFamily: FONT_BOLD } : { color: "#6b7280" }]}>{String(n)}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {/* Légende */}
        <View wrap={false} style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 8, fontFamily: FONT_BOLD, marginBottom: 3 }}>{t("Légende")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {codes.map((c) => (
              <View key={c} style={{ flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 3 }}>
                <Text style={[s.txt, { width: 24, paddingVertical: 1.5, backgroundColor: CODE_DEF[c].bg, color: CODE_DEF[c].fg, fontFamily: FONT_BOLD }]}>{c}</Text>
                <Text style={{ fontSize: 7.5, marginLeft: 3 }}>
                  {t(CODE_DEF[c].label)}
                  {CODE_DEF[c].extra ? ` (${t("hors liste")})` : ""}
                </Text>
              </View>
            ))}
            <Text style={{ fontSize: 7.5, marginRight: 12 }}>JFT = {t("Jours fériés travaillés")}</Text>
            <Text style={{ fontSize: 7.5, marginRight: 12 }}>JP = {t("Jours payés : jours de travail ordinaires, hors jours fériés travaillés")}</Text>
            <Text style={{ fontSize: 7.5, marginRight: 12 }}>· = {t("Non pointé")}</Text>
            <Text style={{ fontSize: 7.5, marginRight: 12 }}>! = {t("À vérifier")}</Text>
            <Text style={{ fontSize: 7.5 }}>×2 = {t("deux services le même jour")}</Text>
          </View>
          {grid.issues.length > 0 && (
            <Text style={{ fontSize: 7.5, color: "#b91c1c", marginTop: 3 }}>
              {t("{count} pointage(s) à vérifier (non comptés dans les totaux) :", { count: grid.issues.length })}{" "}
              {grid.issues.slice(0, 40).map((i) => `${i.name} ${formatDateFr(i.date)}`).join(" ; ")}
            </Text>
          )}
        </View>

        <View style={s.footer} fixed>
          <Text>{t("{company} — généré le {date} par {user}", { company, date: new Date().toLocaleString(locale === "en" ? "en-GB" : "fr-FR"), user: generatedBy })}</Text>
          <Text render={({ pageNumber, totalPages }) => t("Page {n} / {total}", { n: pageNumber, total: totalPages ?? pageNumber })} />
        </View>
      </Page>
    </Document>
  );
}
