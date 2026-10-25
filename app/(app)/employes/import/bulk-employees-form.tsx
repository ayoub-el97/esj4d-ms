"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardPaste, Loader2, Plus, Save, X } from "lucide-react";
import { createEmployeesBulk, type BulkEmployeeInput } from "@/lib/actions/employees";
import { useT } from "@/lib/i18n/client";
import { POSITION_LABELS, POSITIONS, WEEKDAY_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Row = BulkEmployeeInput & { key: string; error?: string };

const emptyRow = (): Row => ({ key: crypto.randomUUID(), matricule: "", last_name: "", first_name: "", position: "balayeur", rest_day: "", hire_date: "", phone: "" });
const isBlank = (r: Row) => !r.matricule.trim() && !r.last_name.trim() && !r.first_name.trim();

/** Sans accents, minuscules : « Chauffeur remplaçant » -> « chauffeur remplacant ». */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Poste écrit librement (Excel) -> code du poste. */
function parsePosition(v: string): string {
  const s = norm(v).replace(/[_-]/g, " ");
  if (!s) return "balayeur";
  const remp = s.includes("rempl") || s.includes("substitut");
  if (s.includes("chauff") || s.includes("driver")) return remp ? "chauffeur_remplacant" : "chauffeur";
  if (s.includes("ripp") || s.includes("ripeur") || s.includes("collect") || s.includes("loader")) return remp ? "rippeur_remplacant" : "rippeur";
  if (s.includes("balay") || s.includes("nettoy") || s.includes("clean")) return "balayeur";
  return v.trim(); // inconnu : signalé à l'enregistrement
}

/** Jour de repos : « lundi », « Lun », « 1 »… -> 0 (dimanche) à 6 (samedi). */
function parseRestDay(v: string): string {
  const s = norm(v);
  if (!s) return "";
  if (/^[0-6]$/.test(s)) return s;
  const idx = WEEKDAY_LABELS.findIndex((d) => norm(d).startsWith(s.slice(0, 3)));
  return idx >= 0 ? String(idx) : v.trim();
}

/** Date : jj/mm/aaaa, jj-mm-aaaa ou aaaa-mm-jj -> aaaa-mm-jj. */
function parseDate(v: string): string {
  const s = v.trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return s;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export function BulkEmployeesForm({ returnTo }: { returnTo: string }) {
  const { t } = useT();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 5 }, emptyRow));
  const [paste, setPaste] = useState("");
  const [inService, setInService] = useState(true);
  const [showPaste, setShowPaste] = useState(false);
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);

  const update = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, error: undefined } : r)));

  const importPaste = () => {
    // Colonnes : Matricule, Nom, Prénom, Poste, Jour de repos, Date d'entrée, Téléphone (séparées par tabulation, ; ou ,)
    const lines = paste.split(/\r?\n/).filter((l) => l.trim());
    const parsed: Row[] = lines.map((line) => {
      const c = line.split(/\t|;|,(?=\S)/).map((x) => x.trim());
      return { key: crypto.randomUUID(), matricule: c[0] ?? "", last_name: c[1] ?? "", first_name: c[2] ?? "", position: parsePosition(c[3] ?? ""), rest_day: parseRestDay(c[4] ?? ""), hire_date: parseDate(c[5] ?? ""), phone: c[6] ?? "" };
    });
    // En-tête copiée avec le tableau : ignorée
    const data = parsed.filter((r) => norm(r.matricule) !== "matricule");
    if (!data.length) return toast.error(t("Aucune ligne reconnue dans le texte collé."));
    setRows((prev) => [...prev.filter((r) => !isBlank(r)), ...data]);
    setPaste("");
    setShowPaste(false);
    toast.success(t("{count} ligne(s) ajoutée(s) au tableau : vérifiez puis enregistrez.", { count: data.length }));
  };

  const save = () => {
    const filled = rows.filter((r) => !isBlank(r));
    if (!filled.length) return toast.error(t("Remplissez au moins une ligne."));
    start(async () => {
      const r = await createEmployeesBulk(filled.map(({ matricule, last_name, first_name, position, rest_day, hire_date, phone }) => ({ matricule, last_name, first_name, position, rest_day, hire_date, phone, in_service_before_start: !hire_date && inService })));
      if (!r.ok || !r.data) return void toast.error(r.ok ? t("Réponse invalide") : r.error);
      const { created, errors } = r.data;
      // Lignes enregistrées retirées ; lignes en erreur conservées avec la raison
      const errorByIndex = new Map(errors.map((e) => [e.line - 1, e.error]));
      setRows(filled.flatMap((row, i) => (errorByIndex.has(i) ? [{ ...row, error: errorByIndex.get(i) }] : [])));
      setSummary(errors.length ? t("{created} employé(s) enregistré(s), {errors} ligne(s) à corriger ci-dessous.", { created, errors: errors.length }) : null);
      if (created) toast.success(t("{count} employé(s) enregistré(s).", { count: created }));
      router.refresh();
      if (!errors.length) router.push(returnTo);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setShowPaste((s) => !s)}>
          <ClipboardPaste /> {t("Coller depuis Excel")}
        </Button>
        <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, ...Array.from({ length: 5 }, emptyRow)])}>
          <Plus /> {t("5 lignes de plus")}
        </Button>
      </div>

      <label className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm">
        <input type="checkbox" checked={inService} onChange={(e) => setInService(e.target.checked)} className="mt-0.5 size-4" />
        <span>
          {t("Les employés sans date d'entrée étaient déjà en poste au début du projet")}
          <span className="block text-xs text-muted-foreground">{t("La date d'entrée est facultative. Pour ces lignes, les congés sont décomptés depuis la date de début du projet ; sans cette case, aucun congé n'est calculé tant que la date n'est pas renseignée.")}</span>
        </span>
      </label>

      {showPaste && (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            {t("Dans Excel, sélectionnez les colonnes dans cet ordre : Matricule, Nom, Prénom, Poste, Jour de repos, Date d'entrée, Téléphone. Copiez (Ctrl+C) puis collez ici (Ctrl+V).")}
          </p>
          <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} placeholder={"B010\tALAOUI\tSaid\tBalayeur\tVendredi\t01/03/2024\t0600000000"} className="font-mono text-xs" />
          <Button type="button" onClick={importPaste} disabled={!paste.trim()}>
            {t("Ajouter au tableau")}
          </Button>
        </div>
      )}

      {summary && (
        <Alert variant="destructive">
          <AlertDescription>{summary}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.key} className={`rounded-xl border bg-card p-3 shadow-sm ${r.error ? "border-destructive" : ""}`}>
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold">{t("Ligne {n}", { n: i + 1 })}</span>
              {r.error && <span className="font-medium text-destructive">{r.error}</span>}
              <Button type="button" variant="ghost" size="icon-sm" className="ms-auto" aria-label={t("Retirer la ligne")} onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}>
                <X />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
              <Input aria-label={t("Matricule")} placeholder={t("Matricule")} value={r.matricule} onChange={(e) => update(r.key, { matricule: e.target.value })} />
              <Input aria-label={t("Nom")} placeholder={t("Nom")} value={r.last_name} onChange={(e) => update(r.key, { last_name: e.target.value })} />
              <Input aria-label={t("Prénom")} placeholder={t("Prénom")} value={r.first_name} onChange={(e) => update(r.key, { first_name: e.target.value })} />
              <NativeSelect aria-label={t("Poste")} value={r.position} onChange={(e) => update(r.key, { position: e.target.value })}>
                {!POSITIONS.includes(r.position as never) && <option value={r.position}>{r.position || t("— Poste —")}</option>}
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {t(POSITION_LABELS[p])}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect aria-label={t("Jour de repos")} value={r.rest_day} onChange={(e) => update(r.key, { rest_day: e.target.value })}>
                <option value="">{t("Repos : aucun")}</option>
                {WEEKDAY_LABELS.map((d, idx) => (
                  <option key={d} value={String(idx)}>
                    {t("Repos : {day}", { day: t(d) })}
                  </option>
                ))}
              </NativeSelect>
              <Input aria-label={t("Date d'entrée")} type="date" value={r.hire_date} onChange={(e) => update(r.key, { hire_date: e.target.value })} />
              <Input aria-label={t("Téléphone")} placeholder={t("Téléphone")} inputMode="tel" value={r.phone} onChange={(e) => update(r.key, { phone: e.target.value })} />
            </div>
          </div>
        ))}
      </div>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 p-3 shadow-md backdrop-blur lg:bottom-4">
        <span className="text-sm text-muted-foreground">{t("{count} ligne(s) remplie(s)", { count: rows.filter((r) => !isBlank(r)).length })}</span>
        <Button type="button" className="ms-auto" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} {t("Enregistrer tous les employés")}
        </Button>
      </div>
    </div>
  );
}
