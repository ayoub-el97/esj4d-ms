"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { refreshPhotoUrls } from "@/lib/actions/photos";
import { cn } from "@/lib/utils";

/**
 * Image d'une photo privée : si le lien signé a expiré (page restée ouverte longtemps),
 * un nouveau lien est demandé une fois au serveur ; sinon une icône remplace l'image.
 */
export function SafePhoto({ id, url, alt = "", className, onClick }: { id: string; url: string; alt?: string; className?: string; onClick?: () => void }) {
  const [src, setSrc] = useState(url);
  const [state, setState] = useState<"ok" | "retrying" | "failed">("ok");
  // Nouvelle URL reçue du serveur (rafraîchissement de la page) : on repart de zéro
  const [lastProp, setLastProp] = useState(url);
  if (url !== lastProp) {
    setLastProp(url);
    setSrc(url);
    setState("ok");
  }

  if (state === "failed" || !src) {
    return (
      <span className={cn("flex size-full items-center justify-center bg-muted text-muted-foreground", className)}>
        <ImageOff className="size-5" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onClick={onClick}
      loading="lazy"
      onError={async () => {
        if (state !== "ok" || id.startsWith("tmp-")) return setState("failed");
        setState("retrying");
        const fresh = await refreshPhotoUrls([id]).catch(() => ({}) as Record<string, string>);
        if (fresh[id]) {
          setSrc(fresh[id]);
          setState("ok");
        } else setState("failed");
      }}
    />
  );
}
