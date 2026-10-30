import { Text, View } from "@react-pdf/renderer";
import type { CombinedReport } from "@/lib/data/combined-report";
import { formatDateFr } from "@/lib/dates";
import { WORK_LOCATIONS_TITLE } from "@/lib/modules";
import { PdfDocument, PdfHeader } from "./components";
import { usePdf } from "./context";
import { FONT_BOLD, isRtlText } from "./fonts";

const section = { fontSize: 12, fontFamily: FONT_BOLD, borderBottomWidth: 1, borderBottomColor: "#333", marginTop: 10, marginBottom: 5, paddingBottom: 2 } as const;

/** Libellé à gauche, valeurs l'une sous l'autre à droite. */
function Field({ label, values }: { label: string; values: string[] }) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: 1.5 }}>
      <Text style={{ width: 90, color: "#555" }}>{label}</Text>
      <View style={{ flex: 1 }}>
        {(values.length ? values : ["—"]).map((v, i) => (
          <Text key={i} style={{ fontFamily: FONT_BOLD, textAlign: isRtlText(v) ? "right" : "left" }}>
            {v}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** أماكن اشتغال العمال : A4 portrait, texte de taille fixe, suite sur les pages suivantes si besoin. */
export function CombinedReportPdf({ company, generatedBy, data }: { company: string; generatedBy: string; data: CombinedReport }) {
  const { t } = usePdf();
  return (
    <PdfDocument title={`${WORK_LOCATIONS_TITLE} ${data.date}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={WORK_LOCATIONS_TITLE} subtitle={t("Date : {date}", { date: formatDateFr(data.date) })} />
      <View style={{ fontSize: 10 }}>
        <Text style={section} minPresenceAhead={40}>
          {t("Nettoiement")}
        </Text>
        {data.cleaning === null ? (
          <Text>{t("Aucun rapport de nettoiement enregistré pour cette date.")}</Text>
        ) : data.cleaning.length === 0 ? (
          <Text>{t("Aucun employé dans le rapport de nettoiement de cette date.")}</Text>
        ) : (
          <View>
            <View style={{ flexDirection: "row", gap: 10, borderBottomWidth: 0.5, borderBottomColor: "#777", paddingBottom: 2, color: "#555", fontFamily: FONT_BOLD }}>
              <Text style={{ flex: 1 }}>{t("Employé")}</Text>
              <Text style={{ flex: 1 }}>{t("Lieu de travail")}</Text>
            </View>
            {data.cleaning.map((r) => (
              <View key={r.id} wrap={false} style={{ flexDirection: "row", gap: 10, borderBottomWidth: 0.25, borderBottomColor: "#bbb", paddingVertical: 2.5 }}>
                <Text style={{ flex: 1, fontFamily: FONT_BOLD }}>{r.name}</Text>
                <Text style={{ flex: 1, textAlign: isRtlText(r.location) ? "right" : "left" }}>{r.location || "—"}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={section} minPresenceAhead={80}>
          {t("Collecte")}
        </Text>
        {data.trucks === null ? (
          <Text>{t("Aucun rapport de collecte enregistré pour cette date.")}</Text>
        ) : (
          data.trucks.map((tr) => (
            <View key={tr.key} wrap={false} style={{ borderWidth: 0.5, borderColor: "#999", borderRadius: 3, padding: 6, marginBottom: 6 }}>
              <Text style={{ fontSize: 11, fontFamily: FONT_BOLD, borderBottomWidth: 0.25, borderBottomColor: "#bbb", paddingBottom: 2, marginBottom: 2 }}>
                {tr.type} {t("N°")} {tr.number}
                {tr.matricule && tr.matricule !== tr.number ? ` (${tr.matricule})` : ""}
              </Text>
              {tr.shifts.map((s, i) => (
                <View key={i} style={{ marginBottom: 2 }}>
                  {s.shift && <Text style={{ fontFamily: FONT_BOLD }}>{s.shift === "matin" ? t("Matin") : t("Soir")}</Text>}
                  <Field label={t("Chauffeur")} values={s.chauffeur ? [s.chauffeur] : []} />
                  <Field label={t("Équipe")} values={s.crew} />
                </View>
              ))}
              <Field label={t("Lieux de travail")} values={tr.locationList} />
            </View>
          ))
        )}
      </View>
    </PdfDocument>
  );
}
