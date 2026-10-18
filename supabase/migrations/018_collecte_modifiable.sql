-- =============================================================================
-- 018 — Rapport de collecte modifiable toute la journée, traçabilité
--
--  * manual_team : le camion, le chauffeur ou l'équipe ont été corrigés dans le
--    rapport lui-même ; la mise à jour depuis le pointage ne les écrase plus et ne
--    supprime plus ce rapport.
--  * record_audit_info() : création / dernière modification (qui, quand) et photos
--    ajoutées / retirées d'une liste d'enregistrements, lues dans le journal d'audit
--    avec les droits du module concerné (journal lui-même réservé à l'administrateur).
-- =============================================================================

alter table public.collection_reports add column if not exists manual_team boolean not null default false;

create or replace function public.record_audit_info(p_table text, p_ids uuid[])
returns table (
  record_id        uuid,
  created_at       timestamptz,
  created_by_email text,
  updated_at       timestamptz,
  updated_by_email text,
  photos_added     integer,
  photos_removed   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_module public.app_module;
  v_entity text;
begin
  select m, e into v_module, v_entity from (values
    ('collection_reports', 'rapport_journalier'::public.app_module, 'collection_report'),
    ('cleaning_report_agents', 'rapport_journalier'::public.app_module, 'cleaning_report_agent'),
    ('green_waste_entries', 'dechet_vert'::public.app_module, 'green_waste'),
    ('work_tasks', 'programme'::public.app_module, 'work_task'),
    ('warnings', 'avertissements'::public.app_module, 'warning'),
    ('truck_daily_reports', 'rapport_camions'::public.app_module, 'truck_report'),
    ('truck_repairs', 'rapport_camions'::public.app_module, 'truck_repair'),
    ('fuel_entries', 'rapport_camions'::public.app_module, 'fuel_entry')
  ) v(tbl, m, e) where v.tbl = p_table;
  if v_module is null then
    raise exception 'TABLE_INCONNUE: %', p_table;
  end if;
  if not public.can_view(v_module) then
    raise exception 'ACCES_REFUSE: historique non autorisé.';
  end if;

  return query
  select i.id,
         (select l.created_at from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'INSERT' order by l.created_at limit 1),
         (select l.user_email from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'INSERT' order by l.created_at limit 1),
         (select l.created_at from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'UPDATE' order by l.created_at desc limit 1),
         (select l.user_email from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'UPDATE' order by l.created_at desc limit 1),
         (select count(*)::int from public.audit_log l where l.table_name = 'photos' and l.action = 'INSERT' and l.new_data ->> 'entity_type' = v_entity and l.new_data ->> 'entity_id' = i.id::text),
         (select count(*)::int from public.audit_log l where l.table_name = 'photos' and l.action = 'DELETE' and l.old_data ->> 'entity_type' = v_entity and l.old_data ->> 'entity_id' = i.id::text)
    from unnest(p_ids) as i(id);
end;
$$;
grant execute on function public.record_audit_info(text, uuid[]) to authenticated;
