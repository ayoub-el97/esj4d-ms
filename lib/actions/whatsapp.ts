"use server";

import { createHash } from "node:crypto";
import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { getOptionalUser, hasPermission } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { getT } from "@/lib/i18n/server";
import { buildPdf, renderPdf } from "@/lib/pdf/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { explainError, createGroup, groupInviteLink, listGroups, phoneInfo, sendSession, sendTemplate, uploadPdf, type Recipient } from "@/lib/whatsapp/api";
import { missingConfig, publicView, readWhatsAppConfig, type WhatsAppConfig, type WhatsAppPublicConfig } from "@/lib/whatsapp/config";
import { maskNumber, normalizeWhatsAppNumber, templateParam } from "@/lib/whatsapp/phone";
import { buildMessage, reportSummaryLines } from "@/lib/whatsapp/summary";
import type { ActionResult, CurrentUser } from "@/lib/types";

export type WaStatus = "envoi_en_cours" | "envoye" | "remis" | "lu" | "echec";
export type WaRecipientOption = { key: string; label: string; hint: string };
export type WaLogRow = { id: string; report_title: string; recipient_label: string; recipient: string; status: WaStatus; error: string; created_at: string; status_at: string | null; with_pdf: boolean; sender: string; retryable: boolean };

const DUPLICATE_MINUTES = 10;

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------
async function sender(): Promise<{ user: CurrentUser } | { error: string }> {
  const t = await getT();
  const user = await getOptionalUser();
  if (!user) return { error: t("Session expirée : reconnectez-vous.") };
  if (!hasPermission(user, "whatsapp", "edit")) return { error: t("Vous n'avez pas le droit d'envoyer des rapports par WhatsApp (Paramètres › Permissions › Envoi WhatsApp).") };
  return { user };
}

const stableParams = (p: Record<string, string>) => JSON.stringify(Object.keys(p).sort().map((k) => [k, p[k]]));
const dedupeKey = (kind: string, params: Record<string, string>, to: string) => createHash("sha256").update(`${kind}|${stableParams(params)}|${to}`).digest("hex");

type Target = { kind: "directeur" | "destinataire" | "groupe" | "test"; label: string; recipient: Recipient };

function recipientOptions(c: WhatsAppConfig, t: (k: string, v?: Record<string, string | number>) => string): WaRecipientOption[] {
  const out: WaRecipientOption[] = [];
  if (c.manager_number) out.push({ key: "directeur", label: c.manager_name ? t("Directeur — {name}", { name: c.manager_name }) : t("Directeur"), hint: maskNumber(c.manager_number) });
  c.extra_recipients.forEach((r, i) => out.push({ key: `extra:${i}`, label: r.name || t("Destinataire {n}", { n: i + 1 }), hint: maskNumber(r.number) }));
  if (c.manager_number && c.extra_recipients.length) out.push({ key: "tous", label: t("Directeur et destinataires supplémentaires"), hint: t("{count} numéros", { count: c.extra_recipients.length + 1 }) });
  if (c.group_enabled && c.group_id) out.push({ key: "groupe", label: t("Groupe de gestion — {name}", { name: c.group_subject || c.group_id }), hint: t("groupe WhatsApp") });
  return out;
}

function resolveTargets(c: WhatsAppConfig, key: string): Target[] {
  const direct = (number: string, label: string, kind: Target["kind"]): Target | null => {
    const n = normalizeWhatsAppNumber(number);
    return n.ok ? { kind, label, recipient: { kind: "individual", to: n.number } } : null;
  };
  const manager = direct(c.manager_number, c.manager_name || "Directeur", "directeur");
  const extras = c.extra_recipients.map((r, i) => direct(r.number, r.name || `Destinataire ${i + 1}`, "destinataire"));
  if (key === "directeur") return manager ? [manager] : [];
  if (key === "tous") return [manager, ...extras].filter((x): x is Target => !!x);
  if (key.startsWith("extra:")) {
    const x = extras[Number(key.slice(6))];
    return x ? [x] : [];
  }
  if (key === "groupe" && c.group_enabled && c.group_id) return [{ kind: "groupe", label: c.group_subject || "Groupe de gestion", recipient: { kind: "group", to: c.group_id } }];
  return [];
}

