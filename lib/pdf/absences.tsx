import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Employee } from "@/lib/data/employees";
import { employeeName } from "@/lib/data/employees";
import { formatDateFr } from "@/lib/dates";
import { POSITION_LABELS, TEAM_LABELS } from "@/lib/types";
import { PdfFooter, PdfHeader, PdfTable, styles } from "./components";
import { usePdf } from "./context";

/** Engagement écrit relatif aux absences, à faire signer par l'employé (document à imprimer). */
export function EngagementAbsencesPdf({ company, employee, unjustifiedDates, generatedBy }: { company: string; employee: Employee; unjustifiedDates: string[]; generatedBy: string }) {
  const { t, locale } = usePdf();
  const name = employeeName(employee);
  return (
    <Document title={`${t("Engagement écrit relatif aux absences")} — ${name}`} author={company} language={locale}>
      <Page size="A4" style={styles.page}>
        <PdfHeader company={company} title={t("Engagement écrit relatif aux absences")} subtitle={name} />
        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text>
              {t("Employé")} : {name}
            </Text>
            <Text>
              {t("Matricule")} : {employee.matricule || "—"}
            </Text>
          </View>
          <View style={styles.metaBox}>
            <Text>
              {t("Poste")} : {t(POSITION_LABELS[employee.position])}
            </Text>
            <Text>
              {t("Équipe")} : {t(TEAM_LABELS[employee.team_type])}
            </Text>
          </View>
          <View style={styles.metaBox}>
            <Text>
              {t("Date")} : {formatDateFr(new Date().toISOString().slice(0, 10))}
            </Text>
          </View>
        </View>
        <Text style={styles.section}>{t("Absences non justifiées enregistrées")}</Text>
        <PdfTable
          columns={[
            { key: "n", label: "N°", width: 10, align: "center" },
            { key: "d", label: "Date de l'absence", width: 90 },
          ]}
          rows={unjustifiedDates.map((d, i) => ({ n: String(i + 1), d: formatDateFr(d) }))}
        />
        <Text style={[styles.section, { marginTop: 14 }]}>{t("Engagement")}</Text>
        <Text>
          {t(
            "Je soussigné(e), {name}, reconnais avoir été absent(e) sans justification aux dates indiquées ci-dessus. Je m'engage à respecter mes horaires de travail, à prévenir mon responsable de toute absence et à remettre un justificatif (certificat médical ou autre) dans les délais prévus par le règlement intérieur. J'ai été informé(e) qu'au-delà de quatre absences non justifiées, la direction examinera ma situation conformément au règlement intérieur.",
            { name },
          )}
        </Text>
        <View style={{ marginTop: 36, flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text>{t("Signature de l'employé")} :</Text>
            <Text style={{ marginTop: 6 }}>{t("Date")} : ____ / ____ / ________</Text>
          </View>
          <View>
            <Text>{t("Visa de la direction")} :</Text>
            <Text style={{ marginTop: 6 }}>{t("Date")} : ____ / ____ / ________</Text>
          </View>
        </View>
        <PdfFooter company={company} generatedBy={generatedBy} />
      </Page>
    </Document>
  );
}
