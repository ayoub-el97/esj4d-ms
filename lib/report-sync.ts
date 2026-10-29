import "server-only";
import { syncMorningLine } from "@/lib/truck-crew";
import type { createClient } from "@/lib/supabase/server";

/**
 * Remplissage automatique des rapports journaliers à partir du pointage.
 * Appelé après l'enregistrement d'une feuille de présence, ou à la demande depuis les rapports.
 *
 * Règles :
 *  - Seuls les employés qui ont travaillé (Présent ou Jour de repos travaillé) sont repris.
 *  - Nettoiement : une ligne par balayeur ; les lieux, commentaires et photos déjà saisis sont conservés ;
 *    un agent retiré à la main n'est pas réajouté, un agent ajouté à la main n'est pas retiré.
 *  - Collecte : un rapport par équipe qui a travaillé (chauffeur titulaire ou son remplaçant),
 *    sur le camion du jour indiqué dans le pointage ; l'équipe du rapport suit le pointage.
 *  - Une ligne vide (sans lieu, commentaire ni photo) qui ne correspond plus au pointage est retirée ;
 *    une ligne déjà renseignée est conservée.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;
const WORKED = ["present", "repos_travaille"];
/** Gardiens : suivis au pointage, jamais repris dans les rapports journaliers (fonction habituelle ou du jour). */
const isGardien = (...positions: (string | null | undefined)[]) => positions.includes("gardien");

export type SyncResult = { cleaningAgents: number; collectionTeams: number; warnings: { key: string; vars?: Record<string, string | number> }[] };

async function photoCounts(supabase: Supabase, entityType: string, ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!ids.length) return counts;
  const { data } = await supabase.from("photos").select("entity_id").eq("entity_type", entityType).in("entity_id", ids);
  for (const p of data ?? []) counts.set(p.entity_id, (counts.get(p.entity_id) ?? 0) + 1);
  return counts;
}

export async function syncCleaningReport(supabase: Supabase, date: string): Promise<number> {
  const { data: att, error } = await supabase
    .from("attendance")
    .select("employee_id, position")
    .eq("activity_date", date)
    .eq("team_type", "nettoiement")
    .in("status", WORKED);
  if (error) throw new Error(error.message);
  const ids = Array.from(new Set((att ?? []).map((a) => a.employee_id as string)));
  const { data: perm } = ids.length ? await supabase.from("employees").select("id, position").in("id", ids) : { data: [] };
  const permPos = new Map((perm ?? []).map((e) => [e.id as string, e.position as string]));
  const worked = ids.filter((id) => !(att ?? []).some((a) => a.employee_id === id && isGardien(a.position as string, permPos.get(id))));

  let { data: report } = await supabase.from("cleaning_reports").select("id").eq("activity_date", date).maybeSingle();
  if (!report) {
    if (!worked.length) return 0;
    const created = await supabase.from("cleaning_reports").insert({ activity_date: date }).select("id").single();
    if (created.error) throw new Error(created.error.message);
    report = created.data;
  }

  const { data: agents } = await supabase.from("cleaning_report_agents").select("id, employee_id, location, comment, manual, excluded").eq("report_id", report.id);
  const existing = agents ?? [];
  const known = new Set(existing.map((a) => a.employee_id as string));

  const toAdd = worked.filter((id) => !known.has(id));
  if (toAdd.length) {
    const { data: emps } = await supabase.from("employees").select("id, order_number").in("id", toAdd);
    const { error: e2 } = await supabase
      .from("cleaning_report_agents")
      .insert((emps ?? []).map((e) => ({ report_id: report.id, activity_date: date, employee_id: e.id, sort_order: e.order_number })));
    if (e2) throw new Error(e2.message);
  }

  // Lignes automatiques vides qui ne correspondent plus au pointage
  const workedSet = new Set(worked);
  const stale = existing.filter((a) => !a.manual && !a.excluded && !workedSet.has(a.employee_id) && !a.location && !a.comment);
  const photos = await photoCounts(supabase, "cleaning_report_agent", stale.map((a) => a.id));
  const removable = stale.filter((a) => !photos.get(a.id)).map((a) => a.id);
  if (removable.length) await supabase.from("cleaning_report_agents").delete().in("id", removable);

  return worked.length;
}

