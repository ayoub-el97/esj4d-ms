"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCheck, Loader2, RotateCcw, Zap } from "lucide-react";
import { getWhatsAppPreview, getWhatsAppStatuses, retryWhatsApp, sendWhatsAppReport, type WaPreview, type WaStatus } from "@/lib/actions/whatsapp";
import { useT } from "@/lib/i18n/client";
import { formatDateTimeFr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";

/** Droit d'envoi WhatsApp de l'utilisateur connecté (fourni par la mise en page de l'application). */
const WhatsAppContext = createContext<{ canSend: boolean }>({ canSend: false });
export function WhatsAppProvider({ canSend, children }: { canSend: boolean; children: React.ReactNode }) {
  return <WhatsAppContext.Provider value={{ canSend }}>{children}</WhatsAppContext.Provider>;
}

export const WA_STATUS_LABELS: Record<WaStatus | "pret" | "config", string> = {
  pret: "Prêt à envoyer",
  envoi_en_cours: "Envoi en cours",
  envoye: "Envoyé (accepté par WhatsApp)",
  remis: "Remis au destinataire",
  lu: "Lu par le destinataire",
  echec: "Échec de l'envoi",
  config: "Configuration WhatsApp manquante",
};
export const WA_STATUS_STYLES: Record<string, string> = {
  pret: "bg-muted text-foreground",
  envoi_en_cours: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  envoye: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  remis: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  lu: "bg-emerald-200 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-100",
  echec: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  config: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

/** Logo WhatsApp (pictogramme reconnaissable). */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-4", className)} fill="currentColor">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.9-9.89a9.83 9.83 0 0 1 7 2.9 9.83 9.83 0 0 1 2.89 7c0 5.45-4.44 9.89-9.9 9.89m8.42-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.9c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.17-3.48-8.4" />
    </svg>
  );
}

// Préférence « envoi rapide » propre à l'appareil (simple confort, jamais une donnée métier)
const QUICK_KEY = "wa-envoi-rapide";
const quickListeners = new Set<() => void>();
const readQuick = () => {
  try {
    return window.localStorage.getItem(QUICK_KEY) === "1";
  } catch {
    return false;
  }
};
const writeQuick = (on: boolean) => {
  try {
    window.localStorage.setItem(QUICK_KEY, on ? "1" : "0");
  } catch {
    /* préférence non enregistrée */
  }
  quickListeners.forEach((l) => l());
};
const subscribeQuick = (l: () => void) => {
  quickListeners.add(l);
  return () => quickListeners.delete(l);
};

