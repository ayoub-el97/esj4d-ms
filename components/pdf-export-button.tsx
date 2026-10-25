"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, FileDown, Loader2, Mail } from "lucide-react";
import { sendPdfByEmail } from "@/lib/actions/pdf";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativeSelect } from "@/components/native-select";

/** `label` des variantes : clés de traduction (texte français). */
type Choice = { label: string; params: Record<string, string> };

/**
 * Export PDF en plusieurs étapes (cahier des charges §5.5) :
 * 1. aperçu  2. vérification  3. confirmation  4. téléchargement  5. copie e-mail au directeur (si configuré).
 */
export function PdfExportButton({
  kind,
  params,
  label = "Export PDF",
  choices,
}: {
  kind: string;
  params: Record<string, string>;
  label?: string;
  choices?: Choice[];
}) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [choiceIdx, setChoiceIdx] = useState(0);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const active = choices?.[choiceIdx]?.params ?? params;
  const qs = new URLSearchParams(active).toString();
  const previewUrl = `/api/pdf/${kind}?${qs}`;
  const downloadUrl = `/api/pdf/${kind}?${qs}&download=1`;

  const confirm = () => {
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // L'e-mail n'est jamais annoncé comme envoyé si l'envoi échoue
    start(async () => {
      const r = await sendPdfByEmail(kind, active);
      setEmailResult(r.ok ? (r.message ?? "") : r.error);
      if (r.ok) toast.success(r.message);
      else toast.warning(r.error);
    });
  };

  return (
    <>
      <Button variant="outline" onClick={() => { setEmailResult(null); setOpen(true); }}>
        <FileDown /> {t(label)}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[90vh] flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t("Aperçu du PDF")}</DialogTitle>
            <DialogDescription>{t("Vérifiez le document, puis confirmez pour le télécharger et en envoyer une copie au directeur.")}</DialogDescription>
          </DialogHeader>
          {locale === "ar" && <p className="text-xs text-muted-foreground">{t("Les documents PDF sont générés en français.")}</p>}
          {choices && choices.length > 1 && (
            <NativeSelect className="w-auto" value={choiceIdx} onChange={(e) => setChoiceIdx(Number(e.target.value))}>
              {choices.map((c, i) => (
                <option key={c.label} value={i}>
                  {t(c.label)}
                </option>
              ))}
            </NativeSelect>
          )}
          <iframe key={previewUrl} src={previewUrl} title={t("Aperçu du PDF")} className="min-h-0 flex-1 rounded-lg border bg-muted" />
          {emailResult && (
            <Alert>
              <Mail />
              <AlertDescription>{emailResult}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("Fermer")}
            </Button>
            <Button onClick={confirm} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Download />} {t("Confirmer et télécharger")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
