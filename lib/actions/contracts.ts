"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { CONTRACT_STATUSES, contractPeriod, overlapping, type Contract } from "@/lib/contract-types";
import { formatDateFr, isISODate, todayISO, workMonthOf } from "@/lib/dates";
import { getProjectStart } from "@/lib/data/settings";
import { PHOTO_BUCKET, PHOTO_URL_TTL } from "@/lib/photo-types";
import type { ActionResult } from "@/lib/types";

const alertDays = z
  .string()
  .trim()
  .default("")
  .transform((s) => [...new Set(s.split(/[\s,;]+/).filter(Boolean).map(Number))])
  .refine((a) => a.every((n) => Number.isInteger(n) && n >= 1 && n <= 730), "Alertes : indiquez des nombres de jours séparés par des virgules (ex. 90,60,30).")
  .transform((a) => a.sort((x, y) => y - x).join(","));

const contractSchema = z
  .object({
    id: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().uuid().optional()),
    reference: z.string().trim().min(1, "Indiquez la référence du contrat.").max(120),
    description: z.string().trim().max(2000).default(""),
    start_date: z.string().date("Date de début du contrat invalide."),
    end_date: z.string().date("Date de fin du contrat invalide."),
    status: z.enum(["brouillon", "actif"]).default("actif"),
    alert_days: alertDays,
  })
  .refine((d) => d.end_date >= d.start_date, { message: "La date de fin du contrat ne peut pas précéder la date de début.", path: ["end_date"] });

async function refresh(id?: string) {
  const supabase = await createClient();
  await supabase.rpc("sync_contract_reminders");
  revalidatePath("/profil/contrats", "layout");
  if (id) revalidatePath(`/profil/contrats/${id}`);
  revalidatePath("/", "layout");
}

function contractError(message: string): string {
  if (message.includes("CONFIRMATION_INVALIDE")) return "Confirmation invalide : retapez exactement la référence du contrat.";
  const b = message.match(/SUPPRESSION_BLOQUEE: (.*)$/);
  if (b) return `Suppression impossible : ${b[1]}`;
  return friendlyError(message);
}

/**
 * Nouveau contrat ou modification. Un chevauchement avec un autre contrat (en cours ou clôturé)
 * est signalé et doit être confirmé explicitement. Les enregistrements existants ne sont jamais
 * modifiés : ils appartiennent au contrat dont la période contient leur date.
 */
export async function saveContract(_prev: ActionResult<{ id: string; overlaps?: string[] }> | null, formData: FormData): Promise<ActionResult<{ id: string; overlaps?: string[] }>> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const parsed = contractSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { data: all } = await supabase.from("company_contracts").select("*");
  const list = (all ?? []) as Contract[];
  const current = id ? list.find((c) => c.id === id) : undefined;
  if (id && !current) return { ok: false, error: t("Contrat introuvable.") };
  if (current && (current.status === "termine" || current.status === "archive")) return { ok: false, error: t("Contrat clôturé : rouvrez-le avant de le modifier.") };
  const clash = overlapping(list, values.start_date, values.end_date, id);
  if (clash.length && formData.get("confirm_overlap") !== "on") {
    return {
      ok: false,
      error: t("Les dates chevauchent un autre contrat : {list}. Cochez « Je confirme le chevauchement » pour enregistrer quand même (les enregistrements de la période commune apparaîtront dans les deux contrats).", {
        list: clash.map((c) => `${c.reference} (${formatDateFr(c.start_date)} → ${formatDateFr(contractPeriod(c).to)})`).join(", "),
      }),
    };
  }
  const { data, error } = id ? await supabase.from("company_contracts").update(values).eq("id", id).select("id").single() : await supabase.from("company_contracts").insert(values).select("id").single();
  if (error) return { ok: false, error: t(contractError(error.message)) };
  await refresh(data.id);
  return { ok: true, message: id ? t("Contrat enregistré.") : t("Nouveau contrat créé. Les contrats précédents et leurs rapports sont conservés."), data: { id: data.id } };
}

/** « Clôturer le contrat » : date de clôture effective, note, statut Terminé ou Archivé. */
export async function closeContract(id: string, closedOn: string, note: string, status: "termine" | "archive"): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!isISODate(closedOn) || !["termine", "archive"].includes(status)) return { ok: false, error: t("Données invalides.") };
  const supabase = await createClient();
  const { data: c } = await supabase.from("company_contracts").select("start_date").eq("id", id).maybeSingle();
  if (!c) return { ok: false, error: t("Contrat introuvable.") };
  if (closedOn < c.start_date) return { ok: false, error: t("La date de clôture ne peut pas précéder le début du contrat.") };
  const { error } = await supabase.from("company_contracts").update({ status, closed_on: closedOn, closure_note: note.trim().slice(0, 2000) }).eq("id", id);
  if (error) return { ok: false, error: t(contractError(error.message)) };
  await refresh(id);
  return { ok: true, message: status === "archive" ? t("Contrat clôturé et archivé. Ses rapports restent consultables et exportables.") : t("Contrat clôturé. Ses rapports restent consultables et exportables.") };
}