/** Envoi effectif d'un message (journalisé). Le PDF déjà téléversé peut être réutilisé. */
async function deliver(opts: {
  c: WhatsAppConfig;
  user: CurrentUser;
  target: Target;
  kind: string;
  params: Record<string, string>;
  title: string;
  message: string;
  doc?: { id: string; filename: string };
  retryOf?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string; id?: string }> {
  const admin = createAdminClient();
  const key = dedupeKey(opts.kind, opts.params, opts.target.recipient.to);
  // Envoi interrompu (serveur coupé) : libère le verrou au bout de 5 minutes
  await admin.from("whatsapp_messages").update({ status: "echec", error: "Envoi interrompu (aucune réponse du serveur).", updated_at: new Date().toISOString() }).eq("dedupe_key", key).eq("status", "envoi_en_cours").lt("created_at", new Date(Date.now() - 5 * 60000).toISOString());
  const { data: row, error: insErr } = await admin
    .from("whatsapp_messages")
    .insert({
      report_kind: opts.kind,
      report_params: opts.params,
      report_title: opts.title,
      recipient_kind: opts.target.kind,
      recipient_label: opts.target.label,
      recipient: opts.target.recipient.to,
      message_text: opts.message,
      with_pdf: !!opts.doc,
      send_mode: opts.c.send_mode,
      dedupe_key: key,
      retry_of: opts.retryOf ?? null,
      created_by: opts.user.id,
    })
    .select("id")
    .single();
  if (insErr) return { ok: false, error: insErr.message.includes("whatsapp_messages_inflight_uniq") ? "Un envoi de ce rapport à ce destinataire est déjà en cours." : insErr.message };

  const r =
    opts.c.send_mode === "modele"
      ? await sendTemplate(opts.c, opts.target.recipient, [templateParam(opts.title, 200), templateParam(opts.message)], opts.doc)
      : await sendSession(opts.c, opts.target.recipient, opts.message, opts.doc);
  const now = new Date().toISOString();
  if (!r.ok) {
    const error = explainError(r.error);
    await admin.from("whatsapp_messages").update({ status: "echec", error, updated_at: now, status_at: now }).eq("id", row.id);
    return { ok: false, error, id: row.id };
  }
  await admin.from("whatsapp_messages").update({ status: "envoye", wa_message_id: r.data.messages?.[0]?.id ?? null, updated_at: now, status_at: now }).eq("id", row.id);
  return { ok: true, id: row.id };
}

// ---------------------------------------------------------------------------
// Envoi d'un rapport
// ---------------------------------------------------------------------------
export type WaPreview = {
  configured: boolean;
  missing: string[];
  isAdmin: boolean;
  title: string;
  message: string;
  withPdf: boolean;
  mode: "modele" | "session";
  recipients: WaRecipientOption[];
  recent: { id: string; recipient_label: string; status: WaStatus; created_at: string; error: string }[];
};

/** Prépare la boîte d'envoi : rapport exact, destinataires, message proposé (valeurs réelles), derniers envois. */
export async function getWhatsAppPreview(kind: string, params: Record<string, string>): Promise<ActionResult<WaPreview>> {
  const t = await getT();
  const auth = await sender();
  if ("error" in auth) return { ok: false, error: auth.error };
  const built = await buildPdf(kind, params);
  if (!built) return { ok: false, error: t("Type de document inconnu.") };
  if (!hasPermission(auth.user, built.module, "view")) return { ok: false, error: t("Accès refusé.") };
  const [c, settings] = await Promise.all([readWhatsAppConfig(), getSettings()]);
  const missing = missingConfig(c);
  const lines = await reportSummaryLines(kind, params);
  let recent: WaPreview["recent"] = [];
  try {
    const { data } = await createAdminClient()
      .from("whatsapp_messages")
      .select("id, recipient_label, status, created_at, error, report_params")
      .eq("report_kind", kind)
      .order("created_at", { ascending: false })
      .limit(30);
    recent = (data ?? []).filter((m) => stableParams(m.report_params as Record<string, string>) === stableParams(params)).slice(0, 5) as WaPreview["recent"];
  } catch {
    recent = [];
  }
  return {
    ok: true,
    data: {
      configured: missing.length === 0,
      missing: missing.map((m) => t(m)),
      isAdmin: auth.user.role === "admin",
      title: built.title,
      message: buildMessage({ title: built.title, company: settings.company_name, lines, defaultMessage: c.default_message, withPdf: c.attach_pdf }),
      withPdf: c.attach_pdf,
      mode: c.send_mode,
      recipients: recipientOptions(c, t),
      recent,
    },
  };
}

/** Envoie le rapport (PDF généré à l'instant) au destinataire choisi. Doublon récent : confirmation requise. */
export async function sendWhatsAppReport(input: { kind: string; params: Record<string, string>; recipient?: string; message?: string; force?: boolean }): Promise<ActionResult<{ ids: string[] }> & { duplicate?: string; missingConfig?: boolean }> {
  const t = await getT();
  const auth = await sender();
  if ("error" in auth) return { ok: false, error: auth.error };
  const built = await buildPdf(input.kind, input.params);
  if (!built) return { ok: false, error: t("Type de document inconnu.") };
  if (!hasPermission(auth.user, built.module, "view")) return { ok: false, error: t("Accès refusé.") };
  const c = await readWhatsAppConfig();
  const missing = missingConfig(c);
  if (missing.length) return { ok: false, missingConfig: true, error: t("Configuration WhatsApp manquante : {list}", { list: missing.map((m) => t(m)).join(" ; ") }) };
  const targets = resolveTargets(c, input.recipient || "directeur");
  if (!targets.length) return { ok: false, error: t("Destinataire non configuré ou numéro invalide : vérifiez la Configuration WhatsApp.") };

  // Doublon accidentel : même rapport, même destinataire, il y a moins de 10 minutes
  if (!input.force) {
    const admin = createAdminClient();
    const since = new Date(Date.now() - DUPLICATE_MINUTES * 60000).toISOString();
    const keys = targets.map((x) => dedupeKey(input.kind, input.params, x.recipient.to));
    const { data: dup } = await admin.from("whatsapp_messages").select("created_at, recipient_label").in("dedupe_key", keys).in("status", ["envoi_en_cours", "envoye", "remis", "lu"]).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
    if (dup?.length) {
      const mins = Math.max(1, Math.round((Date.now() - Date.parse(dup[0].created_at)) / 60000));
      return { ok: false, duplicate: t("Ce rapport a déjà été envoyé à {name} il y a {min} min. L'envoyer à nouveau ?", { name: dup[0].recipient_label, min: mins }), error: t("Envoi déjà effectué récemment.") };
    }
  }

  const settings = await getSettings();
  const message = (input.message ?? "").trim() || buildMessage({ title: built.title, company: settings.company_name, lines: await reportSummaryLines(input.kind, input.params), defaultMessage: c.default_message, withPdf: c.attach_pdf });
  let doc: { id: string; filename: string } | undefined;
  if (c.attach_pdf) {
    let pdf: Buffer;
    try {
      pdf = await renderPdf(built);
    } catch {
      return { ok: false, error: t("Le PDF n'a pas pu être généré : envoi annulé.") };
    }
    const up = await uploadPdf(c, pdf, built.filename);
    if (!up.ok) {
      // Échec avant tout envoi : journalisé pour pouvoir réessayer
      for (const target of targets) {
        await createAdminClient().from("whatsapp_messages").insert({ report_kind: input.kind, report_params: input.params, report_title: built.title, recipient_kind: target.kind, recipient_label: target.label, recipient: target.recipient.to, message_text: message, with_pdf: true, send_mode: c.send_mode, dedupe_key: dedupeKey(input.kind, input.params, target.recipient.to), status: "echec", error: `PDF non transmis à WhatsApp : ${explainError(up.error)}`, created_by: auth.user.id, status_at: new Date().toISOString() });
      }
      revalidatePath("/parametres/whatsapp");
      return { ok: false, error: t("Échec de l'envoi : le PDF n'a pas pu être transmis à WhatsApp ({reason}).", { reason: explainError(up.error) }) };
    }
    doc = { id: up.data.id, filename: built.filename };
  }

  const results = [];
  for (const target of targets) results.push({ target, r: await deliver({ c, user: auth.user, target, kind: input.kind, params: input.params, title: built.title, message, doc }) });
  revalidatePath("/parametres/whatsapp");
  const ok = results.filter((x) => x.r.ok);
  const ko = results.filter((x) => !x.r.ok);
  const ids = results.map((x) => x.r.id).filter((x): x is string => !!x);
  if (!ko.length) return { ok: true, data: { ids }, message: t("Envoyé : accepté par WhatsApp pour {list}. La remise est confirmée dès que WhatsApp la signale.", { list: ok.map((x) => x.target.label).join(", ") }) };
  return { ok: false, error: t("Échec de l'envoi pour {list} : {reason}", { list: ko.map((x) => x.target.label).join(", "), reason: (ko[0].r as { error: string }).error }) + (ok.length ? ` ${t("Envoyé à : {list}.", { list: ok.map((x) => x.target.label).join(", ") })}` : "") };
}

/** Statuts à jour (remis / lu grâce au webhook) pour l'affichage après l'envoi. */
export async function getWhatsAppStatuses(ids: string[]): Promise<{ id: string; status: WaStatus; error: string }[]> {
  const auth = await sender();
  if ("error" in auth || !ids.length) return [];
  const { data } = await createAdminClient().from("whatsapp_messages").select("id, status, error, created_by").in("id", ids.slice(0, 20));
  return (data ?? []).filter((m) => auth.user.role === "admin" || m.created_by === auth.user.id).map((m) => ({ id: m.id, status: m.status as WaStatus, error: m.error }));
}

/** Nouvelle tentative d'un envoi en échec (même rapport, même destinataire, PDF régénéré). */
export async function retryWhatsApp(id: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await sender();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { data: m } = await createAdminClient().from("whatsapp_messages").select("*").eq("id", id).maybeSingle();
  if (!m || (auth.user.role !== "admin" && m.created_by !== auth.user.id)) return { ok: false, error: t("Envoi introuvable.") };
  if (m.status !== "echec") return { ok: false, error: t("Seul un envoi en échec peut être relancé.") };
  if (m.recipient_kind === "test") return sendWhatsAppTest();
  const c = await readWhatsAppConfig();
  const target: Target = { kind: m.recipient_kind, label: m.recipient_label, recipient: { kind: m.recipient_kind === "groupe" ? "group" : "individual", to: m.recipient } };
  const built = await buildPdf(m.report_kind, m.report_params);
  if (!built || !hasPermission(auth.user, built.module, "view")) return { ok: false, error: t("Accès refusé.") };
  let doc: { id: string; filename: string } | undefined;
  if (m.with_pdf) {
    const up = await uploadPdf(c, await renderPdf(built), built.filename);
    if (!up.ok) return { ok: false, error: explainError(up.error) };
    doc = { id: up.data.id, filename: built.filename };
  }
  const r = await deliver({ c, user: auth.user, target, kind: m.report_kind, params: m.report_params, title: m.report_title, message: m.message_text, doc, retryOf: m.id });
  revalidatePath("/parametres/whatsapp");
  return r.ok ? { ok: true, message: t("Nouvel envoi accepté par WhatsApp.") } : { ok: false, error: r.error };
}

// ---------------------------------------------------------------------------
// Configuration (administrateur)
// ---------------------------------------------------------------------------
async function adminOnly(): Promise<{ user: CurrentUser } | { error: string }> {
  const t = await getT();
  const user = await getOptionalUser();
  if (!user || user.role !== "admin") return { error: t("Réservé à l'administrateur.") };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: t("Clé SUPABASE_SERVICE_ROLE_KEY absente du serveur (nécessaire pour lire la configuration).") };
  return { user };
}

