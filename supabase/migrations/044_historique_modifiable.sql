-- =============================================================================
-- 044 — Historique modifiable : feuilles et rapports par date, journal des modifications
--
--  Aucune donnée n'est modifiée : les feuilles de présence et les rapports sont déjà enregistrés
--  ligne par ligne et par date (jamais remplacés par une autre date), et chaque création /
--  modification / suppression est déjà journalisée dans audit_log (utilisateur, date, valeurs
--  avant / après). Cette migration ajoute seulement des fonctions de lecture :
--   - attendance_sheets_summary  : feuilles de présence par date et par équipe (historique) ;
--   - daily_reports_summary      : rapports journaliers par date (historique) ;
--   - record_changes             : journal détaillé d'un rapport (champ, avant, après, qui, quand) ;
--   - record_change_summary      : indicateur « modifié » + dernière modification par enregistrement.
--  Un enregistrement sans changement réel (même valeurs) n'est pas compté comme une modification.
-- =============================================================================

-- Recherche du journal par date d'activité (feuilles et rapports d'une date)
create index if not exists audit_log_activity_date_idx
  on public.audit_log (table_name, (coalesce(new_data, old_data) ->> 'activity_date'));

-- Vrai changement : suppression, ou modification d'au moins un champ métier
create or replace function public.audit_real_change(p_action text, p_old jsonb, p_new jsonb)
returns boolean
language sql
immutable
as $$
  select p_action = 'DELETE'
      or (p_action = 'UPDATE'
          and (coalesce(p_old, '{}'::jsonb) - array['updated_at', 'updated_by', 'created_at', 'created_by'])
              is distinct from
              (coalesce(p_new, '{}'::jsonb) - array['updated_at', 'updated_by', 'created_at', 'created_by']));
$$;

