import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readWhatsAppConfig } from "@/lib/whatsapp/config";

export const dynamic = "force-dynamic";

/**
 * Webhook WhatsApp (Meta) — URL de rappel : https://<votre-domaine>/api/whatsapp/webhook
 * GET  : vérification de l'abonnement (hub.verify_token).
 * POST : statuts de remise (sent, delivered, read, failed), vérifiés par la signature
 *        X-Hub-Signature-256 (clé secrète de l'application Meta). Requête non signée : refusée.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const c = await readWhatsAppConfig();
  if (sp.get("hub.mode") === "subscribe" && c.verify_token && sp.get("hub.verify_token") === c.verify_token) {
    return new Response(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Refusé", { status: 403 });
}

const RANK: Record<string, number> = { envoi_en_cours: 0, envoye: 1, remis: 2, lu: 3, echec: 4 };
const MAP: Record<string, string> = { sent: "envoye", delivered: "remis", read: "lu", failed: "echec" };

type StatusEvent = { id?: string; status?: string; timestamp?: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] };

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const c = await readWhatsAppConfig();
  if (!c.app_secret) return new Response("Webhook non configuré", { status: 401 });
  const sig = request.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${createHmac("sha256", c.app_secret).update(raw).digest("hex")}`;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Signature invalide", { status: 401 });

  let body: { entry?: { changes?: { field?: string; value?: { statuses?: StatusEvent[] } & Record<string, unknown> }[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("JSON invalide", { status: 400 });
  }
  const admin = createAdminClient();
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        const next = s.status ? MAP[s.status] : undefined;
        if (!s.id || !next) continue;
        const { data: m } = await admin.from("whatsapp_messages").select("id, status").eq("wa_message_id", s.id).maybeSingle();
        if (!m) continue;
        // Jamais de retour en arrière (ex. « lu » puis « remis » reçu en retard), sauf échec
        if (next !== "echec" && RANK[next] <= RANK[m.status]) continue;
        const err = s.errors?.[0];
        await admin
          .from("whatsapp_messages")
          .update({
            status: next,
            error: next === "echec" ? `${err?.title ?? err?.message ?? "Échec signalé par WhatsApp"}${err?.error_data?.details ? ` — ${err.error_data.details}` : ""}${err?.code ? ` (code ${err.code})` : ""}` : "",
            status_at: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", m.id);
      }
      // Groupe : lien d'invitation transmis par l'événement de création (group_lifecycle_update)
      const text = JSON.stringify(change.value ?? {});
      const link = text.match(/"invite_link"\s*:\s*"(https:\/\/chat\.whatsapp\.com\/[^"]+)"/)?.[1];
      if (link && c.group_id && text.includes(c.group_id)) {
        await admin.from("whatsapp_config").update({ group_invite_link: link, updated_at: new Date().toISOString() }).eq("id", 1);
      }
    }
  }
  return new Response("OK", { status: 200 });
}
