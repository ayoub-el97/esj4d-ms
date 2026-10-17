import "server-only";
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
    .select("employee_id")
    .eq("activity_date", date)
    .eq("team_type", "nettoiement")
    .in("status", WORKED);
  if (error) throw new Error(error.message);
  const worked = Array.from(new Set((att ?? []).map((a) => a.employee_id as string)));

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
    supabase.from("employees").select("id, last_name, first_name, truck_id").eq("position", "chauffeur"),
    supabase.from("trucks").select("id, matricule"),
  ]);
  if (error) throw new Error(error.message);
  const rows = (att ?? []) as AttRow[];
  const plates = new Map((trucks ?? []).map((tr) => [tr.id, tr.matricule as string]));

  // Équipes du jour, d'après le pointage
  type Team = { truckId: string; chauffeurId: string; crew: string[] };
  const teams = new Map<string, Team>();
  for (const titular of chauffeurs ?? []) {
    const teamRows = rows.filter((r) => r.employee_id === titular.id || r.chauffeur_id === titular.id);
    const worked = teamRows.filter((r) => WORKED.includes(r.status));
    const driver = worked.find((r) => r.employee_id === titular.id) ?? worked.find((r) => r.position === "chauffeur_remplacant");
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
    const crew = Array.from(new Set(worked.filter((r) => r.position !== "chauffeur" && r.position !== "chauffeur_remplacant").map((r) => r.employee_id)));
    teams.set(truckId, { truckId, chauffeurId: driver.employee_id, crew });
  }

  for (const team of teams.values()) {
    const { data: report, error: e1 } = await supabase
      .from("collection_reports")
      .upsert({ activity_date: date, truck_id: team.truckId, chauffeur_id: team.chauffeurId }, { onConflict: "activity_date,truck_id" })
      .select("id")
      .single();
    if (e1) throw new Error(e1.message);
    await supabase.from("collection_report_rippers").delete().eq("report_id", report.id);
    if (team.crew.length) {
      const { error: e2 } = await supabase.from("collection_report_rippers").insert(team.crew.map((employee_id) => ({ report_id: report.id, employee_id })));
      if (e2) throw new Error(e2.message);
    }
    const { error: e3 } = await supabase
      .from("truck_daily_reports")
      .upsert({ activity_date: date, truck_id: team.truckId, chauffeur_id: team.chauffeurId, rippers_count: team.crew.length }, { onConflict: "activity_date,truck_id" });
    if (e3) throw new Error(e3.message);
  }

  // Rapports du jour dont le camion n'est plus utilisé (camion échangé) : retirés s'ils sont vides
  const { data: existing } = await supabase.from("collection_reports").select("id, truck_id, sectors, observations").eq("activity_date", date);
  const orphans = (existing ?? []).filter((r) => !teams.has(r.truck_id));
  const photos = await photoCounts(supabase, "collection_report", orphans.map((r) => r.id));
  for (const r of orphans) {
    if (r.sectors || r.observations || photos.get(r.id)) {
      warnings.push({ key: "Le rapport du camion {plate} est conservé (lieux ou photos déjà saisis) bien que ce camion ne figure plus au pointage.", vars: { plate: plates.get(r.truck_id) ?? "?" } });
      continue;
    }
    await supabase.from("collection_reports").delete().eq("id", r.id);
    const { data: tr } = await supabase.from("truck_daily_reports").select("id, ticket1, ticket2, tonnage1, tonnage2, km, km_start, km_end, fuel").eq("activity_date", date).eq("truck_id", r.truck_id).maybeSingle();
    if (tr && !tr.ticket1 && !tr.ticket2 && tr.tonnage1 == null && tr.tonnage2 == null && tr.km == null && tr.km_start == null && tr.km_end == null && tr.fuel == null) {
      await supabase.from("truck_daily_reports").delete().eq("id", tr.id);
    }
  }

  return { teams: teams.size, warnings };
}