/** Bouton « Envoyer par WhatsApp » : rapport exact (type + paramètres), PDF généré au moment de l'envoi. */
export function WhatsAppButton({ kind, params }: { kind: string; params: Record<string, string> }) {
  const { canSend } = useContext(WhatsAppContext);
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<WaPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("directeur");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<WaStatus | "pret" | "config">("pret");
  const [result, setResult] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<string[]>([]);
  const quick = useSyncExternalStore(subscribeQuick, readQuick, () => false);
  const [pending, start] = useTransition();


  // Suivi de la remise (webhook) quelques secondes après l'envoi
  useEffect(() => {
    if (!sentIds.length || !open) return;
    let n = 0;
    const timer = setInterval(async () => {
      n++;
      const s = await getWhatsAppStatuses(sentIds);
      const best = s.some((x) => x.status === "echec") ? "echec" : s.every((x) => x.status === "lu") ? "lu" : s.every((x) => x.status === "remis" || x.status === "lu") ? "remis" : null;
      if (best) {
        setStatus(best);
        if (best === "echec") setResult(s.find((x) => x.status === "echec")?.error ?? null);
      }
      if (best === "lu" || best === "echec" || n >= 10) clearInterval(timer);
    }, 4000);
    return () => clearInterval(timer);
  }, [sentIds, open]);

  if (!canSend) return null;

  const load = () =>
    start(async () => {
      setError(null);
      setResult(null);
      setSentIds([]);
      const r = await getWhatsAppPreview(kind, params);
      if (!r.ok || !r.data) {
        setError(r.ok ? t("Erreur inattendue.") : r.error);
        setPreview(null);
        return;
      }
      setPreview(r.data);
      setMessage(r.data.message);
      setRecipient(r.data.recipients[0]?.key ?? "directeur");
      setStatus(r.data.configured ? "pret" : "config");
    });

  const send = (force = false, quickSend = false): void =>
    start(async () => {
      setStatus("envoi_en_cours");
      setResult(null);
      const r = await sendWhatsAppReport({ kind, params, recipient: quickSend ? "directeur" : recipient, message: quickSend ? undefined : message, force });
      if (!r.ok && r.duplicate) {
        if (window.confirm(r.duplicate)) {
          send(true, quickSend);
          return;
        }
        setStatus("pret");
        return;
      }
      if (r.ok) {
        setStatus("envoye");
        setResult(r.message ?? null);
        setSentIds(r.data?.ids ?? []);
        toast.success(r.message, { duration: 7000 });
      } else {
        setStatus(r.missingConfig ? "config" : "echec");
        setResult(r.error);
        toast.error(r.error, { duration: 10000 });
        if (quickSend) {
          setOpen(true);
          load();
        }
      }
    });

  const onClick = () => {
    if (quick) {
      toast.message(t("Envoi rapide au directeur…"));
      send(false, true);
      return;
    }
    setOpen(true);
    load();
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={onClick} disabled={pending && !open} className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40">
        {pending && !open ? <Loader2 className="animate-spin" /> : <WhatsAppIcon className="text-[#25D366]" />} {t("Envoyer par WhatsApp")}
        {quick && <Zap className="size-3.5 text-amber-500" aria-label={t("Envoi rapide activé")} />}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WhatsAppIcon className="size-5 text-[#25D366]" /> {t("Envoyer par WhatsApp")}
            </DialogTitle>
            <DialogDescription>{preview?.title ?? t("Préparation…")}</DialogDescription>
          </DialogHeader>

          {pending && !preview && !error && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("Préparation du rapport…")}
            </p>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

          {preview && (
            <div className="space-y-3">
              <p className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", WA_STATUS_STYLES[status])}>
                {status === "envoi_en_cours" && <Loader2 className="size-3.5 animate-spin" />}
                {(status === "remis" || status === "lu") && <CheckCheck className="size-3.5" />}
                {t(WA_STATUS_LABELS[status])}
              </p>

              {!preview.configured ? (
                <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-medium">{t("Avant le premier envoi réel, l'administrateur doit compléter :")}</p>
                  <ul className="list-disc ps-5">
                    {preview.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  {preview.isAdmin ? (
                    <Link href="/parametres/whatsapp" className="font-medium text-primary underline">
                      {t("Ouvrir la Configuration WhatsApp")}
                    </Link>
                  ) : (
                    <p>{t("Contactez l'administrateur (Paramètres › Configuration WhatsApp).")}</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="wa-recipient">{t("Destinataire")}</Label>
                    <NativeSelect id="wa-recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                      {preview.recipients.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label} ({r.hint})
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="wa-message">{t("Message (modifiable)")}</Label>
                    <Textarea id="wa-message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={900} />
                    <p className="text-xs text-muted-foreground">
                      {preview.withPdf ? t("Le PDF à jour (logo, données, photos) est généré et joint automatiquement.") : t("Envoi du message seul (pièce jointe PDF désactivée dans la configuration).")}{" "}
                      {preview.mode === "modele" ? t("Envoi par modèle approuvé : les retours à la ligne deviennent « · ».") : ""}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={quick}
                      onChange={(e) => writeQuick(e.target.checked)}
                    />
                    {t("Envoi rapide : les prochains clics envoient directement au directeur, avec le message proposé (sur cet appareil).")}
                  </label>
                </>
              )}

              {result && <p className={cn("rounded-lg px-3 py-2 text-sm", status === "echec" || status === "config" ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300")}>{result}</p>}

              {preview.recent.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium">{t("Derniers envois de ce rapport")}</p>
                  <ul className="mt-1 space-y-1">
                    {preview.recent.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center gap-2">
                        <span>{formatDateTimeFr(m.created_at)}</span>·<span>{m.recipient_label}</span>·<span className={cn("rounded px-1.5", WA_STATUS_STYLES[m.status])}>{t(WA_STATUS_LABELS[m.status])}</span>
                        {m.status === "echec" && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-0.5 text-primary hover:underline"
                            onClick={() =>
                              start(async () => {
                                const r = await retryWhatsApp(m.id);
                                if (r.ok) toast.success(r.message);
                                else toast.error(r.error);
                                load();
                              })
                            }
                          >
                            <RotateCcw className="size-3" /> {t("Réessayer")}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("Fermer")}
            </Button>
            {preview?.configured && (
              <Button onClick={() => send(false)} disabled={pending || !message.trim() || !preview.recipients.length} className="bg-[#1fa855] text-white hover:bg-[#178a45]">
                {pending && status === "envoi_en_cours" ? <Loader2 className="animate-spin" /> : <WhatsAppIcon />} {status === "echec" ? t("Réessayer l'envoi") : t("Confirmer l'envoi")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
