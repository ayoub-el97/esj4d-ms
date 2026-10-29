import "server-only";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Équipiers d'une ligne camion (Matin ou Soir) : seuls les employés ajoutés / retirés sont écrits
 * (journal des modifications sans doublon). Le chauffeur de la ligne n'est jamais compté équipier.
 */
export async function setLineCrew(supabase: Db, lineId: string, employeeIds: string[], chauffeurId?: string | null): Promise<{ changed: boolean }> {
  const wanted = new Set(employeeIds.filter((id) => id && id !== chauffeurId));
  const { data: cur, error } = await supabase.from("truck_report_crew").select("employee_id").eq("report_id", lineId);
  if (error) throw new Error(error.message);
  const before = new Set<string>((cur ?? []).map((x: { employee_id: string }) => x.employee_id));
  const removed = [...before].filter((id) => !wanted.has(id));
  const added = [...wanted].filter((id) => !before.has(id));
  if (removed.length) {
    const { error: e } = await supabase.from("truck_report_crew").delete().eq("report_id", lineId).in("employee_id", removed);
    if (e) throw new Error(e.message);
  }
  if (added.length) {
    const { error: e } = await supabase.from("truck_report_crew").insert(added.map((employee_id) => ({ report_id: lineId, employee_id })));
    if (e) throw new Error(e.message);
  }
  return { changed: removed.length + added.length > 0 };
}

/**
 * Ligne Matin n° 1 d'un camion, alimentée par le rapport de collecte / le pointage : chauffeur et
 * équipe. Si l'équipe a été corrigée dans le rapport camions (crew_manual), elle n'est plus écrasée.
 * La ligne du Soir n'est jamais touchée.
 */
export async function syncMorningLine(supabase: Db, v: { date: string; truckId: string; chauffeurId: string | null; crew: string[] }): Promise<void> {
  const { data: line } = await supabase.from("truck_daily_reports").select("id, crew_manual").eq("activity_date", v.date).eq("truck_id", v.truckId).eq("shift", "matin").eq("line_no", 1).maybeSingle();
  if (line?.crew_manual) return;
  const crew = [...new Set(v.crew)].filter((id) => id !== v.chauffeurId);
  const { data: up, error } = await supabase
    .from("truck_daily_reports")
    .upsert({ activity_date: v.date, truck_id: v.truckId, shift: "matin", line_no: 1, chauffeur_id: v.chauffeurId, rippers_count: crew.length }, { onConflict: "activity_date,truck_id,shift,line_no" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await setLineCrew(supabase, up.id, crew, v.chauffeurId);
}