export async function getWhatsAppAdminView(): Promise<ActionResult<{ config: WhatsAppPublicConfig; missing: string[]; log: WaLogRow[] }>> {
  const t = await getT();
  const auth = await adminOnly();
  if ("error" in auth) return { ok: false, error: auth.error };
  const c = await readWhatsAppConfig();
  const admin = createAdminClient();
  const { data } = await admin.from("whatsapp_messages").select("id, report_title, recipient_label, recipient, status, error, created_at, status_at, with_pdf, created_by").order("created_at", { ascending: false }).limit(100);
  const ids = [...new Set((data ?? []).map((m) => m.created_by as string))];
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string) || (p.email as string)]));
  return {
    ok: true,
    data: {
      config: publicView(c),
      missing: missingConfig(c).map((m) => t(m)),
      log: (data ?? []).map((m) => ({ ...(m as Omit<WaLogRow, "sender" | "retryable">), recipient: maskNumber(m.recipient), sender: names.get(m.created_by) ?? "", retryable: m.status === "echec" })),
    },
  };
}

export async function saveWhatsAppConfig(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const auth = await adminOnly();
  if ("error" in auth) return { ok: false, error: auth.error };
  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const manager = s("manager_number");
  const update: Record<string, unknown> = {
    api_version: /^v\d+\.\d+$/.test(s("api_version")) ? s("api_version") : "v26.0",
    phone_number_id: s("phone_number_id").replace(/\D/g, ""),
    waba_id: s("waba_id").replace(/\D/g, ""),
    manager_name: s("manager_name").slice(0, 80),
    default_message: s("default_message").slice(0, 900),
    attach_pdf: formData.get("attach_pdf") === "on",
    send_mode: s("send_mode") === "session" ? "session" : "modele",
    template_name: s("template_name").toLowerCase().replace(/[^a-z0-9_]/g, ""),
    template_lang: s("template_lang") || "fr",
    group_enabled: formData.get("group_enabled") === "on",
    updated_at: new Date().toISOString(),
    updated_by: auth.user.id,
  };
  if (manager) {
    const n = normalizeWhatsAppNumber(manager);
    if (!n.ok) return { ok: false, error: `${t("Numéro du directeur")} : ${t(n.error)}` };
    update.manager_number = n.number;
  } else update.manager_number = "";
  // Destinataires supplémentaires : une ligne « Nom ; numéro »
  const extras: { name: string; number: string }[] = [];
  for (const line of s("extra_recipients").split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 10)) {
    const [name, num] = line.includes(";") ? line.split(";").map((x) => x.trim()) : ["", line];
    const n = normalizeWhatsAppNumber(num ?? "");
    if (!n.ok) return { ok: false, error: `${t("Destinataire supplémentaire « {line} »", { line })} : ${t(n.error)}` };
    extras.push({ name: (name ?? "").slice(0, 60), number: n.number });
  }
  update.extra_recipients = extras;
  // Secrets : modifiés seulement s'ils sont saisis (jamais renvoyés au navigateur)
  const changedSecrets: string[] = [];
  for (const k of ["access_token", "app_secret", "verify_token"]) {
    if (formData.get(`clear_${k}`) === "on") {
      update[k] = "";
      changedSecrets.push(k);
    } else if (s(k)) {
      update[k] = s(k);
      changedSecrets.push(k);
    }
  }
  const admin = createAdminClient();
  const { error } = await admin.from("whatsapp_config").upsert({ id: 1, ...update }, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };
  // Journal sans aucun secret
  await admin.from("audit_log").insert({
    table_name: "whatsapp_config",
    record_id: "1",
    action: "UPDATE",
    new_data: { ...Object.fromEntries(Object.entries(update).filter(([k]) => !["access_token", "app_secret", "verify_token"].includes(k))), secrets_modifies: changedSecrets },
    user_id: auth.user.id,
    user_email: auth.user.email,
  });
  revalidatePath("/parametres/whatsapp");
  return { ok: true, message: t("Configuration WhatsApp enregistrée.") };
}

