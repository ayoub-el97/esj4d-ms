import "server-only";
import type { WhatsAppConfig } from "./config";

/** Appels à l'API officielle WhatsApp Business Cloud (Meta Graph API), côté serveur uniquement. */
// WHATSAPP_GRAPH_URL : uniquement pour les tests automatiques (faux serveur Meta local)
const GRAPH = process.env.WHATSAPP_GRAPH_URL || "https://graph.facebook.com";

export type GraphError = { message: string; code?: number; details?: string };
export type GraphResult<T> = { ok: true; data: T } | { ok: false; error: GraphError };

async function graph<T>(c: WhatsAppConfig, path: string, init: RequestInit = {}): Promise<GraphResult<T>> {
  try {
    const res = await fetch(`${GRAPH}/${c.api_version}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${c.access_token}`, ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_data?: { details?: string } } } & T;
    if (!res.ok || json.error) return { ok: false, error: { message: json.error?.message ?? `HTTP ${res.status}`, code: json.error?.code, details: json.error?.error_data?.details } };
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: { message: (e as Error).message || "Réseau indisponible" } };
  }
}

/** Téléverse le PDF sur les serveurs WhatsApp (aucun lien public vers le rapport). */
export async function uploadPdf(c: WhatsAppConfig, pdf: Buffer, filename: string): Promise<GraphResult<{ id: string }>> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), filename);
  return graph<{ id: string }>(c, `${c.phone_number_id}/media`, { method: "POST", body: form });
}

export type Recipient = { kind: "individual" | "group"; to: string };

type SendOk = { messages?: { id: string }[] };

function send(c: WhatsAppConfig, r: Recipient, payload: Record<string, unknown>) {
  return graph<SendOk>(c, `${c.phone_number_id}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: r.kind, to: r.to, ...payload }),
  });
}

/** Message dans la fenêtre de 24 h : document avec légende, ou texte seul. */
export function sendSession(c: WhatsAppConfig, r: Recipient, text: string, doc?: { id: string; filename: string }) {
  if (doc) return send(c, r, { type: "document", document: { id: doc.id, filename: doc.filename, caption: text.slice(0, 1024) } });
  return send(c, r, { type: "text", text: { preview_url: false, body: text.slice(0, 4096) } });
}

/**
 * Modèle approuvé (envoi possible à tout moment) : en-tête Document (si PDF joint)
 * et corps à 2 variables — {{1}} = titre du rapport, {{2}} = message / résumé.
 */
export function sendTemplate(c: WhatsAppConfig, r: Recipient, params: [string, string], doc?: { id: string; filename: string }) {
  const components: Record<string, unknown>[] = [];
  if (doc) components.push({ type: "header", parameters: [{ type: "document", document: { id: doc.id, filename: doc.filename } }] });
  components.push({ type: "body", parameters: params.map((text) => ({ type: "text", text })) });
  return send(c, r, { type: "template", template: { name: c.template_name, language: { code: c.template_lang || "fr" }, components } });
}

/** État du numéro WhatsApp Business (test de connexion). */
export function phoneInfo(c: WhatsAppConfig) {
  return graph<{ display_phone_number?: string; verified_name?: string; quality_rating?: string; code_verification_status?: string }>(
    c,
    `${c.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`,
  );
}

// ---------- Groupes (API Groups : compte professionnel officiel « OBA » requis) ----------
export function listGroups(c: WhatsAppConfig) {
  return graph<{ data?: { groups?: { id: string; subject: string; created_at?: string }[] } }>(c, `${c.phone_number_id}/groups?limit=100`);
}
export function createGroup(c: WhatsAppConfig, subject: string, description: string) {
  return graph<Record<string, unknown>>(c, `${c.phone_number_id}/groups`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", subject: subject.slice(0, 128), description: description.slice(0, 2048), join_approval_mode: "approval_required" }),
  });
}
export function groupInviteLink(c: WhatsAppConfig, groupId: string) {
  return graph<{ invite_link?: string }>(c, `${groupId}/invite_link`);
}

/** Message d'erreur en français à partir du code de l'API (les autres erreurs sont reprises telles quelles). */
export function explainError(e: GraphError): string {
  switch (e.code) {
    case 131047:
      return "Fenêtre de 24 h fermée : le destinataire n'a pas écrit au numéro de l'entreprise depuis plus de 24 h. Utilisez le mode « Modèle approuvé » (ou demandez-lui d'envoyer un message au numéro de l'entreprise).";
    case 131030:
      return "Numéro non autorisé : avec un numéro de test Meta, ajoutez d'abord ce destinataire à la liste des numéros autorisés (WhatsApp Manager › Configuration de l'API).";
    case 132000:
      return "Le modèle approuvé n'a pas le bon nombre de variables : il doit en avoir 2 dans le corps ({{1}} titre, {{2}} message).";
    case 132001:
      return "Modèle introuvable : vérifiez le nom et la langue du modèle approuvé dans WhatsApp Manager.";
    case 132012:
      return "Format du modèle non respecté : le modèle doit avoir un en-tête « Document » si le PDF est joint, ou aucun en-tête sinon.";
    case 190:
      return "Jeton d'accès invalide ou expiré : générez un jeton permanent (utilisateur système) dans Meta Business Manager.";
    case 131026:
      return "Message non remis : le numéro n'a pas WhatsApp ou n'a pas accepté les conditions récentes de WhatsApp.";
    case 131056:
      return "Trop de messages envoyés à ce destinataire en peu de temps : réessayez dans quelques minutes.";
    case 368:
    case 131031:
      return "Compte WhatsApp Business restreint ou bloqué par Meta : vérifiez l'état du compte dans WhatsApp Manager.";
    default:
      return `${e.message}${e.details ? ` — ${e.details}` : ""}${e.code ? ` (code ${e.code})` : ""}`;
  }
}
