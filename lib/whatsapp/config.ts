import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Configuration WhatsApp (table whatsapp_config, accès serveur uniquement).
 * Les variables d'environnement ont priorité pour les secrets (recommandé sur Vercel).
 */
export type WhatsAppConfig = {
  api_version: string;
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  app_secret: string;
  verify_token: string;
  manager_name: string;
  manager_number: string;
  extra_recipients: { name: string; number: string }[];
  default_message: string;
  attach_pdf: boolean;
  send_mode: "modele" | "session";
  template_name: string;
  template_lang: string;
  group_enabled: boolean;
  group_id: string;
  group_subject: string;
  group_invite_link: string;
  updated_at: string | null;
};

const EMPTY: WhatsAppConfig = {
  api_version: "v26.0",
  phone_number_id: "",
  waba_id: "",
  access_token: "",
  app_secret: "",
  verify_token: "",
  manager_name: "",
  manager_number: "",
  extra_recipients: [],
  default_message: "",
  attach_pdf: true,
  send_mode: "modele",
  template_name: "",
  template_lang: "fr",
  group_enabled: false,
  group_id: "",
  group_subject: "",
  group_invite_link: "",
  updated_at: null,
};

export const SECRET_FROM_ENV = {
  access_token: () => process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  app_secret: () => process.env.WHATSAPP_APP_SECRET ?? "",
  verify_token: () => process.env.WHATSAPP_VERIFY_TOKEN ?? "",
};

/** Lecture complète (secrets compris) : à n'utiliser que côté serveur, après vérification des droits. */
export async function readWhatsAppConfig(): Promise<WhatsAppConfig> {
  let row: Partial<WhatsAppConfig> = {};
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("whatsapp_config").select("*").eq("id", 1).maybeSingle();
    row = (data ?? {}) as Partial<WhatsAppConfig>;
  } catch {
    row = {};
  }
  const c = { ...EMPTY, ...row, extra_recipients: Array.isArray(row.extra_recipients) ? row.extra_recipients : [] } as WhatsAppConfig;
  c.access_token = SECRET_FROM_ENV.access_token() || c.access_token;
  c.app_secret = SECRET_FROM_ENV.app_secret() || c.app_secret;
  c.verify_token = SECRET_FROM_ENV.verify_token() || c.verify_token;
  return c;
}

/** Éléments manquants pour un envoi réel (clés de traduction). */
export function missingConfig(c: WhatsAppConfig): string[] {
  const m: string[] = [];
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) m.push("Clé SUPABASE_SERVICE_ROLE_KEY absente du serveur (nécessaire pour lire la configuration).");
  if (!c.phone_number_id) m.push("Identifiant du numéro WhatsApp Business (Phone Number ID).");
  if (!c.access_token) m.push("Jeton d'accès de l'API WhatsApp (jeton permanent d'un utilisateur système).");
  if (!c.manager_number) m.push("Numéro WhatsApp du directeur.");
  if (c.send_mode === "modele" && !c.template_name) m.push("Nom du modèle de message approuvé par Meta (mode « Modèle approuvé »).");
  return m;
}

/** Vue sans secrets pour la page de configuration. */
export function publicView(c: WhatsAppConfig) {
  const tail = (s: string) => (s ? `••••${s.slice(-4)}` : "");
  return {
    ...c,
    access_token: "",
    app_secret: "",
    verify_token: "",
    token_set: !!c.access_token,
    token_hint: tail(c.access_token),
    token_from_env: !!SECRET_FROM_ENV.access_token(),
    app_secret_set: !!c.app_secret,
    app_secret_from_env: !!SECRET_FROM_ENV.app_secret(),
    verify_token_set: !!c.verify_token,
    verify_token_from_env: !!SECRET_FROM_ENV.verify_token(),
  };
}
export type WhatsAppPublicConfig = ReturnType<typeof publicView>;
