"use server";

import { getOptionalUser, hasPermission } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { sendEmailWithPdf } from "@/lib/email";
import { buildPdf, renderPdf } from "@/lib/pdf/registry";
import type { ActionResult } from "@/lib/types";

/** Étape 5 de l'export : envoi d'une copie du PDF à l'e-mail du directeur. */
export async function sendPdfByEmail(kind: string, params: Record<string, string>): Promise<ActionResult> {
  const user = await getOptionalUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const built = await buildPdf(kind, params);
  if (!built) return { ok: false, error: "Type de document inconnu." };
  if (!hasPermission(user, built.module, "view")) return { ok: false, error: "Accès refusé." };

  const settings = await getSettings();
  const pdf = await renderPdf(built.element);
  const result = await sendEmailWithPdf({
    to: settings.director_email,
    subject: `[${settings.company_name}] ${built.title}`,
    text: `Bonjour,\n\nVeuillez trouver ci-joint : ${built.title}.\n\nEnvoyé par ${user.fullName} depuis l'application de gestion.`,
    filename: built.filename,
    pdf,
  });

  if (result.sent) return { ok: true, message: `Copie envoyée à ${settings.director_email}.` };
  return { ok: false, error: `PDF téléchargé. Copie e-mail NON envoyée : ${result.reason}` };
}
