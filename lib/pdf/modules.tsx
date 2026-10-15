import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { LeaveBalance, LeaveRequest } from "@/lib/data/leaves";
import { LEAVE_STATUS_LABELS } from "@/lib/data/leaves";
import type { Warning } from "@/lib/data/warnings";
import { WARNING_STATUS_LABELS } from "@/lib/data/warnings";
import type { GreenWasteEntry } from "@/lib/data/green-waste";
import { agentNames, TASK_STATUS_LABELS, type WorkTask } from "@/lib/data/tasks";
import { formatDateFr, formatDateTimeFr } from "@/lib/dates";
import type { PhotoItem } from "@/lib/photo-types";
import { PdfDocument, PdfFooter, PdfHeader, PdfTable, styles, type Column } from "./components";

function Photos({ title, photos }: { title: string; photos: PhotoItem[] }) {
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.section}>{title}</Text>
      {photos.length === 0 ? (
        <Text style={styles.small}>Aucune photo</Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {photos.map((p) => (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image key={p.id} src={p.url} style={{ width: 160, height: 120, objectFit: "cover", borderWidth: 1, borderColor: "#999" }} />
          ))}
        </View>
      )}
    </View>
  );
}

export function LeaveBalancesPdf({ company, asOf, rows, generatedBy }: { company: string; asOf: string; rows: LeaveBalance[]; generatedBy: string }) {
  const columns: Column[] = [
    { key: "nb", label: "NB", width: 6, align: "center" },
    { key: "nom", label: "Nom et prénom", width: 34 },
    { key: "months", label: "Mois", width: 10, align: "right" },
    { key: "acq", label: "Acquis", width: 12, align: "right" },
    { key: "pris", label: "Pris", width: 12, align: "right" },
    { key: "adj", label: "Ajust.", width: 12, align: "right" },
    { key: "solde", label: "Solde", width: 14, align: "right" },
  ];
  return (
    <PdfDocument title={`Soldes de congés au ${asOf}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title="Soldes de congés" subtitle={`au ${formatDateFr(asOf)}`} />
      <PdfTable columns={columns} rows={rows.map((r) => ({ nb: String(r.order_number), nom: r.name, months: String(r.months), acq: String(r.accrued), pris: String(r.taken), adj: String(r.adjustments), solde: String(r.balance) }))} />
    </PdfDocument>
  );
}

export function LeaveHistoryPdf({ company, subtitle, rows, generatedBy }: { company: string; subtitle: string; rows: LeaveRequest[]; generatedBy: string }) {
  const columns: Column[] = [
    { key: "nom", label: "Employé", width: 28 },
    { key: "du", label: "Du", width: 12 },
    { key: "au", label: "Au", width: 12 },
    { key: "j", label: "Jours", width: 8, align: "right" },
    { key: "st", label: "Statut", width: 12 },
    { key: "motif", label: "Motif", width: 28 },
  ];
  const total = rows.filter((r) => r.status === "acceptee").reduce((s, r) => s + r.days, 0);
  return (
    <PdfDocument title={`Historique des congés ${subtitle}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title="Historique des congés" subtitle={subtitle} />
      <PdfTable columns={columns} rows={rows.map((r) => ({ nom: r.name, du: formatDateFr(r.start_date), au: formatDateFr(r.end_date), j: String(r.days), st: LEAVE_STATUS_LABELS[r.status], motif: r.reason }))} />
      <Text style={[styles.small, { marginTop: 4 }]}>Total des congés acceptés : {total} jour(s)</Text>
    </PdfDocument>
  );
}

export function WarningsPdf({ company, subtitle, rows, generatedBy, detailed }: { company: string; subtitle: string; rows: Warning[]; generatedBy: string; detailed: boolean }) {
  if (detailed) {
    return (
      <Document title={`Avertissements ${subtitle}`} author={company} language="fr">
        {rows.map((w) => (
          <Page key={w.id} size="A4" style={styles.page}>
            <PdfHeader company={company} title="Avertissement" subtitle={`${w.name} — incident du ${formatDateFr(w.incident_date)}`} />
            <Text style={{ marginBottom: 4 }}>Statut : {WARNING_STATUS_LABELS[w.status]}</Text>
            <Text style={{ marginBottom: 4 }}>Description : {w.description}</Text>
            {w.observations ? <Text style={{ marginBottom: 4 }}>Observations : {w.observations}</Text> : null}
            <Text style={styles.small}>Créé le {formatDateTimeFr(w.created_at)}</Text>
            <Photos title="Photos justificatives" photos={w.photos} />
            <View style={{ marginTop: 24, flexDirection: "row", justifyContent: "space-between" }}>
              <Text>Signature de l&apos;employé : ______________________</Text>
              <Text>Visa de la direction : ______________________</Text>
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
    <PdfDocument title={`Avertissements ${subtitle}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title="Avertissements" subtitle={subtitle} />
      <PdfTable columns={columns} rows={rows.map((w) => ({ date: formatDateFr(w.incident_date), nom: w.name, desc: w.description, obs: w.observations, st: WARNING_STATUS_LABELS[w.status] }))} />
      <Text style={[styles.small, { marginTop: 4 }]}>Total : {rows.length} avertissement(s)</Text>
    </PdfDocument>
  );
}

export function GreenWastePdf({ company, subtitle, rows, generatedBy }: { company: string; subtitle: string; rows: GreenWasteEntry[]; generatedBy: string }) {
  return (
    <Document title={`Déchet vert ${subtitle}`} author={company} language="fr">
      {rows.map((e) => (
        <Page key={e.id} size="A4" style={styles.page}>
          <PdfHeader company={company} title="Déchet vert" subtitle={formatDateFr(e.activity_date)} />
          <Text style={{ marginBottom: 3 }}>Lieu : {e.location || "—"}</Text>
          {e.comment ? <Text style={{ marginBottom: 3 }}>Commentaire : {e.comment}</Text> : null}
          <Photos title="Photos AVANT" photos={e.photosAvant} />
          <Photos title="Photos APRÈS" photos={e.photosApres} />
          <PdfFooter company={company} generatedBy={generatedBy} />
        </Page>
      ))}
    </Document>
  );
}

export function TasksPdf({ company, subtitle, rows, generatedBy, detailed }: { company: string; subtitle: string; rows: WorkTask[]; generatedBy: string; detailed: boolean }) {
  if (detailed) {
    return (
      <Document title={`Programme de travail ${subtitle}`} author={company} language="fr">
        {rows.map((t) => (
          <Page key={t.id} size="A4" style={styles.page}>
            <PdfHeader company={company} title="Programme de travail — tâche" subtitle={formatDateFr(t.planned_date)} />
            <Text style={{ marginBottom: 3 }}>Lieu : {t.location || "—"}</Text>
            <Text style={{ marginBottom: 3 }}>Description : {t.description}</Text>
            <Text style={{ marginBottom: 3 }}>Agents : {agentNames(t) || "—"}</Text>
            <Text style={{ marginBottom: 3 }}>
              Statut : {TASK_STATUS_LABELS[t.status]}
              {t.completed_at ? ` (le ${formatDateTimeFr(t.completed_at)})` : ""}
            </Text>
            {t.comments ? <Text style={{ marginBottom: 3 }}>Commentaires : {t.comments}</Text> : null}
            <Photos title="Avant" photos={t.photosAvant} />
            <Photos title="Après" photos={t.photosApres} />
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
    <PdfDocument title={`Programme de travail ${subtitle}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title="Programme de travail" subtitle={subtitle} />
      <PdfTable columns={columns} rows={rows.map((t) => ({ date: formatDateFr(t.planned_date), lieu: t.location, desc: t.description, agents: agentNames(t), st: TASK_STATUS_LABELS[t.status] }))} />
    </PdfDocument>
  );
}