type AttRow = { employee_id: string; position: string; status: string; chauffeur_id: string | null; replacing_employee_id: string | null; truck_id: string | null };

export async function syncCollectionReports(supabase: Supabase, date: string): Promise<{ teams: number; warnings: SyncResult["warnings"] }> {
  const warnings: SyncResult["warnings"] = [];
  const [{ data: att, error }, { data: chauffeurs }, { data: trucks }] = await Promise.all([
    supabase.from("attendance").select("employee_id, position, status, chauffeur_id, replacing_employee_id, truck_id").eq("activity_date", date).eq("team_type", "collecte"),
    supabase.from("employees").select("id, last_name, first_name, truck_id, position"),
    supabase.from("trucks").select("id, matricule"),
  ]);
  if (error) throw new Error(error.message);
  const rows = (att ?? []) as AttRow[];
  const plates = new Map((trucks ?? []).map((tr) => [tr.id, tr.matricule as string]));

  // Équipes du jour, d'après le pointage
  type Team = { truckId: string; chauffeurId: string; crew: string[] };
  const teams = new Map<string, Team>();
  // Chefs d'équipe du jour : chauffeurs titulaires (fiche) ou employés pointés « Chauffeur » ce jour,
  // et toute personne à laquelle des équipiers sont rattachés dans le pointage.
  const empById = new Map((chauffeurs ?? []).map((e) => [e.id as string, e]));
  const heads = new Set<string>([
    ...(chauffeurs ?? []).filter((e) => e.position === "chauffeur").map((e) => e.id as string),
    ...rows.filter((r) => r.position === "chauffeur").map((r) => r.employee_id),
    ...rows.map((r) => r.chauffeur_id).filter((x): x is string => !!x),
  ]);
  for (const headId of heads) {
    const titular = empById.get(headId);
    if (!titular) continue;
    const teamRows = rows.filter((r) => r.employee_id === titular.id || r.chauffeur_id === titular.id);
    const worked = teamRows.filter((r) => WORKED.includes(r.status));
    const driver = worked.find((r) => r.employee_id === titular.id && (r.position === "chauffeur" || r.position === "chauffeur_remplacant")) ?? worked.find((r) => r.position === "chauffeur_remplacant" || r.position === "chauffeur");
    if (!driver) continue; // l'équipe n'a pas travaillé (ou n'a pas de chauffeur ce jour)
    const truckId = driver.truck_id ?? titular.truck_id;
    const name = `${titular.last_name} ${titular.first_name}`;
    if (!truckId) {
      warnings.push({ key: "Équipe {name} : aucun camion indiqué dans le pointage, rapport non créé.", vars: { name } });
      continue;
    }
    if (teams.has(truckId)) {
      warnings.push({ key: "Le camion {plate} est indiqué pour deux équipes : vérifiez le pointage.", vars: { plate: plates.get(truckId) ?? "?" } });
      continue;
    }
    const crew = Array.from(new Set(worked.filter((r) => r.position !== "chauffeur" && r.position !== "chauffeur_remplacant" && !isGardien(r.position, empById.get(r.employee_id)?.position as string)).map((r) => r.employee_id)));
    teams.set(truckId, { truckId, chauffeurId: driver.employee_id, crew });
  }

  // Rapports corrigés à la main dans le rapport (camion, chauffeur ou équipe) : jamais écrasés
  const { data: manualRows } = await supabase.from("collection_reports").select("id, truck_id, chauffeur_id").eq("activity_date", date).eq("manual_team", true);
  const manual = manualRows ?? [];

  for (const team of teams.values()) {
    if (manual.some((m) => m.truck_id === team.truckId || m.chauffeur_id === team.chauffeurId)) continue;
    const { data: report, error: e1 } = await supabase
      .from("collection_reports")
      .upsert({ activity_date: date, truck_id: team.truckId, chauffeur_id: team.chauffeurId }, { onConflict: "activity_date,truck_id" })
      .select("id")
      .single();
    if (e1) throw new Error(e1.message);
    // Équipe : seuls les équipiers ajoutés / retirés sont écrits (journal des modifications sans doublon)
    const { data: oldCrew } = await supabase.from("collection_report_rippers").select("employee_id").eq("report_id", report.id);
    const before = new Set((oldCrew ?? []).map((x) => x.employee_id as string));
    const after = new Set(team.crew);
    const removed = [...before].filter((id) => !after.has(id));
    const added = [...after].filter((id) => !before.has(id));
    if (removed.length) await supabase.from("collection_report_rippers").delete().eq("report_id", report.id).in("employee_id", removed);
    if (added.length) {
      const { error: e2 } = await supabase.from("collection_report_rippers").insert(added.map((employee_id) => ({ report_id: report.id, employee_id })));
      if (e2) throw new Error(e2.message);
    }
    // Ligne camion du Matin : même chauffeur et même équipe (la ligne du Soir garde sa propre équipe)
    await syncMorningLine(supabase, { date, truckId: team.truckId, chauffeurId: team.chauffeurId, crew: team.crew });
  }

  // Rapports du jour dont le camion n'est plus utilisé (camion échangé) : retirés s'ils sont vides
  const { data: existing } = await supabase.from("collection_reports").select("id, truck_id, sectors, observations, manual_team").eq("activity_date", date);
  const orphans = (existing ?? []).filter((r) => !teams.has(r.truck_id) && !r.manual_team);
  const photos = await photoCounts(supabase, "collection_report", orphans.map((r) => r.id));
  for (const r of orphans) {
    if (r.sectors || r.observations || photos.get(r.id)) {
      warnings.push({ key: "Le rapport du camion {plate} est conservé (lieux ou photos déjà saisis) bien que ce camion ne figure plus au pointage.", vars: { plate: plates.get(r.truck_id) ?? "?" } });
      continue;
    }
    await supabase.from("collection_reports").delete().eq("id", r.id);
    const { data: tr } = await supabase.from("truck_daily_reports").select("id, loads, km, km_start, km_end, fuel").eq("activity_date", date).eq("truck_id", r.truck_id).eq("shift", "matin").eq("line_no", 1).maybeSingle();
    if (tr && !(tr.loads as unknown[] | null)?.length && tr.km == null && tr.km_start == null && tr.km_end == null && tr.fuel == null) {
      await supabase.from("truck_daily_reports").delete().eq("id", tr.id);
    }
  }

  return { teams: teams.size, warnings };
}

