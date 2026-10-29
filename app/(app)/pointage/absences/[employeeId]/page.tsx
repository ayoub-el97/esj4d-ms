import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getAbsenceSummary, getEmployeeAbsences } from "@/lib/data/absences";
import { employeeName, getEmployees } from "@/lib/data/employees";
import { formatDateFr, formatDateTimeFr } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/config";
import {
  ABSENCE_ALERT_LABELS,
  ABSENCE_ALERT_STYLES,
  ABSENCE_CLASS_LABELS,
  ABSENCE_CLASS_STYLES,
  CERTIFICATE_STATE_LABELS,
  CERTIFICATE_STATE_STYLES,
  certificateState,
  ENGAGEMENT_STATUS_LABELS,
  absenceEpisodes,
  type AbsenceClass,
} from "@/lib/absence-types";
import { ATTENDANCE_STATUS_LABELS, POSITION_LABELS, TEAM_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/module-header";
import { PdfExportButton } from "@/components/pdf-export-button";
import { PhotoUploader } from "@/components/photo-uploader";
import { CertificateDocuments } from "@/components/certificate-documents";
import { FileHeart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CertificateActions, CertificateForm, CertificateStateSelect, ClassificationEditor, DecisionForm, EngagementForm } from "../absences-ui";

export const generateMetadata = pageTitle("Historique des absences");

const AUDIT_TABLES: Record<string, string> = {
  absence_reviews: "Classement d'une absence",
  medical_certificates: "Certificat médical",
  absence_actions: "Engagement / décision",
};
const AUDIT_ACTIONS: Record<string, string> = { INSERT: "création", UPDATE: "modification", DELETE: "suppression" };

function auditLine(t: TFunction, h: { tbl: string; action: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }) {
  const d = h.new_data ?? h.old_data ?? {};
  const what = t(AUDIT_TABLES[h.tbl] ?? h.tbl);
  const detail =
    h.tbl === "absence_reviews"
      ? `${formatDateFr(String(d.activity_date))} → ${h.action === "DELETE" ? t("selon le pointage") : t(ABSENCE_CLASS_LABELS[d.classification as AbsenceClass] ?? String(d.classification))}${d.comment ? ` (${d.comment})` : ""}`
      : h.tbl === "medical_certificates"
        ? `${formatDateFr(String(d.start_date))} → ${formatDateFr(String(d.end_date))} · ${t(CERTIFICATE_STATE_LABELS[certificateState(d.status as "recu", d.verification as "acceptee")] ?? String(d.status))}${d.submitted_on ? ` · ${t("remis le {date}", { date: formatDateFr(String(d.submitted_on)) })}` : ""}`
        : d.kind === "decision"
          ? `${t("Décision")} : ${d.decision} (${formatDateFr(String(d.decision_date))})`
          : `${t("Engagement écrit")} : ${t(ENGAGEMENT_STATUS_LABELS[d.status as "signe"] ?? String(d.status))}`;
  return `${what} — ${t(AUDIT_ACTIONS[h.action] ?? h.action)} : ${detail}`;
}

export default async function EmployeeAbsencesPage({ params, searchParams }: { params: Promise<{ employeeId: string }>; searchParams: Promise<{ date?: string }> }) {
  const [user, t] = await Promise.all([requireModule("pointage"), getT()]);
  const { employeeId } = await params;
  // Lien depuis le pointage (« Certificat médical ») : certificat de cette date mis en avant
  const focusDate = (await searchParams).date;
  const employee = (await getEmployees()).find((e) => e.id === employeeId);
  if (!employee) notFound();
  const canEdit = user.permissions.pointage.can_edit;
  const [{ days, certificates, actions, audit }, summary] = await Promise.all([getEmployeeAbsences(employeeId, canEdit), getAbsenceSummary()]);
  const s = summary.find((r) => r.employee.id === employeeId);
  const unjustified = s?.unjustified_all ?? 0;
  const engagement = actions.find((a) => a.kind === "engagement") ?? null;
  const decisions = actions.filter((a) => a.kind === "decision");
  const episodes = absenceEpisodes(days);
  const lastSick = episodes.find((e) => e.classification === "maladie");
  const certById = new Map(certificates.map((c) => [c.id, c]));
  const alert = s?.alert ?? "aucune";

  return (
    <div className="mx-auto max-w-6xl">
      <ModuleHeader
        title={t("Absences — {name}", { name: employeeName(employee) })}
        subtitle={`${t(POSITION_LABELS[employee.position])} · ${t(TEAM_LABELS[employee.team_type])}${employee.matricule ? ` · ${t("Matricule")} ${employee.matricule}` : ""}`}
        backHref="/pointage/absences"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: t("Absences non justifiées"), value: s?.non_justifiee ?? 0, cls: "text-red-700 dark:text-red-400" },
          { label: t("Absences maladie"), value: s?.maladie ?? 0, cls: "text-orange-700 dark:text-orange-400" },
          { label: t("Total des absences"), value: s?.total ?? 0, cls: "" },
          { label: t("Certificats médicaux remis"), value: s?.certificates ?? 0, cls: "" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className={cn("mt-1 text-xl font-semibold tabular-nums", k.cls)}>{k.value}</p>
          </div>
        ))}
      </div>

      {alert !== "aucune" && (
        <div className={cn("mb-4 flex items-start gap-2 rounded-xl p-3 text-sm font-medium", ABSENCE_ALERT_STYLES[alert])}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {t(ABSENCE_ALERT_LABELS[alert])} — {t("{count} absence(s) non justifiée(s) au total", { count: unjustified })}
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("Historique des absences")}</CardTitle>
              <CardDescription>{t("Jours consécutifs regroupés. Le classement suit le pointage ; un utilisateur autorisé peut le corriger (motif conservé dans le journal).")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {episodes.length === 0 && <p className="text-sm text-muted-foreground">{t("Aucune absence enregistrée au pointage.")}</p>}
              {episodes.map((ep) => {
                const cert = ep.days.map((d) => (d.certificate_id ? certById.get(d.certificate_id) : undefined)).find(Boolean);
                return (
                  <div key={ep.from} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{ep.from === ep.to ? formatDateFr(ep.from) : t("du {from} au {to}", { from: formatDateFr(ep.from), to: formatDateFr(ep.to) })}</span>
                      <span className="text-xs text-muted-foreground">{t("{count} jour(s)", { count: ep.days.length })}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", ABSENCE_CLASS_STYLES[ep.classification])}>{t(ABSENCE_CLASS_LABELS[ep.classification])}</span>
                      {cert && (
                        <a href={`#cert-${cert.id}`} className="inline-flex flex-wrap items-center gap-1 text-xs hover:underline">
                          <span className={cn("rounded-full px-2 py-0.5 font-medium", CERTIFICATE_STATE_STYLES[certificateState(cert.status, cert.verification)])}>{t(CERTIFICATE_STATE_LABELS[certificateState(cert.status, cert.verification)])}</span>
                          {cert.submitted_on && <span className="text-muted-foreground">{t("remis le {date}", { date: formatDateFr(cert.submitted_on) })}</span>}
                          {canEdit && <span className="text-primary">{cert.photos.length ? t("Voir le certificat") : t("Ajouter le certificat")}</span>}
                        </a>
                      )}
                      {ep.classification === "maladie" && !cert && <span className="text-xs font-medium text-orange-700">{t("En attente de certificat")}</span>}
                    </div>
                    <ul className="mt-2 space-y-1">
                      {ep.days.map((d) => (
                        <li key={d.activity_date} className="flex flex-wrap items-start gap-2 text-xs">
                          <span className="w-20 tabular-nums">{formatDateFr(d.activity_date)}</span>
                          <span className="text-muted-foreground">
                            {t("Pointage : {status}", { status: t(ATTENDANCE_STATUS_LABELS[d.attendance_status]) })}
                            {d.reviewed && ` · ${t("classement corrigé")}${d.review_comment ? ` : ${d.review_comment}` : ""}`}
                            {d.observation && ` · ${d.observation}`}
                          </span>
                          {canEdit && <ClassificationEditor day={d} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card id="certificats" className="scroll-mt-20">
            <CardHeader>
              <CardTitle>{t("Certificats médicaux")}</CardTitle>
              <CardDescription>{t("Le certificat peut être remis plus tard : sa date de remise est enregistrée à part des dates d'absence. Documents privés (utilisateurs autorisés).")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {certificates.length === 0 && <p className="text-sm text-muted-foreground">{t("Aucun certificat médical.")}</p>}
              {certificates.map((c) => {
                const state = certificateState(c.status, c.verification);
                const focused = !!focusDate && focusDate >= c.start_date && focusDate <= c.end_date;
                return (
                <div key={c.id} id={`cert-${c.id}`} className={cn("scroll-mt-20 space-y-2 rounded-lg border p-3 text-sm", focused && "ring-2 ring-primary")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <FileHeart className="size-4 text-muted-foreground" />
                    <span className="font-semibold">{c.start_date === c.end_date ? formatDateFr(c.start_date) : t("du {from} au {to}", { from: formatDateFr(c.start_date), to: formatDateFr(c.end_date) })}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", CERTIFICATE_STATE_STYLES[state])}>{t(CERTIFICATE_STATE_LABELS[state])}</span>
                    <span className="text-xs text-muted-foreground">{c.submitted_on ? t("remis le {date}", { date: formatDateFr(c.submitted_on) }) : t("pas encore remis")}</span>
                    {c.auto_created && <span className="text-xs text-muted-foreground">· {t("créé depuis le pointage « Absent maladie »")}</span>}
                    {canEdit && <span className="ms-auto"><CertificateStateSelect certificate={c} /></span>}
                  </div>
                  {c.comment && <p className="text-xs">{c.comment}</p>}
                  {canEdit ? (
                    <>
                      <CertificateDocuments certificateId={c.id} employeeId={employeeId} startDate={c.start_date} files={c.photos} canEdit={canEdit} fileLabel={`certificat-${employeeName(employee).replace(/[^\p{L}\d]+/gu, "-")}-${c.start_date}`} />
                      <CertificateActions certificate={c} employeeId={employeeId} />
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("Document réservé aux utilisateurs autorisés.")}</p>
                  )}
                </div>
                );
              })}
              {canEdit && (
                <details className="rounded-lg border p-3" open={certificates.length === 0 && !!lastSick}>
                  <summary className="cursor-pointer text-sm font-medium">{t("Ajouter un certificat médical")}</summary>
                  <div className="mt-2">
                    <CertificateForm employeeId={employeeId} defaultFrom={lastSick?.from} defaultTo={lastSick?.to} />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("Engagement écrit relatif aux absences")}</CardTitle>
              <CardDescription>
                {unjustified >= 2 ? t("Requis dès la deuxième absence non justifiée.") : t("Pas encore requis (moins de deux absences non justifiées).")}
                {engagement && ` ${t("Statut : {status}", { status: t(ENGAGEMENT_STATUS_LABELS[engagement.status ?? "a_preparer"]) })}${engagement.signed_on ? ` — ${t("signé le {date}", { date: formatDateFr(engagement.signed_on) })}` : ""}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(unjustified >= 2 || engagement) && <PdfExportButton kind="engagement-absences" params={{ employee: employeeId }} label="Générer l'engagement écrit (PDF)" />}
              {canEdit && (unjustified >= 2 || engagement) && <EngagementForm employeeId={employeeId} engagement={engagement} unjustifiedCount={unjustified} />}
              {canEdit && engagement && (
                <PhotoUploader entityType="absence_action" entityId={engagement.id} phase="document" activityDate={null} employeeId={employeeId} photos={engagement.photos} canEdit={canEdit} title={t("Engagement signé (scan ou photo)")} />
              )}
              {canEdit && !engagement && unjustified >= 2 && <p className="text-xs text-muted-foreground">{t("Enregistrez d'abord le statut pour pouvoir joindre le document signé.")}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("Décisions du responsable")}</CardTitle>
              <CardDescription>{unjustified > 4 ? t("Plus de quatre absences non justifiées : décision du responsable requise.") : t("Requise au-delà de quatre absences non justifiées.")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {decisions.length === 0 && <p className="text-sm text-muted-foreground">{t("Aucune décision enregistrée.")}</p>}
              {decisions.map((d) => (
                <div key={d.id} className="rounded-lg border p-2 text-sm">
                  <div className="font-medium">{d.decision}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("Le {date} · à {count} absence(s) non justifiée(s)", { date: formatDateFr(d.decision_date ?? d.created_at.slice(0, 10)), count: d.unjustified_count })}
                    {d.comment ? ` · ${d.comment}` : ""}
                  </div>
                </div>
              ))}
              {canEdit && unjustified > 4 && <DecisionForm employeeId={employeeId} unjustifiedCount={unjustified} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("Journal des modifications")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-xs">
                {audit.length === 0 && <li className="text-muted-foreground">{t("Aucune modification enregistrée.")}</li>}
                {audit.map((h, i) => (
                  <li key={i} className="border-s-2 border-primary/30 ps-2">
                    <div>{auditLine(t, h)}</div>
                    <div className="text-muted-foreground">
                      {formatDateTimeFr(h.at)} · {h.user_email ?? t("utilisateur inconnu")}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