/** Vérifie le numéro WhatsApp Business et le jeton (aucun message envoyé). */
export async function testWhatsAppConnection(): Promise<ActionResult> {
  const t = await getT();
  const auth = await adminOnly();
  if ("error" in auth) return { ok: false, error: auth.error };
  const c = await readWhatsAppConfig();
  if (!c.phone_number_id || !c.access_token) return { ok: false, error: t("Renseignez l'identifiant du numéro et le jeton d'accès.") };
  const r = await phoneInfo(c);
  if (!r.ok) return { ok: false, error: t("Connexion refusée par Meta : {reason}", { reason: explainError(r.error) }) };
  return { ok: true, message: t("Connexion réussie : {name} ({number}), qualité {quality}.", { name: r.data.verified_name ?? "—", number: r.data.display_phone_number ?? "—", quality: r.data.quality_rating ?? "—" }) };
}

/** Message de test au directeur (avec un petit PDF de test si l'envoi de PDF est activé). */
export async function sendWhatsAppTest(): Promise<ActionResult> {
  const t = await getT();
  const auth = await adminOnly();
  if ("error" in auth) return { ok: false, error: auth.error };
  const c = await readWhatsAppConfig();
  const missing = missingConfig(c);
  if (missing.length) return { ok: false, error: t("Configuration WhatsApp manquante : {list}", { list: missing.map((m) => t(m)).join(" ; ") }) };
  const settings = await getSettings();
  const target = resolveTargets(c, "directeur")[0];
  const title = t("Message de test");
  const message = t("Test de l'envoi WhatsApp depuis l'application {company}. Si vous recevez ce message, la configuration fonctionne.", { company: settings.company_name || "" });
  let doc: { id: string; filename: string } | undefined;
  if (c.attach_pdf) {
    const pdf = await renderToBuffer(createElement(Document, null, createElement(Page, { size: "A4", style: { padding: 40 } }, createElement(Text, null, `${title} — ${settings.company_name}`), createElement(Text, null, new Date().toLocaleString("fr-FR")))));
    const up = await uploadPdf(c, pdf, "test-whatsapp.pdf");
    if (!up.ok) return { ok: false, error: t("Échec de l'envoi : le PDF n'a pas pu être transmis à WhatsApp ({reason}).", { reason: explainError(up.error) }) };
    doc = { id: up.data.id, filename: "test-whatsapp.pdf" };
  }
  const r = await deliver({ c, user: auth.user, target: { ...target, kind: "test" }, kind: "test", params: { at: String(Date.now()) }, title, message, doc });
  revalidatePath("/parametres/whatsapp");
  return r.ok ? { ok: true, message: t("Message de test accepté par WhatsApp. Vérifiez sa réception sur le téléphone du directeur.") } : { ok: false, error: r.error };
}

