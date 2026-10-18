-- =============================================================================
-- 017 — Rapport camions : poste Matin / Soir, vidages multiples, photos par ligne
--
--  * shift (matin | soir) et line_no : un camion peut avoir plusieurs lignes le même
--    jour (une ou plusieurs le matin, une ou plusieurs le soir). L'unicité passe de
--    (date, camion) à (date, camion, poste, n° de ligne). Lignes existantes : Matin, n° 1.
--  * loads : liste des vidages [{ticket, tonnage}], autant que nécessaire.
--    Calcul automatique (trigger) : dumps_count = nombre de tonnages > 0,
--    tonnage_total = somme. Correction manuelle de dumps_count seulement si
--    dumps_override (réservée à l'administrateur par l'application).
--    Compatibilité : ticket1/tonnage1/ticket2/tonnage2 restent alimentés avec les
--    deux premiers vidages ; une écriture « ancienne » de ces colonnes reconstruit loads.
--  * Photos des lignes : entity_type « truck_report », droits du module camions.
-- =============================================================================

alter table public.truck_daily_reports add column if not exists shift text not null default 'matin';
alter table public.truck_daily_reports drop constraint if exists truck_reports_shift_chk;
alter table public.truck_daily_reports add constraint truck_reports_shift_chk check (shift in ('matin', 'soir'));
alter table public.truck_daily_reports add column if not exists line_no integer not null default 1 check (line_no >= 1);
alter table public.truck_daily_reports add column if not exists loads jsonb not null default '[]'::jsonb;
alter table public.truck_daily_reports add column if not exists tonnage_total numeric(10,2) not null default 0;
alter table public.truck_daily_reports add column if not exists dumps_override boolean not null default false;

-- Unicité : (date, camion) -> (date, camion, poste, n° de ligne)
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
     where con.conrelid = 'public.truck_daily_reports'::regclass and con.contype = 'u'
       and (select array_agg(att.attname::text order by att.attname) from unnest(con.conkey) k join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k)
           = array['activity_date', 'truck_id']
  loop
    execute format('alter table public.truck_daily_reports drop constraint %I', c);
  end loop;
end $$;
alter table public.truck_daily_reports drop constraint if exists truck_reports_line_uniq;
alter table public.truck_daily_reports add constraint truck_reports_line_uniq unique (activity_date, truck_id, shift, line_no);
create index if not exists truck_reports_day_idx on public.truck_daily_reports (activity_date, truck_id);

-- Calcul des vidages et du tonnage, compatibilité avec les colonnes ticket1..tonnage2
create or replace function public.truck_report_loads()
returns trigger
language plpgsql
as $$
declare
  legacy_changed boolean := false;
  arr jsonb := '[]'::jsonb;
  item jsonb;
  ton numeric;
begin
  if tg_op = 'UPDATE' then
    legacy_changed := new.loads is not distinct from old.loads
      and (new.ticket1 is distinct from old.ticket1 or new.tonnage1 is distinct from old.tonnage1
           or new.ticket2 is distinct from old.ticket2 or new.tonnage2 is distinct from old.tonnage2);
  else
    legacy_changed := coalesce(jsonb_array_length(new.loads), 0) = 0
      and (coalesce(new.ticket1, '') <> '' or new.tonnage1 is not null or coalesce(new.ticket2, '') <> '' or new.tonnage2 is not null);
  end if;

  if legacy_changed then
    -- Écriture par les anciennes colonnes : on reconstruit la liste en gardant les vidages au-delà du 2e
    if coalesce(new.ticket1, '') <> '' or new.tonnage1 is not null then
      arr := arr || jsonb_build_array(jsonb_build_object('ticket', coalesce(new.ticket1, ''), 'tonnage', new.tonnage1));
    end if;
    if coalesce(new.ticket2, '') <> '' or new.tonnage2 is not null then
      arr := arr || jsonb_build_array(jsonb_build_object('ticket', coalesce(new.ticket2, ''), 'tonnage', new.tonnage2));
    end if;
    if tg_op = 'UPDATE' and jsonb_array_length(old.loads) > 2 then
      for i in 2 .. jsonb_array_length(old.loads) - 1 loop
        arr := arr || jsonb_build_array(old.loads -> i);
      end loop;
    end if;
    new.loads := arr;
  end if;

  -- Normalisation : garder les vidages avec un ticket ou un tonnage
  arr := '[]'::jsonb;
  for item in select * from jsonb_array_elements(coalesce(new.loads, '[]'::jsonb)) loop
    ton := nullif(item ->> 'tonnage', '')::numeric;
    if coalesce(item ->> 'ticket', '') <> '' or ton is not null then
      arr := arr || jsonb_build_array(jsonb_build_object('ticket', coalesce(item ->> 'ticket', ''), 'tonnage', ton));
    end if;
  end loop;
  new.loads := arr;

  new.ticket1  := coalesce(arr -> 0 ->> 'ticket', '');
  new.tonnage1 := nullif(arr -> 0 ->> 'tonnage', '')::numeric;
  new.ticket2  := coalesce(arr -> 1 ->> 'ticket', '');
  new.tonnage2 := nullif(arr -> 1 ->> 'tonnage', '')::numeric;
  new.tonnage_total := coalesce((select sum((e ->> 'tonnage')::numeric) from jsonb_array_elements(arr) e where (e ->> 'tonnage')::numeric > 0), 0);
  if not new.dumps_override then
    new.dumps_count := (select count(*) from jsonb_array_elements(arr) e where (e ->> 'tonnage')::numeric > 0);
  end if;
  return new;
end;
$$;
drop trigger if exists truck_reports_loads on public.truck_daily_reports;
create trigger truck_reports_loads before insert or update on public.truck_daily_reports
  for each row execute function public.truck_report_loads();

-- Reprise des lignes existantes : les deux tickets deviennent des vidages ; le nombre de
-- vidages déjà saisi est conservé s'il diffère du calcul (marqué comme correction)
update public.truck_daily_reports r
   set dumps_override = r.dumps_count <> ((case when r.tonnage1 > 0 then 1 else 0 end) + (case when r.tonnage2 > 0 then 1 else 0 end)),
       loads = (
         select coalesce(jsonb_agg(x), '[]'::jsonb) from (
           select jsonb_build_object('ticket', coalesce(r.ticket1, ''), 'tonnage', r.tonnage1) x where coalesce(r.ticket1, '') <> '' or r.tonnage1 is not null
           union all
           select jsonb_build_object('ticket', coalesce(r.ticket2, ''), 'tonnage', r.tonnage2) where coalesce(r.ticket2, '') <> '' or r.tonnage2 is not null
         ) s
       );

-- Photos des lignes du rapport camions
create or replace function public.photo_module(p_entity text)
returns public.app_module
language sql
immutable
as $$
  select case p_entity
    when 'cleaning_report_agent' then 'rapport_journalier'::public.app_module
    when 'collection_report'     then 'rapport_journalier'::public.app_module
    when 'warning'               then 'avertissements'::public.app_module
    when 'green_waste'           then 'dechet_vert'::public.app_module
    when 'work_task'             then 'programme'::public.app_module
    when 'fuel_entry'            then 'rapport_camions'::public.app_module
    when 'truck_repair'          then 'rapport_camions'::public.app_module
    when 'truck_report'          then 'rapport_camions'::public.app_module
    else 'rapport_journalier'::public.app_module
  end;
$$;
