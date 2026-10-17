import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Warning } from "@/lib/data/warnings";
import type { GreenWasteEntry } from "@/lib/data/green-waste";
import { agentNames, type WorkTask } from "@/lib/data/tasks";
import { TASK_STATUS_LABELS, WARNING_STATUS_LABELS } from "@/lib/module-types";
import { formatDateFr, formatDateTimeFr } from "@/lib/dates";
import { PdfDocument, PdfFooter, PdfHeader, PdfTable, PhotoGrid, styles, type Column } from "./components";
import { usePdf } from "./context";

export function WarningsPdf({ company, subtitle, rows, generatedBy, detailed }: { company: string; subtitle: string; rows: Warning[]; generatedBy: string; detailed: boolean }) {
  const { t, locale } = usePdf();
  if (detailed) {
    return (
      <Document title={`${t("Avertissements")} ${subtitle}`} author={company} language={locale}>
        {rows.map((w) => (
          <Page key={w.id} size="A4" style={styles.page}>
            <PdfHeader company={company} title={t("Avertissement")} subtitle={t("{name} — incident du {date}", { name: w.name, date: formatDateFr(w.incident_date) })} />
            <Text style={{ marginBottom: 4 }}>
              {t("Statut")} : {t(WARNING_STATUS_LABELS[w.status])}
            </Text>
            <Text style={{ marginBottom: 4 }}>
              {t("Description")} : {w.description}
            </Text>
            {w.observations ? (
              <Text style={{ marginBottom: 4 }}>
                {t("Observations")} : {w.observations}
              </Text>
            ) : null}
            <Text style={styles.small}>{t("Créé le {date}", { date: formatDateTimeFr(w.created_at) })}</Text>
            <PhotoGrid title="Photos justificatives" photos={w.photos} />
            <View style={{ marginTop: 24, flexDirection: "row", justifyContent: "space-between" }}>
              <Text>{t("Signature de l'employé")} : ______________________</Text>
              <Text>{t("Visa de la direction")} : ______________________</Text>
            </View>
            <PdfFooter company={company} generatedBy={generatedBy} />
          </Page>
        ))}
      </Document>
    );
  }
  const columns: Column[] = [
    { key: "date", label: "Date incident", width: 13 },
    { key: "nom", label: "Employé", width: 22 },
    { key: "desc", label: "Description", width: 37 },
    { key: "obs", label: "Observations", width: 18 },
    { key: "st", label: "Statut", width: 10 },
  ];
  return (
    <PdfDocument title={`${t("Avertissements")} ${subtitle}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={t("Avertissements")} subtitle={subtitle} />
      <PdfTable columns={columns} rows={rows.map((w) => ({ date: formatDateFr(w.incident_date), nom: w.name, desc: w.description, obs: w.observations, st: t(WARNING_STATUS_LABELS[w.status]) }))} />
      <Text style={[styles.small, { marginTop: 4 }]}>{t("Total : {count} avertissement(s)", { count: rows.length })}</Text>
    </PdfDocument>
  );
}

export function GreenWastePdf({ company, subtitle, rows, generatedBy }: { company: string; subtitle: string; rows: GreenWasteEntry[]; generatedBy: string }) {
  const { t, locale } = usePdf();
  return (
    <Document title={`${t("Déchet vert")} ${subtitle}`} author={company} language={locale}>
      {rows.map((e) => (
        <Page key={e.id} size="A4" style={styles.page}>
          <PdfHeader company={company} title={t("Déchet vert")} subtitle={formatDateFr(e.activity_date)} />
          <Text style={{ marginBottom: 3 }}>
            {t("Lieu")} : {e.location || "—"}
          </Text>
          {e.comment ? (
            <Text style={{ marginBottom: 3 }}>
              {t("Commentaire")} : {e.comment}
            </Text>
          ) : null}
          <PhotoGrid title="Photos AVANT" photos={e.photosAvant} />
          <PhotoGrid title="Photos APRÈS" photos={e.photosApres} />
          <PdfFooter company={company} generatedBy={generatedBy} />
        </Page>
      ))}
    </Document>
  );
}

export function TasksPdf({ company, subtitle, rows, generatedBy, detailed }: { company: string; subtitle: string; rows: WorkTask[]; generatedBy: string; detailed: boolean }) {
  const { t, locale } = usePdf();
  if (detailed) {
    return (
      <Document title={`${t("Programme de travail")} ${subtitle}`} author={company} language={locale}>
        {rows.map((task) => (
          <Page key={task.id} size="A4" style={styles.page}>
            <PdfHeader company={company} title={t("Programme de travail — tâche")} subtitle={formatDateFr(task.planned_date)} />
            <Text style={{ marginBottom: 3 }}>
              {t("Lieu")} : {task.location || "—"}
            </Text>
            <Text style={{ marginBottom: 3 }}>
              {t("Description")} : {task.description}
            </Text>
            <Text style={{ marginBottom: 3 }}>
              {t("Agents")} : {agentNames(task) || "—"}
            </Text>
            <Text style={{ marginBottom: 3 }}>
              {t("Statut")} : {t(TASK_STATUS_LABELS[task.status])}
              {task.completed_at ? ` (${formatDateTimeFr(task.completed_at)})` : ""}
            </Text>
            {task.comments ? (
              <Text style={{ marginBottom: 3 }}>
                {t("Commentaires")} : {task.comments}
              </Text>
            ) : null}
            <PhotoGrid title="Avant" photos={task.photosAvant} />
            <PhotoGrid title="Après" photos={task.photosApres} />
            <PdfFooter company={company} generatedBy={generatedBy} />
          </Page>
        ))}
      </Document>
    );
  }
  const columns: Column[] = [
    { key: "date", label: "Date", width: 12 },
    { key: "lieu", label: "Lieu", width: 20 },
    { key: "desc", label: "Description", width: 34 },
    { key: "agents", label: "Agents", width: 22 },
    { key: "st", label: "Statut", width: 12 },
  ];
  return (
    <PdfDocument title={`${t("Programme de travail")} ${subtitle}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={t("Programme de travail")} subtitle={subtitle} />
      <PdfTable columns={columns} rows={rows.map((task) => ({ date: formatDateFr(task.planned_date), lieu: task.location, desc: task.description, agents: agentNames(task), st: t(TASK_STATUS_LABELS[task.status]) }))} />
    </PdfDocument>
  );
}