// ---------- Groupe de gestion (compte professionnel officiel requis) ----------
export async function listWhatsAppGroups(): Promise<ActionResult<{ groups: { id: string; subject: string }[] }>> {
  const t = await getT();
  const auth = await adminOnly();
  if ("error" in auth) return { ok: false, error: auth.error };
  const r = await listGroups(await readWhatsAppConfig());
  if (!r.ok) return { ok: false, error: t("Groupes indisponibles pour ce compte : {reason}. L'API Groups de Meta est réservée aux comptes professionnels officiels (OBA, badge bleu).", { reason: explainError(r.error) }) };
  return { ok: true, data: { groups: (r.data.data?.groups ?? []).map((g) => ({ id: g.id, subject: g.subject })) } };
}

export async function createWhatsAppGroup(subject: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await adminOnly();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!subject.trim()) return { ok: false, error: t("Indiquez le nom du groupe.") };
  const r = await createGroup(await readWhatsAppConfig(), subject.trim(), t("Rapports de l'entreprise envoyés depuis l'application de gestion."));
  if (!r.ok) return { ok: false, error: t("Création refusée par Meta : {reason}. L'API Groups est réservée aux comptes professionnels officiels (OBA).", { reason: explainError(r.error) }) };
  return { ok: true, message: t("Groupe créé. Actualisez la liste des groupes, choisissez-le, puis partagez le lien d'invitation au directeur et au superviseur.") };
}

export async function selectWhatsAppGroup(id: string, subject: string): Promise<ActionResult<{ invite: string }>> {
  const t = await getT();
  const auth = await adminOnly();
  if ("error" in auth) return { ok: false, error: auth.error };
  const c = await readWhatsAppConfig();
  const link = await groupInviteLink(c, id);
  const invite = link.ok ? (link.data.invite_link ?? "") : "";
  const { error } = await createAdminClient().from("whatsapp_config").update({ group_id: id, group_subject: subject.slice(0, 128), group_invite_link: invite, updated_at: new Date().toISOString(), updated_by: auth.user.id }).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parametres/whatsapp");
  return { ok: true, data: { invite }, message: invite ? t("Groupe choisi. Envoyez le lien d'invitation aux membres.") : t("Groupe choisi (lien d'invitation indisponible pour le moment).") };
}
