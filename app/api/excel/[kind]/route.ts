import type { NextRequest } from "next/server";
import { getOptionalUser, hasPermission } from "@/lib/auth";
import { buildExcel } from "@/lib/excel/registry";
import { buildXlsx } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

/** GET /api/excel/[kind]?… — classeur Excel (.xlsx) des données enregistrées (droits du module). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getOptionalUser();
  if (!user) return new Response("Non authentifié", { status: 401 });
  const { kind } = await params;
  const built = await buildExcel(kind, Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!built) return new Response("Document introuvable", { status: 404 });
  if (!hasPermission(user, built.module, "view")) return new Response("Accès refusé", { status: 403 });
  try {
    const bytes = buildXlsx(built.sheets);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${built.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("Excel error", e);
    return new Response("Erreur lors de la génération du fichier Excel", { status: 500 });
  }
}