/** Archiver un contrat terminé, ou le rouvrir (administrateur) pour corriger sa période. */
export async function setContractStatus(id: string, status: "archive" | "actif"): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (status === "actif" && auth.user.role !== "admin") return { ok: false, error: t("Seul un administrateur peut rouvrir un contrat clôturé.") };
  if (!CONTRACT_STATUSES.includes(status)) return { ok: false, error: t("Données invalides.") };
  const supabase = await createClient();
  const { error } = await supabase.from("company_contracts").update(status === "actif" ? { status, closed_on: null } : { status }).eq("id", id);
  if (error) return { ok: false, error: t(contractError(error.message)) };
  await refresh(id);
  return { ok: true, message: status === "archive" ? t("Contrat archivé.") : t("Contrat rouvert : sa période n'est plus protégée.") };
}

/**
 * « Supprimer définitivement » (administrateur) : contrat et toutes les données datées de sa période.
 * La base vérifie la référence retapée et l'absence de chevauchement ; les fichiers du stockage
 * sont ensuite retirés, et les fichiers non supprimés sont signalés.
 */
export async function deleteContractPermanently(id: string, confirm: string): Promise<ActionResult<{ files: number; failed: string[] }>> {
  const t = await getT();
  const auth = await assertModule("parametres", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (auth.user.role !== "admin") return { ok: false, error: t("Suppression définitive réservée à l'administrateur.") };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_contract_permanently", { p_id: id, p_confirm: confirm });
  if (error) return { ok: false, error: t(contractError(error.message)) };
  const paths = ((data as { paths?: string[] })?.paths ?? []).filter(Boolean);
  const failed: string[] = [];
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error: se } = await supabase.storage.from(PHOTO_BUCKET).remove(chunk);
    if (se) failed.push(...chunk);
  }
  await refresh();
  return {
    ok: true,
    message: failed.length
      ? t("Contrat supprimé définitivement. {count} fichier(s) n'ont pas pu être retirés du stockage.", { count: failed.length })
      : t("Contrat et données de sa période supprimés définitivement ({count} fichier(s) retiré(s)).", { count: paths.length }),
    data: { files: paths.length, failed },
  };
}

export type ExportItem = { folder: string; name: string; url: string };

/**
 * Liste des documents à télécharger pour un contrat (« Télécharger tous les rapports ») :
 * PDF générés à la demande (mêmes droits que dans l'application) et photos / pièces jointes
 * (liens signés). Le fichier ZIP est assemblé dans le navigateur.
 */
