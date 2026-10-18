import "server-only";
import { cloneElement, isValidElement, type ReactElement } from "react";

/**
 * Avant de générer un PDF, chaque photo (objet { id, storage_path, url }) présente dans les
 * données du document est téléchargée depuis le stockage privé (lien signé) et intégrée au PDF.
 * Une photo illisible ou indisponible ne bloque plus la génération : elle est marquée
 * « failed » et signalée dans le document. S'applique à tous les modules.
 */
type PhotoLike = { id: string; storage_path: string; url: string; failed?: boolean };

const isPhoto = (v: unknown): v is PhotoLike =>
  !!v && typeof v === "object" && typeof (v as PhotoLike).id === "string" && typeof (v as PhotoLike).storage_path === "string" && typeof (v as PhotoLike).url === "string";

const SUPPORTED = /^image\/(jpeg|jpg|png)$/i; // formats lus par le moteur PDF

async function fetchAsDataUri(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!SUPPORTED.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return `data:${type === "image/jpg" ? "image/jpeg" : type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Parcourt les données et collecte toutes les photos (sans doublon). */
function collect(value: unknown, out: Map<string, PhotoLike>, depth = 0) {
  if (depth > 8 || value == null || typeof value !== "object") return;
  if (isValidElement(value)) return;
  if (isPhoto(value)) {
    out.set(value.id, value);
    return;
  }
  if (Array.isArray(value)) value.forEach((v) => collect(v, out, depth + 1));
  else Object.values(value).forEach((v) => collect(v, out, depth + 1));
}

/** Copie des données où chaque photo porte son image intégrée (ou failed = true). */
function replace(value: unknown, embedded: Map<string, string | null>, depth = 0): unknown {
  if (depth > 8 || value == null || typeof value !== "object" || isValidElement(value)) return value;
  if (isPhoto(value)) {
    const data = embedded.get(value.id);
    return data ? { ...value, url: data } : { ...value, url: "", failed: true };
  }
  if (Array.isArray(value)) return value.map((v) => replace(v, embedded, depth + 1));
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v, embedded, depth + 1)]));
}

export async function embedPhotos(element: ReactElement): Promise<{ element: ReactElement; total: number; failed: number }> {
  const props = element.props as Record<string, unknown>;
  const photos = new Map<string, PhotoLike>();
  collect(props, photos);
  if (!photos.size) return { element, total: 0, failed: 0 };

  // Téléchargements en parallèle limité (6 à la fois)
  const list = Array.from(photos.values());
  const embedded = new Map<string, string | null>();
  for (let i = 0; i < list.length; i += 6) {
    const chunk = list.slice(i, i + 6);
    const data = await Promise.all(chunk.map((p) => fetchAsDataUri(p.url)));
    chunk.forEach((p, k) => embedded.set(p.id, data[k]));
  }
  const failed = Array.from(embedded.values()).filter((v) => !v).length;
  return { element: cloneElement(element, replace(props, embedded) as Record<string, unknown>), total: list.length, failed };
}
