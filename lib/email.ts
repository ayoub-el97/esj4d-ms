import "server-only";

export type EmailResult = { sent: true } | { sent: false; reason: string };

/**
 * Envoi d'un e-mail avec pièce jointe PDF via Resend (API HTTP, sans SDK).
 * Si le service n'est pas configuré, renvoie sent=false avec une explication claire.
 */
export async function sendEmailWithPdf(opts: {
  to: string;
  subject: string;
  text: string;
  filename: string;
  pdf: Buffer;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { sent: false, reason: "Envoi d'e-mail non configuré (RESEND_API_KEY / EMAIL_FROM absents)." };
  }
  if (!opts.to) {
    return { sent: false, reason: "Adresse e-mail du directeur non renseignée dans Paramètres › Réglages." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        attachments: [{ filename: opts.filename, content: opts.pdf.toString("base64") }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, reason: `Le service d'e-mail a refusé l'envoi (${res.status}) : ${body.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: `Erreur réseau lors de l'envoi : ${(e as Error).message}` };
  }
}
