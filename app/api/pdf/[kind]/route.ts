import type { NextRequest } from "next/server";
import { getOptionalUser, hasPermission } from "@/lib/auth";
import { buildPdf, renderPdf } from "@/lib/pdf/registry";

export const dynamic = "force-dynamic";

/** GET /api/pdf/[kind]?…&download=1 — génère un PDF côté serveur (aperçu inline ou téléchargement). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getOptionalUser();
  if (!user) return new Response("Non authentifié", { status: 401 });

  const { kind } = await params;
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const download = sp.download === "1";
  delete sp.download;

  const built = await buildPdf(kind, sp);
  if (!built) return new Response("Document introuvable", { status: 404 });
  if (!hasPermission(user, built.module, "view")) return new Response("Accès refusé", { status: 403 });

  try {
    const buffer = await renderPdf(built.element);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${built.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("PDF error", e);
    return new Response("Erreur lors de la génération du PDF", { status: 500 });
  }
}
