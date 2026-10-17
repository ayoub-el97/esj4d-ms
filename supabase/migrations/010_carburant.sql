-- =============================================================================
-- 010 — Rapport camions, partie 2 : suivi du carburant
--   * un plein = date, camion, chauffeur, litres, coût, kilométrage compteur
--   * photos (ticket, compteur, pompe) archivées dans le bucket privé "photos"
--   * consommation calculée : L/100 km par plein, synthèses hebdo / mensuelles
-- =============================================================================

create table if not exists public.fuel_entries (
  id             uuid primary key default gen_random_uuid(),
  activity_date  date not null,
  truck_id       uuid not null references public.trucks (id),
  driver_id      uuid references public.employees (id),
  liters         numeric(8,2) not null check (liters > 0),
  cost           numeric(10,2) not null check (cost >= 0),
  odometer_km    numeric(9,1) not null check (odometer_km >= 0),
  station        text not null default '',
  observations   text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id)
);
create index if not exists fuel_entries_truck_idx on public.fuel_entries (truck_id, activity_date, odometer_km);
create index if not exists fuel_entries_driver_idx on public.fuel_entries (driver_id, activity_date);
create index if not exists fuel_entries_date_idx on public.fuel_entries (activity_date desc);

drop trigger if exists fuel_entries_day_open on public.fuel_entries;
create trigger fuel_entries_day_open before insert or update or delete on public.fuel_entries
  for each row execute function public.assert_day_open();
drop trigger if exists fuel_entries_set_audit on public.fuel_entries;
create trigger fuel_entries_set_audit before insert or update on public.fuel_entries
  for each row execute function public.set_audit_columns();
drop trigger if exists fuel_entries_audit on public.fuel_entries;
create trigger fuel_entries_audit after insert or update or delete on public.fuel_entries
  for each row execute function public.audit_trigger();

alter table public.fuel_entries enable row level security;
drop policy if exists "fuel_entries_select" on public.fuel_entries;
create policy "fuel_entries_select" on public.fuel_entries for select to authenticated using (public.can_view('rapport_camions'));
drop policy if exists "fuel_entries_write" on public.fuel_entries;
create policy "fuel_entries_write" on public.fuel_entries for all to authenticated
  using (public.can_edit('rapport_camions')) with check (public.can_edit('rapport_camions'));

-- Photos des pleins : droits du module "rapport_camions"
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
    else 'rapport_journalier'::public.app_module
  end;
$$;

-- -----------------------------------------------------------------------------
-- Consommation par plein (méthode « plein à plein ») :
--   distance = kilométrage du plein − kilométrage du plein précédent du même camion
--   L/100 km = litres du plein × 100 / distance
-- Le premier plein d'un camion n'a pas de distance (pas de référence).
-- -----------------------------------------------------------------------------
create or replace view public.fuel_entries_calc with (security_invoker = true) as
select
  f.*,
  lag(f.odometer_km) over w as previous_km,
  f.odometer_km - lag(f.odometer_km) over w as distance_km,
  case when f.odometer_km - lag(f.odometer_km) over w > 0
       then round(f.liters * 100 / (f.odometer_km - lag(f.odometer_km) over w), 2) end as l_per_100km,
  case when f.liters > 0 then round(f.cost / f.liters, 3) end as price_per_liter
from public.fuel_entries f
window w as (partition by f.truck_id order by f.activity_date, f.odometer_km, f.created_at, f.id);

grant select on public.fuel_entries_calc to authenticated;

-- -----------------------------------------------------------------------------
-- Synthèse par semaine (lundi) ou par mois et par camion.
--   liters / cost        : tous les pleins de la période
--   distance_km          : somme des distances entre pleins
--   liters_measured      : litres des pleins ayant une distance (base du ratio)
--   l_per_100km          : liters_measured × 100 / distance_km
-- -----------------------------------------------------------------------------
create or replace function public.fuel_summary(
  p_period text,
  p_from   date default null,
  p_to     date default null,
  p_truck  uuid default null,
  p_driver uuid default null
)
returns table (
  period_start    date,
  truck_id        uuid,
  fills           integer,
  liters          numeric,
  cost            numeric,
  distance_km     numeric,
  liters_measured numeric,
  l_per_100km     numeric,
  cost_per_100km  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    date_trunc(case when p_period = 'week' then 'week' else 'month' end, c.activity_date)::date as period_start,
    c.truck_id,
    count(*)::integer,
    sum(c.liters),
    sum(c.cost),
    coalesce(sum(c.distance_km) filter (where c.distance_km > 0), 0),
    coalesce(sum(c.liters) filter (where c.distance_km > 0), 0),
    case when sum(c.distance_km) filter (where c.distance_km > 0) > 0
         then round(sum(c.liters) filter (where c.distance_km > 0) * 100 / sum(c.distance_km) filter (where c.distance_km > 0), 2) end,
    case when sum(c.distance_km) filter (where c.distance_km > 0) > 0
         then round(sum(c.cost) filter (where c.distance_km > 0) * 100 / sum(c.distance_km) filter (where c.distance_km > 0), 2) end
  from public.fuel_entries_calc c
  where (p_from is null or c.activity_date >= p_from)
    and (p_to is null or c.activity_date <= p_to)
    and (p_truck is null or c.truck_id = p_truck)
    and (p_driver is null or c.driver_id = p_driver)
  group by 1, 2
  order by 1 desc, 2;
$$;

grant execute on function public.fuel_summary(text, date, date, uuid, uuid) to authenticated;
