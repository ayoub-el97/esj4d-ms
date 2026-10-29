import { Text, View } from "@react-pdf/renderer";
import { CONTRACT_STATUS_LABELS, contractPeriod, type Contract } from "@/lib/contract-types";
import type { ContractSummary } from "@/lib/data/contracts";
import { formatDateFr } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PdfDocument, PdfHeader, PdfTable, styles } from "./components";
import { usePdf } from "./context";

const num = (v: unknown) => Number(v ?? 0);
const fmt = (v: unknown) => {
  const n = num(v);
  // Espace fine insécable du format français absente d'Helvetica : espace ordinaire
  return (Number.isInteger(n) ? n.toLocaleString("fr-FR") : n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })).replace(/[  ]/g, " ");
};

/** « Rapport du contrat » : identification, période, rapports disponibles et totaux. */
export function ContractReportPdf({ company, contract, summary, generatedBy }: { company: string; contract: Contract; summary: ContractSummary | null; generatedBy: string }) {
  const { t } = usePdf();
  const p = contractPeriod(contract);
  const s = summary ?? ({} as ContractSummary);
  const dh = t("DH");
  const range = s.pointage_premier ? t("du {from} au {to}", { from: formatDateFr(String(s.pointage_premier)), to: formatDateFr(String(s.pointage_dernier)) }) : "—";
  const full = t("du {from} au {to}", { from: formatDateFr(p.from), to: formatDateFr(p.to) });
  const rows = [
    { c: t("Pointage quotidien"), n: t("{days} jour(s), {rows} ligne(s)", { days: fmt(s.pointage_jours), rows: fmt(s.pointage_lignes) }), p: range },
    { c: t("Journées clôturées"), n: fmt(s.journees_cloturees), p: full },
    { c: t("Heures supplémentaires"), n: `${fmt(s.heures_sup)} h`, p: full },
    { c: t("Absences (jours)"), n: fmt(s.absences), p: full },
    { c: t("Rapports de nettoiement"), n: fmt(s.rapports_nettoiement), p: full },
    { c: t("Rapports de collecte"), n: fmt(s.rapports_collecte), p: full },
    { c: t("Rapport camions"), n: t("{rows} ligne(s) · {tons} t · {dumps} vidage(s)", { rows: fmt(s.rapports_camions), tons: fmt(s.tonnage), dumps: fmt(s.vidages) }), p: full },
    { c: t("Carburant"), n: t("{count} plein(s) · {liters} L · {cost}", { count: fmt(s.pleins), liters: fmt(s.carburant_litres), cost: formatMoney(num(s.carburant_cout), dh) }), p: full },
    { c: t("Réparations de camions"), n: `${fmt(s.reparations)} · ${formatMoney(num(s.reparations_cout), dh)}`, p: full },
    { c: t("Achats"), n: `${fmt(s.achats)} · ${formatMoney(num(s.achats_total), dh)}`, p: full },
    { c: t("Déchet vert"), n: fmt(s.dechet_vert), p: full },
    { c: t("Programme de travail"), n: fmt(s.taches), p: full },
    { c: t("Avertissements"), n: fmt(s.avertissements), p: full },
    { c: t("Congés acceptés"), n: fmt(s.conges_acceptes), p: full },
    { c: t("Certificats médicaux"), n: fmt(s.certificats), p: full },
    { c: t("Photos et pièces jointes"), n: fmt(s.photos), p: full },
  ];
  return (
    <PdfDocument title={`${t("Rapport du contrat")} ${contract.reference}`} company={company} generatedBy={generatedBy}>
      <PdfHeader company={company} title={t("Rapport du contrat")} subtitle={contract.reference} />
      <View style={styles.metaRow}>
        <View style={styles.metaBox}>
          <Text>
            {t("Référence du contrat")} : {contract.reference}
          </Text>
          <Text>
            {t("Statut du contrat")} : {t(CONTRACT_STATUS_LABELS[contract.status])}
          </Text>
        </View>
        <View style={styles.metaBox}>
          <Text>
            {t("Date de début du contrat")} : {formatDateFr(contract.start_date)}
          </Text>
          <Text>
            {t("Date de fin du contrat")} : {formatDateFr(contract.end_date)}
          </Text>
          <Text>
            {t("Date de clôture")} : {contract.closed_on ? formatDateFr(contract.closed_on) : "—"}
          </Text>
        </View>
      </View>
      {contract.description ? (
        <Text style={{ marginBottom: 6 }}>
          {t("Objet du contrat")} : {contract.description}
        </Text>
      ) : null}
      {contract.closure_note ? (
        <Text style={{ marginBottom: 6 }}>
          {t("Note de clôture")} : {contract.closure_note}
        </Text>
      ) : null}
      <Text style={styles.section}>{t("Rapports et données du contrat")}</Text>
      <PdfTable
        columns={[
          { key: "c", label: "Catégorie", width: 32 },
          { key: "n", label: "Contenu", width: 40 },
          { key: "p", label: "Période", width: 28 },
        ]}
        rows={rows}
      />
      <Text style={[styles.small, { marginTop: 6 }]}>
        {t("Les enregistrements appartiennent au contrat dont la période contient leur date ({period}). L'ensemble des rapports et documents est disponible avec « Télécharger tous les rapports ».", { period: full })}
      </Text>
    </PdfDocument>
  );
}