export async function getContractExportManifest(id: string, withPhotos: boolean): Promise<ActionResult<{ reference: string; from: string; to: string; items: ExportItem[] }>> {
  const t = await getT();
  const auth = await assertModule("parametres", "view");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  const supabase = await createClient();
  const { data: c } = await supabase.from("company_contracts").select("*").eq("id", id).maybeSingle();
  if (!c) return { ok: false, error: t("Contrat introuvable.") };
  const contract = c as Contract;
  const { from, to: end } = contractPeriod(contract);
  const to = end > todayISO() ? todayISO() : end;
  const projectStart = await getProjectStart();
  const can = (m: keyof typeof auth.user.permissions) => auth.user.permissions[m]?.can_view;
  const items: ExportItem[] = [];
  const pdf = (folder: string, name: string, kind: string, params: Record<string, string>) => items.push({ folder, name: `${name}.pdf`, url: `/api/pdf/${kind}?${new URLSearchParams(params).toString()}` });

  pdf("00 Contrat", `Rapport du contrat ${contract.reference}`, "contrat", { id });
  const [{ data: att }, { data: clean }, { data: coll }] = await Promise.all([
    can("pointage") ? supabase.from("attendance").select("activity_date, team_type").gte("activity_date", from).lte("activity_date", to) : Promise.resolve({ data: [] }),
    can("rapport_journalier") ? supabase.from("cleaning_reports").select("activity_date").gte("activity_date", from).lte("activity_date", to) : Promise.resolve({ data: [] }),
    can("rapport_journalier") ? supabase.from("collection_reports").select("activity_date").gte("activity_date", from).lte("activity_date", to) : Promise.resolve({ data: [] }),
  ]);
  const sheets = [...new Set((att ?? []).map((a) => `${a.activity_date}|${a.team_type}`))].sort();
  for (const k of sheets) {
    const [date, team] = k.split("|");
    pdf(`01 Pointage quotidien/${date.slice(0, 7)}`, `Pointage ${team} ${date}`, "pointage", { date, equipe: team });
  }
  for (const d of [...new Set((clean ?? []).map((x) => x.activity_date as string))].sort()) pdf(`02 Rapports nettoiement/${d.slice(0, 7)}`, `Rapport nettoiement ${d}`, "rapport-nettoiement", { date: d });
  for (const d of [...new Set((coll ?? []).map((x) => x.activity_date as string))].sort()) pdf(`03 Rapports collecte/${d.slice(0, 7)}`, `Rapport collecte ${d}`, "rapport-collecte", { date: d });

  // Mois de pointage couverts par le contrat
  const months = new Set<string>();
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) months.add(workMonthOf(d.toISOString().slice(0, 10), projectStart));
  for (const m of [...months].sort()) {
    if (can("pointage")) {
      pdf("04 Rapports mensuels", `Pointage mensuel ${m}`, "pointage-mensuel", { mois: m });
      pdf("04 Rapports mensuels", `Grille de pointage ${m}`, "pointage-grille", { mois: m });
      pdf("04 Rapports mensuels", `Heures supplementaires ${m}`, "pointage-hs", { mois: m });
    }
    if (can("rapport_camions")) pdf("05 Camions", `Rapport camions mensuel ${m}`, "camions-mensuel", { mois: m });
    if (can("rapport_mensuel")) pdf("04 Rapports mensuels", `Rapport mensuel ${m}`, "rapport-mensuel", { mois: m });
  }
  const period = { from, to };
  const tag = `${from}_${to}`;
  if (can("rapport_camions")) {
    pdf("05 Camions", `Rapport camions ${tag}`, "camions", period);
    pdf("05 Camions", `Carburant ${tag}`, "carburant", period);
    pdf("05 Camions", `Reparations et depenses ${tag}`, "reparations-depenses", { vue: "periode", ...period });
  }
  if (can("pointage")) pdf("06 Absences", `Rapport des absents ${tag}`, "absences", period);
  if (can("conges")) {
    pdf("07 Conges et recuperations", `Soldes de conges au ${to}`, "conges-soldes", { date: to });
    pdf("07 Conges et recuperations", `Historique des conges ${tag}`, "conges-historique", period);
    pdf("07 Conges et recuperations", `Historique des recuperations ${tag}`, "recuperation-historique", period);
  }
  if (can("achats")) {
    pdf("08 Achats", `Rapport des achats ${tag}`, "achats-rapport", { vue: "periode", ...period, photos: "1" });
    pdf("08 Achats", `Liste des achats ${tag}`, "achats-liste", period);
  }
  if (can("avertissements")) pdf("09 Autres rapports", `Avertissements ${tag}`, "avertissements", period);
  if (can("dechet_vert")) pdf("09 Autres rapports", `Dechet vert ${tag}`, "dechet-vert", period);
  if (can("programme")) pdf("09 Autres rapports", `Programme de travail ${tag}`, "programme", period);
  if (can("rapports_travailleurs")) pdf("09 Autres rapports", `Rapports travailleurs ${tag}`, "travailleurs-periode", period);

  // Photos et pièces jointes (uniquement celles que l'utilisateur peut voir)
  const { data: photos } = await supabase
    .from("photos")
    .select("id, storage_path, entity_type, activity_date, created_at")
    .or(`and(activity_date.gte.${from},activity_date.lte.${to}),and(entity_type.eq.company_contract,entity_id.eq.${id})`)
    .limit(5000);
  const list = (photos ?? []).filter((p) => withPhotos || p.entity_type === "company_contract");
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200);
    const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(chunk.map((p) => p.storage_path as string), PHOTO_URL_TTL);
    const byPath = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl]));
    for (const p of chunk) {
      const ext = (p.storage_path as string).split(".").pop() || "jpg";
      const folder = p.entity_type === "company_contract" ? "00 Contrat/Pieces jointes" : `10 Photos/${p.entity_type}`;
      const day = (p.activity_date as string | null) ?? (p.created_at as string).slice(0, 10);
      items.push({ folder, name: `${day} ${String(p.id).slice(0, 8)}.${ext}`, url: byPath.get(p.storage_path as string) ?? "" });
    }
  }
  return { ok: true, data: { reference: contract.reference, from, to, items } };
}
