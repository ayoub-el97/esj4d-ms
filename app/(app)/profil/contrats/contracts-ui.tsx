"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Download, Lock, RotateCcw, Save, Trash2 } from "lucide-react";
import { zipSync, strToU8 } from "fflate";
import { closeContract, deleteContractPermanently, getContractExportManifest, saveContract, setContractStatus } from "@/lib/actions/contracts";
import type { Contract } from "@/lib/contract-types";
import { todayISO } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

/** Création (« Nouveau contrat ») ou modification d'un contrat. */
export function ContractForm({ contract }: { contract?: Contract }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(saveContract, null);
  useEffect(() => {
    if (state?.ok && state.data) {
      toast.success(state.message);
      router.push(`/profil/contrats/${state.data.id}`);
      router.refresh();
    }
  }, [state, router]);
  // Chevauchement signalé par le serveur : case de confirmation affichée
  const overlap = !!state && !state.ok && state.error.includes("chevauchent");
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={contract?.id ?? ""} />
      <ActionMessage state={state && !state.ok ? state : null} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="reference">{t("Référence du contrat")}</Label>
          <Input id="reference" name="reference" defaultValue={contract?.reference ?? ""} required placeholder={t("Ex. Marché n° 12/2026")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="start_date">{t("Date de début du contrat")}</Label>
          <Input id="start_date" name="start_date" type="date" defaultValue={contract?.start_date ?? ""} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="end_date">{t("Date de fin du contrat")}</Label>
          <Input id="end_date" name="end_date" type="date" defaultValue={contract?.end_date ?? ""} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">{t("Statut du contrat")}</Label>
          <NativeSelect id="status" name="status" defaultValue={contract?.status === "brouillon" ? "brouillon" : "actif"}>
            <option value="actif">{t("Actif")}</option>
            <option value="brouillon">{t("Brouillon")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="alert_days">{t("Rappels avant la fin (jours)")}</Label>
          <Input id="alert_days" name="alert_days" defaultValue={contract?.alert_days ?? "90,60,30"} dir="ltr" />
          <p className="text-xs text-muted-foreground">{t("Rappels aussi le jour de la fin, puis après l'échéance si le contrat n'est ni clôturé ni renouvelé.")}</p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="description">{t("Description / Objet du contrat (facultatif)")}</Label>
          <Textarea id="description" name="description" defaultValue={contract?.description ?? ""} rows={3} />
        </div>
      </div>
      {overlap && (
        <label className="flex items-start gap-2 rounded-lg border border-orange-300 bg-orange-50 p-2 text-sm text-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
          <input type="checkbox" name="confirm_overlap" className="mt-0.5 size-4" />
          <span>{t("Je confirme le chevauchement avec l'autre contrat.")}</span>
        </label>
      )}
      <SubmitButton>
        <Save /> {contract ? t("Enregistrer le contrat") : t("Créer le contrat")}
      </SubmitButton>
    </form>
  );
}

/** « Clôturer le contrat », archivage, réouverture (administrateur). */
export function ContractLifecycle({ contract, isAdmin }: { contract: Contract; isAdmin: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [closing, setClosing] = useState(false);
  const [closedOn, setClosedOn] = useState(todayISO() < contract.end_date ? todayISO() : contract.end_date);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"termine" | "archive">("termine");
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        setClosing(false);
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <div className="flex flex-wrap gap-2">
      {(contract.status === "actif" || contract.status === "brouillon") && (
        <Button type="button" onClick={() => setClosing(true)} disabled={pending}>
          <Lock /> {t("Clôturer le contrat")}
        </Button>
      )}
      {contract.status === "termine" && (
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => setContractStatus(contract.id, "archive"))}>
          <Archive /> {t("Archiver")}
        </Button>
      )}
      {(contract.status === "termine" || contract.status === "archive") && isAdmin && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => window.confirm(t("Rouvrir le contrat ? Les enregistrements de sa période pourront à nouveau être modifiés.")) && run(() => setContractStatus(contract.id, "actif"))}
        >
          <RotateCcw /> {t("Rouvrir le contrat")}
        </Button>
      )}
      {closing && (
        <Dialog open onOpenChange={(o) => !o && setClosing(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("Clôturer le contrat")}</DialogTitle>
              <DialogDescription>{t("Les rapports, pointages, achats, photos et documents du contrat sont conservés et restent consultables et exportables. Les enregistrements de sa période sont protégés contre les modifications.")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{t("Date de clôture effective")}</Label>
                <Input type="date" value={closedOn} onChange={(e) => setClosedOn(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t("Statut après clôture")}</Label>
                <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as "termine" | "archive")}>
                  <option value="termine">{t("Terminé")}</option>
                  <option value="archive">{t("Archivé")}</option>
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label>{t("Note de clôture (facultatif)")}</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setClosing(false)}>
                {t("Annuler")}
              </Button>
              <Button disabled={pending || !closedOn} onClick={() => run(() => closeContract(contract.id, closedOn, note, status))}>
                <Lock /> {t("Clôturer")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** « Télécharger tous les rapports » : ZIP assemblé dans le navigateur (dossiers, index, échecs signalés). */
export function ExportAllButton({ contractId, reference }: { contractId: string; reference: string }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [withPhotos, setWithPhotos] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const run = async () => {
    setBusy(true);
    setFailures([]);
    try {
      const m = await getContractExportManifest(contractId, withPhotos);
      if (!m.ok || !m.data) {
        toast.error(m.ok ? t("Données invalides.") : m.error);
        return;
      }
      const { items, from, to } = m.data;
      const files: Record<string, Uint8Array> = {};
      const ok: string[] = [];
      const failed: string[] = [];
      const used = new Set<string>();
      let done = 0;
      setProgress({ done, total: items.length });
      const queue = [...items];
      const worker = async () => {
        for (let it = queue.shift(); it; it = queue.shift()) {
          let path = `${it.folder}/${it.name}`;
          for (let i = 2; used.has(path); i++) path = `${it.folder}/${it.name.replace(/(\.\w+)$/, ` (${i})$1`)}`;
          used.add(path);
          try {
            if (!it.url) throw new Error(t("lien indisponible"));
            const res = await fetch(it.url, { credentials: "same-origin" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            files[path] = new Uint8Array(await res.arrayBuffer());
            ok.push(path);
          } catch (e) {
            failed.push(`${path} — ${(e as Error).message}`);
          }
          done++;
          setProgress({ done, total: items.length });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      const index = [
        t("Contrat {ref} — du {from} au {to}", { ref: reference, from: from.split("-").reverse().join("/"), to: to.split("-").reverse().join("/") }),
        t("Exporté le {date}", { date: new Date().toLocaleString("fr-FR") }),
        "",
        t("Documents exportés ({count}) :", { count: ok.length }),
        ...ok.sort().map((p) => `  ${p}`),
        "",
        failed.length ? t("Documents NON exportés ({count}) :", { count: failed.length }) : t("Aucun échec."),
        ...failed.map((p) => `  ${p}`),
      ].join("\r\n");
      files["INDEX.txt"] = strToU8(index);
      const zip = zipSync(files, { level: 0 });
      const blob = new Blob([zip as BlobPart], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `contrat-${reference.replace(/[^\w.-]+/g, "-")}-${from}_${to}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      setFailures(failed);
      if (failed.length) toast.warning(t("Archive téléchargée : {count} document(s) n'ont pas pu être exportés (liste dans INDEX.txt).", { count: failed.length }), { duration: 10000 });
      else toast.success(t("Archive téléchargée : {count} document(s).", { count: ok.length }));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} className="size-4" /> {t("Inclure les photos et pièces jointes")}
      </label>
      <Button type="button" variant="outline" disabled={busy} onClick={run}>
        <Download /> {busy && progress ? t("Préparation… {done}/{total}", { done: progress.done, total: progress.total }) : t("Télécharger tous les rapports")}
      </Button>
      {failures.length > 0 && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-2 text-xs text-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
          <p className="font-medium">{t("Documents non exportés :")}</p>
          <ul className="list-disc ps-4">
            {failures.slice(0, 30).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {failures.length > 30 && <p>{t("… et {count} autre(s) (voir INDEX.txt).", { count: failures.length - 30 })}</p>}
        </div>
      )}
    </div>
  );
}

/** « Supprimer définitivement » : double confirmation, export proposé, liste des données supprimées. */
export function DeleteContractButton({ contract, blocker, items }: { contract: Contract; blocker: string | null; items: { category: string; items: number }[] }) {
  const { t } = useT();
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setStep(1)}>
        <Trash2 /> {t("Supprimer définitivement")}
      </Button>
      {step > 0 && (
        <Dialog open onOpenChange={(o) => !o && setStep(0)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("Supprimer définitivement le contrat {ref}", { ref: contract.reference })}</DialogTitle>
              <DialogDescription>{t("Cette action est irréversible. Rien n'est supprimé avant la seconde confirmation.")}</DialogDescription>
            </DialogHeader>
            {blocker ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{t(blocker)}</p>
            ) : step === 1 ? (
              <div className="space-y-2 text-sm">
                <p>{t("Seront supprimés définitivement : le contrat, ses pièces jointes, ses rappels, et toutes les données datées de sa période :")}</p>
                <ul className="max-h-48 list-disc overflow-y-auto ps-5 text-xs">
                  {items.length === 0 && <li>{t("aucun enregistrement dans la période")}</li>}
                  {items.map((i) => (
                    <li key={i.category}>
                      {t(i.category)} : <strong>{i.items}</strong>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">{t("Conservés : fiches employés et camions, demandes de congés et de récupération, corrections de solde, jours fériés, engagements et décisions d'absence. Les soldes et compteurs qui dépendaient des pointages supprimés seront recalculés sans eux.")}</p>
                <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{t("Conseil : téléchargez d'abord tous les rapports du contrat (bouton « Télécharger tous les rapports »).")}</p>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p>{t("Seconde confirmation : retapez la référence du contrat pour supprimer définitivement.")}</p>
                <p className="font-mono text-xs">{contract.reference}</p>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={contract.reference} />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(0)}>
                {t("Annuler")}
              </Button>
              {!blocker && step === 1 && (
                <Button variant="destructive" onClick={() => setStep(2)}>
                  {t("Continuer")}
                </Button>
              )}
              {!blocker && step === 2 && (
                <Button
                  variant="destructive"
                  disabled={pending || typed.trim() !== contract.reference}
                  onClick={() =>
                    start(async () => {
                      const r = await deleteContractPermanently(contract.id, typed);
                      if (r.ok) {
                        toast.success(r.message, { duration: 10000 });
                        router.push("/profil/contrats");
                        router.refresh();
                      } else toast.error(r.error, { duration: 10000 });
                    })
                  }
                >
                  <Trash2 /> {t("Supprimer définitivement")}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
