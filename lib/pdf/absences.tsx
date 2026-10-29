import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Employee } from "@/lib/data/employees";
import { employeeName } from "@/lib/data/employees";
import { formatDateFr } from "@/lib/dates";
import { POSITION_LABELS, TEAM_LABELS } from "@/lib/types";
import { PdfDocument, PdfFooter, PdfHeader, PdfTable, styles } from "./components";
import { ABSENCE_ALERT_SHORT, type AbsenceAlert } from "@/lib/absence-types";
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

/** Rapport des absents sur une période : absences par employé et alertes. */
export function AbsencesPeriodPdf({ company, subtitle, rows, generatedBy }: { company: string; subtitle: string; rows: { name: string; position: string; non_justifiee: number; maladie: number; justifiee: number; total: number; certificates: number; alert: AbsenceAlert; unjustified_all: number }[]; generatedBy: string }) {
  const { t } = usePdf();
  const sum = (k: "non_justifiee" | "maladie" | "total" | "certificates") => rows.reduce((s, r) => s + r[k], 0);
  return (
    <PdfDocument title={`${t("Rapport des absents")} ${subtitle}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={t("Rapport des absents")} subtitle={subtitle} />
      <PdfTable
        columns={[
          { key: "n", label: "N°", width: 5, align: "center" },
          { key: "nom", label: "Nom et prénom", width: 26 },
          { key: "poste", label: "Poste", width: 14 },
          { key: "nj", label: "Non justifiées", width: 11, align: "right" },
          { key: "ml", label: "Maladie", width: 9, align: "right" },
          { key: "tot", label: "Total", width: 8, align: "right" },
          { key: "cert", label: "Certificats", width: 9, align: "right" },
          { key: "al", label: "Alerte / suivi", width: 18 },
        ]}
        rows={[
          ...rows.map((r, i) => ({ n: String(i + 1), nom: r.name, poste: t(POSITION_LABELS[r.position as keyof typeof POSITION_LABELS] ?? r.position), nj: String(r.non_justifiee), ml: String(r.maladie), tot: String(r.total), cert: String(r.certificates), al: r.alert === "aucune" ? "" : `${t(ABSENCE_ALERT_SHORT[r.alert])} (${r.unjustified_all})` })),
          { nom: t("Total"), nj: String(sum("non_justifiee")), ml: String(sum("maladie")), tot: String(sum("total")), cert: String(sum("certificates")) },
        ]}
      />
      <Text style={[styles.small, { marginTop: 4 }]}>{t("Source : le pointage. Un jour « Absent » ou « Absent maladie » compte une seule fois par employé ; Repos, Congé payé et Récupération ne sont pas des absences. Alertes : 2e absence non justifiée → engagement écrit ; plus de 4 → décision du responsable (cumul de toutes les absences non justifiées).")}</Text>
    </PdfDocument>
  );
}