-- ---------- Feuilles de présence par date et par équipe ------------------------------------------
create or replace function public.attendance_sheets_summary(p_from date, p_to date)
returns table (
  activity_date date,
  team_type     text,
  rows_count    integer,
  worked_count  integer,
  last_at       timestamptz,
  last_user     text,
  modified      boolean,
  closed        boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view('pointage') then
    raise exception 'ACCES_REFUSE: consultation du pointage non autorisée.';
  end if;
  return query
  with s as (
    select a.activity_date d, a.team_type::text team, count(*)::int n,
           count(*) filter (where a.status::text in ('present', 'repos_travaille'))::int worked
      from public.attendance a
     where a.activity_date between p_from and p_to
     group by 1, 2
  ), l as (
    select (coalesce(x.new_data, x.old_data) ->> 'activity_date')::date d,
           coalesce(x.new_data ->> 'team_type', x.old_data ->> 'team_type') team,
           bool_or(public.audit_real_change(x.action, x.old_data, x.new_data)) modified,
           max(x.created_at) last_at,
           (array_agg(x.user_email order by x.created_at desc))[1] last_user
      from public.audit_log x
     where x.table_name = 'attendance'
       and coalesce(x.new_data, x.old_data) ->> 'activity_date' between p_from::text and p_to::text
     group by 1, 2
  )
  select coalesce(s.d, l.d), coalesce(s.team, l.team), coalesce(s.n, 0), coalesce(s.worked, 0),
         l.last_at, l.last_user, coalesce(l.modified, false),
         exists (select 1 from public.work_days w where w.activity_date = coalesce(s.d, l.d) and w.status::text = 'closed')
    from s full join l on l.d = s.d and l.team = s.team
   order by 1 desc, 2;
end;
$$;
grant execute on function public.attendance_sheets_summary(date, date) to authenticated;

-- ---------- Rapports journaliers par date -----------------------------------------------------
create or replace function public.daily_reports_summary(p_from date, p_to date)
returns table (
  activity_date     date,
  cleaning_agents   integer,
  collection_count  integer,
  truck_lines       integer,
  tonnage           numeric,
  summary_rows      integer,
  last_at           timestamptz,
  last_user         text,
  modified          boolean,
  closed            boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.can_view('rapport_journalier') or public.can_view('rapport_camions')) then
    raise exception 'ACCES_REFUSE: consultation des rapports non autorisée.';
  end if;
  return query
  with d as (
    select r.activity_date d from public.cleaning_reports r where r.activity_date between p_from and p_to
    union select c.activity_date from public.collection_reports c where c.activity_date between p_from and p_to
    union select t.activity_date from public.truck_daily_reports t where t.activity_date between p_from and p_to
    union select g.activity_date from public.cleaning_daily_summary g where g.activity_date between p_from and p_to
  ), l as (
    select (coalesce(x.new_data, x.old_data) ->> 'activity_date')::date d,
           bool_or(public.audit_real_change(x.action, x.old_data, x.new_data)) modified,
           max(x.created_at) last_at,
           (array_agg(x.user_email order by x.created_at desc))[1] last_user
      from public.audit_log x
     where x.table_name in ('cleaning_reports', 'cleaning_report_agents', 'collection_reports', 'truck_daily_reports', 'cleaning_daily_summary')
       and coalesce(x.new_data, x.old_data) ->> 'activity_date' between p_from::text and p_to::text
     group by 1
  )
  select d.d,
         (select count(*)::int from public.cleaning_report_agents a where a.activity_date = d.d and not a.excluded),
         (select count(*)::int from public.collection_reports c where c.activity_date = d.d),
         (select count(*)::int from public.truck_daily_reports t where t.activity_date = d.d),
         (select coalesce(sum(t.tonnage_total), 0) from public.truck_daily_reports t where t.activity_date = d.d),
         (select count(*)::int from public.cleaning_daily_summary g where g.activity_date = d.d),
         l.last_at, l.last_user, coalesce(l.modified, false),
         exists (select 1 from public.work_days w where w.activity_date = d.d and w.status::text = 'closed')
    from d left join l on l.d = d.d
   order by 1 desc;
end;
$$;
grant execute on function public.daily_reports_summary(date, date) to authenticated;

-- ---------- Journal détaillé d'un rapport ------------------------------------------------------
create or replace function public.audit_table_module(p_table text)
returns text
language sql
immutable
as $$
  select case p_table
    when 'attendance' then 'pointage'
    when 'cleaning_reports' then 'rapport_journalier'
    when 'cleaning_report_agents' then 'rapport_journalier'
    when 'collection_reports' then 'rapport_journalier'
    when 'collection_report_rippers' then 'rapport_journalier'
    when 'cleaning_daily_summary' then 'rapport_journalier'
    when 'truck_daily_reports' then 'rapport_camions'
  end;
$$;

-- Équipiers d'un rapport de collecte : ajouts et retraits journalisés (journal du rapport)
drop trigger if exists collection_report_rippers_audit on public.collection_report_rippers;
create trigger collection_report_rippers_audit after insert or delete on public.collection_report_rippers
  for each row execute function public.audit_trigger();

-- Par identifiants (p_ids, ou rapport parent : report_id) et / ou par date d'activité (p_date) ; les enregistrements sans
-- changement réel sont omis. Du plus récent au plus ancien.
create or replace function public.record_changes(p_table text, p_ids uuid[] default null, p_date date default null)
returns table (record_id text, at timestamptz, action text, user_email text, old_data jsonb, new_data jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_module text := public.audit_table_module(p_table);
begin
  if v_module is null then
    raise exception 'TABLE_INCONNUE: %', p_table;
  end if;
  if not public.can_view(v_module::public.app_module) then
    raise exception 'ACCES_REFUSE: historique non autorisé.';
  end if;
  return query
  select l.record_id, l.created_at, l.action, l.user_email, l.old_data, l.new_data
    from public.audit_log l
   where l.table_name = p_table
     and ((p_ids is not null and (l.record_id = any (p_ids::text[]) or coalesce(l.new_data, l.old_data) ->> 'report_id' = any (p_ids::text[])))
       or (p_date is not null and coalesce(l.new_data, l.old_data) ->> 'activity_date' = p_date::text))
     and (l.action in ('INSERT', 'DELETE') or public.audit_real_change(l.action, l.old_data, l.new_data))
   order by l.created_at desc
   limit 500;
end;
$$;
grant execute on function public.record_changes(text, uuid[], date) to authenticated;

-- Indicateur « modifié » et dernière modification réelle, par enregistrement
create or replace function public.record_change_summary(p_table text, p_ids uuid[])
returns table (record_id text, modified boolean, last_at timestamptz, last_user text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_module text := public.audit_table_module(p_table);
begin
  if v_module is null then
    raise exception 'TABLE_INCONNUE: %', p_table;
  end if;
  if not public.can_view(v_module::public.app_module) then
    raise exception 'ACCES_REFUSE: historique non autorisé.';
  end if;
  return query
  select l.record_id,
         bool_or(public.audit_real_change(l.action, l.old_data, l.new_data)),
         max(l.created_at) filter (where l.action = 'INSERT' or public.audit_real_change(l.action, l.old_data, l.new_data)),
         (array_agg(l.user_email order by l.created_at desc) filter (where l.action = 'INSERT' or public.audit_real_change(l.action, l.old_data, l.new_data)))[1]
    from public.audit_log l
   where l.table_name = p_table and l.record_id = any (p_ids::text[])
   group by l.record_id;
end;
$$;
grant execute on function public.record_change_summary(text, uuid[]) to authenticated;