/**
 * Employés repris dans les rapports journaliers d'une date, d'après le pointage :
 * jour travaillé (Présent, Jour de repos travaillé) dans l'équipe du jour, Gardiens exclus
 * (fonction habituelle ou du jour). collecte : employé → fonction du jour (1re ligne).
 */
export async function reportEligibility(supabase: Supabase, date: string): Promise<{ nettoiement: Set<string>; collecte: Map<string, string> }> {
  const { data: att, error } = await supabase.from("attendance").select("employee_id, team_type, position, status, shift").eq("activity_date", date).in("status", WORKED).order("shift");
  if (error) throw new Error(error.message);
  const ids = Array.from(new Set((att ?? []).map((a) => a.employee_id as string)));
  const { data: perm } = ids.length ? await supabase.from("employees").select("id, position").in("id", ids) : { data: [] };
  const permPos = new Map((perm ?? []).map((e) => [e.id as string, e.position as string]));
  const gardiens = new Set((att ?? []).filter((a) => isGardien(a.position as string, permPos.get(a.employee_id as string))).map((a) => a.employee_id as string));
  const nettoiement = new Set<string>();
  const collecte = new Map<string, string>();
  for (const a of att ?? []) {
    const id = a.employee_id as string;
    if (gardiens.has(id)) continue;
    if (a.team_type === "nettoiement") nettoiement.add(id);
    else if (!collecte.has(id)) collecte.set(id, a.position as string);
  }
  return { nettoiement, collecte };
}

/** Équipiers proposés dans un rapport de collecte : pointés à la Collecte ce jour, hors chauffeurs et Gardiens. */
export async function collecteCrewCandidates(supabase: Supabase, date: string): Promise<{ employee_id: string; day_position: string }[]> {
  const { collecte } = await reportEligibility(supabase, date);
  return [...collecte.entries()].filter(([, pos]) => pos !== "chauffeur" && pos !== "chauffeur_remplacant").map(([employee_id, day_position]) => ({ employee_id, day_position }));
}
