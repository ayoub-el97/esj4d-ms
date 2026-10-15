"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, FileDown, Loader2, Mail } from "lucide-react";
import { sendPdfByEmail } from "@/lib/actions/pdf";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativeSelect } from "@/components/native-select";

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
  /** Plusieurs variantes possibles (ex. feuille nettoiement / collecte) */
  choices?: Choice[];
}) {
  const [open, setOpen] = useState(false);
  const [choiceIdx, setChoiceIdx] = useState(0);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const active = choices?.[choiceIdx]?.params ?? params;
  const qs = new URLSearchParams(active).toString();
  const previewUrl = `/api/pdf/${kind}?${qs}`;
  const downloadUrl = `/api/pdf/${kind}?${qs}&download=1`;

  const confirm = () => {
    // 4. téléchargement
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 5. e-mail (jamais annoncé comme envoyé si l'envoi échoue)
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
        <FileDown /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[90vh] flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Aperçu du PDF</DialogTitle>
            <DialogDescription>Vérifiez le document, puis confirmez pour le télécharger et en envoyer une copie au directeur.</DialogDescription>
          </DialogHeader>
          {choices && choices.length > 1 && (
            <NativeSelect className="w-auto" value={choiceIdx} onChange={(e) => setChoiceIdx(Number(e.target.value))}>
              {choices.map((c, i) => (
                <option key={c.label} value={i}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          )}
          <iframe key={previewUrl} src={previewUrl} title="Aperçu PDF" className="min-h-0 flex-1 rounded-lg border bg-muted" />
          {emailResult && (
            <Alert>
              <Mail />
              <AlertDescription>{emailResult}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Fermer
            </Button>
            <Button onClick={confirm} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Download />} Confirmer et télécharger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
