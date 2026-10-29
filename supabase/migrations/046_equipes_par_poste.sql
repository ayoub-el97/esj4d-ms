-- =============================================================================
-- 046 — Rapport camions : équipe propre à chaque poste (Matin / Soir)
--
--  Un même camion peut travailler le matin et le soir avec des équipes différentes. Jusqu'ici,
--  l'équipe affichée pour chaque ligne camion venait du rapport de collecte du jour (une seule
--  équipe par camion et par jour) : la ligne du Soir montrait l'équipe du Matin.
--
--  Désormais chaque ligne camion (Matin ou Soir, truck_daily_reports) a :
--   - son chauffeur (colonne existante chauffeur_id) ;
--   - ses équipiers (nouvelle table truck_report_crew : employés de la base, sans doublon,
--     fonction au moment de l'affectation conservée) ;
--   - son tonnage, ses vidages, ses km (colonnes existantes).
--  La ligne du Soir n'hérite jamais de l'équipe du Matin.
--  La ligne Matin n° 1 suit le rapport de collecte / le pointage tant que son équipe n'a pas été
--  corrigée dans le rapport camions (crew_manual).
--  Reprise : l'équipe actuelle de chaque rapport de collecte est copiée sur la ligne Matin n° 1
--  du même camion et du même jour (aucune équipe inventée pour le Soir). Aucune donnée supprimée.
-- =============================================================================

alter table public.truck_daily_reports add column if not exists crew_manual boolean not null default false;

create table if not exists public.truck_report_crew (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references public.truck_daily_reports (id) on delete cascade,
  activity_date  date not null,
  employee_id    uuid not null references public.employees (id) on delete restrict,
  -- fonction de l'employé au moment de l'affectation (historique conservé)
  position       text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  unique (report_id, employee_id)
);
create index if not exists truck_report_crew_employee_idx on public.truck_report_crew (employee_id, activity_date);

-- ---------- Reprise de l'équipe du Matin (avant les contrôles de journée clôturée) --------------
insert into public.truck_report_crew (report_id, activity_date, employee_id, position)
select t.id, t.activity_date, r.employee_id,
       coalesce((select a.position::text from public.attendance a
                  where a.employee_id = r.employee_id and a.activity_date = t.activity_date and a.shift = 1 limit 1), e.position::text)
  from public.truck_daily_reports t
  join public.collection_reports c on c.activity_date = t.activity_date and c.truck_id = t.truck_id
  join public.collection_report_rippers r on r.report_id = c.id
  join public.employees e on e.id = r.employee_id
 where t.shift = 'matin' and t.line_no = 1 and r.employee_id is distinct from t.chauffeur_id
on conflict (report_id, employee_id) do nothing;

-- ---------- Date et fonction reprises de la ligne et de la fiche ----------------------------
create or replace function public.truck_report_crew_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select t.activity_date into new.activity_date from public.truck_daily_reports t where t.id = new.report_id;
  if coalesce(new.position, '') = '' then
    select coalesce((select a.position::text from public.attendance a where a.employee_id = new.employee_id and a.activity_date = new.activity_date and a.shift = 1 limit 1), e.position::text)
      into new.position from public.employees e where e.id = new.employee_id;
  end if;
  return new;
end;
$$;

-- Nombre de rippeurs de la ligne = nombre d'équipiers nommés
create or replace function public.truck_report_crew_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid := coalesce(new.report_id, old.report_id);
begin
  update public.truck_daily_reports t
     set rippers_count = (select count(*) from public.truck_report_crew c where c.report_id = v_id)
   where t.id = v_id and t.rippers_count is distinct from (select count(*) from public.truck_report_crew c where c.report_id = v_id);
  return null;
end;
$$;

-- Déclencheurs avant : ordre alphabétique (date d'abord, puis contrôle de journée clôturée)
drop trigger if exists truck_report_crew_a_defaults on public.truck_report_crew;
create trigger truck_report_crew_a_defaults before insert or update on public.truck_report_crew
  for each row execute function public.truck_report_crew_defaults();
drop trigger if exists truck_report_crew_day_open on public.truck_report_crew;
create trigger truck_report_crew_day_open before insert or update or delete on public.truck_report_crew
  for each row execute function public.assert_day_open();
drop trigger if exists truck_report_crew_set_audit on public.truck_report_crew;
create trigger truck_report_crew_set_audit before insert or update on public.truck_report_crew
  for each row execute function public.set_audit_columns();
drop trigger if exists truck_report_crew_audit on public.truck_report_crew;
create trigger truck_report_crew_audit after insert or update or delete on public.truck_report_crew
  for each row execute function public.audit_trigger();
drop trigger if exists truck_report_crew_zz_count on public.truck_report_crew;
create trigger truck_report_crew_zz_count after insert or delete on public.truck_report_crew
  for each row execute function public.truck_report_crew_count();

alter table public.truck_report_crew enable row level security;
drop policy if exists "truck_report_crew_select" on public.truck_report_crew;
create policy "truck_report_crew_select" on public.truck_report_crew for select to authenticated using (public.can_view('rapport_camions'));
drop policy if exists "truck_report_crew_write" on public.truck_report_crew;
create policy "truck_report_crew_write" on public.truck_report_crew for all to authenticated
  using (public.can_edit('rapport_camions') or public.can_edit('rapport_journalier'))
  with check (public.can_edit('rapport_camions') or public.can_edit('rapport_journalier'));
grant select, insert, update, delete on public.truck_report_crew to authenticated;

-- ---------- Journal des modifications (migration 044) : équipe de la ligne -------------------
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
    when 'truck_report_crew' then 'rapport_camions'
  end;
$$;
