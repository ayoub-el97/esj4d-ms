import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { CombinedReport } from "@/lib/data/combined-report";
import { formatDateFr } from "@/lib/dates";
import { FONT, FONT_BOLD } from "./fonts";
import { usePdf } from "./context";

/** Taille du texte pour tenir sur une page A4 selon le volume (6 à 9 pt, deux colonnes). */
function fitFont(data: CombinedReport): number {
  const cleaning = Math.ceil((data.cleaning?.length ?? 1) / 2) + 2;
  const truckLines = (data.trucks ?? []).reduce((n, tr) => n + 2 + tr.shifts.length * 2 + Math.floor(tr.locations.length / 45), 0);
  const lines = cleaning + Math.ceil(truckLines / 2) + 6;
  return Math.max(6, Math.min(9, 760 / (lines * 1.3)));
}

const cols = <T,>(list: T[]) => {
  const half = Math.ceil(list.length / 2);
  return [list.slice(0, half), list.slice(half)];
};

/** Rapport Collecte / Nettoiement : une seule page A4 (noms, camions, lieux). */
export function CombinedReportPdf({ company, data }: { company: string; data: CombinedReport }) {
  const { t, locale } = usePdf();
  const size = fitFont(data);
  const title = t("Rapport Collecte / Nettoiement");
  const section = { fontSize: size + 1, fontFamily: FONT_BOLD, borderBottomWidth: 0.75, borderBottomColor: "#333", marginTop: 6, marginBottom: 3, paddingBottom: 1 } as const;
  const row = { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.25, borderBottomColor: "#bbb", paddingVertical: 0.6 } as const;
  return (
    <Document title={`${title} ${data.date}`} author={company} language={locale}>
      <Page size="A4" style={{ padding: 20, fontSize: size, fontFamily: FONT, color: "#111", lineHeight: 1.15 }}>
        <Text style={{ fontSize: 12, fontFamily: FONT_BOLD, textAlign: "center", lineHeight: 1.3, marginBottom: 3 }}>{title}</Text>
        <Text style={{ fontSize: 9, textAlign: "center", marginBottom: 2 }}>
          {company} — {t("Date : {date}", { date: formatDateFr(data.date) })}
        </Text>

        <Text style={section}>{t("Nettoiement")}</Text>
        {data.cleaning === null ? (
          <Text>{t("Aucun rapport de nettoiement enregistré pour cette date.")}</Text>
        ) : data.cleaning.length === 0 ? (
          <Text>{t("Aucun employé dans le rapport de nettoiement de cette date.")}</Text>
        ) : (
          <View style={{ flexDirection: "row", gap: 12 }}>
            {cols(data.cleaning).map((part, c) => (
              <View key={c} style={{ flex: 1 }}>
                <View style={[row, { fontFamily: FONT_BOLD }]}>
                  <Text>{t("Lieu de travail")}</Text>
                  <Text>{t("Employé")}</Text>
                </View>
                {part.map((r, i) => (
                  <View key={i} style={row}>
                    <Text style={{ flex: 1, paddingRight: 4 }}>{r.location || "—"}</Text>
                    <Text style={{ fontFamily: FONT_BOLD, textAlign: "right" }}>{r.name}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        <Text style={section}>{t("Collecte")}</Text>
        {data.trucks === null ? (
          <Text>{t("Aucun rapport de collecte enregistré pour cette date.")}</Text>
        ) : (
          <View style={{ flexDirection: "row", gap: 12 }}>
            {cols(data.trucks).map((part, c) => (
              <View key={c} style={{ flex: 1 }}>
                {part.map((tr) => (
                  <View key={tr.key} wrap={false} style={{ borderBottomWidth: 0.25, borderBottomColor: "#bbb", paddingBottom: 2, marginBottom: 2 }}>
                    <Text style={{ fontFamily: FONT_BOLD }}>
                      {tr.type} {t("N°")} {tr.number}
                      {tr.matricule && tr.matricule !== tr.number ? ` (${tr.matricule})` : ""}
                    </Text>
                    {tr.shifts.map((s, i) => (
                      <View key={i}>
                        <Text>
                          {s.shift ? `${s.shift === "matin" ? t("Matin") : t("Soir")} — ` : ""}
                          {t("Chauffeur")} : {s.chauffeur || "—"}
                        </Text>
                        <Text>
                          {t("Équipe")} : {s.crew.length ? s.crew.join(", ") : "—"}
                        </Text>
                      </View>
                    ))}
                    <Text>
                      {t("Lieux de travail")} : {tr.locations || "—"}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}
