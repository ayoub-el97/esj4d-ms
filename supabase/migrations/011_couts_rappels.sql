-- =============================================================================
-- 011 — Coûts carburant par jour / semaine / mois, et rappels (alertes)
-- =============================================================================

-- ---------- Synthèse carburant : ajout de la période « jour » ----------------
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
    date_trunc(case p_period when 'week' then 'week' when 'day' then 'day' else 'month' end, c.activity_date)::date as period_start,
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

-- ---------- Rappels ------------------------------------------------------------
-- Un rappel est personnel (visible par son auteur) ou partagé (visible par tous).
-- L'alerte apparaît « notify_days_before » jours avant la date, puis le jour même
-- et tant que le rappel n'est pas marqué comme fait.
create table if not exists public.reminders (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null check (length(trim(title)) > 0),
  details             text not null default '',
  remind_date         date not null,
  notify_days_before  integer not null default 3 check (notify_days_before between 0 and 90),
  shared              boolean not null default false,
  done_at             timestamptz,
  done_by             uuid references auth.users (id),
  created_at          timestamptz not null default now(),
  created_by          uuid not null default auth.uid() references auth.users (id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id)
);
create index if not exists reminders_date_idx on public.reminders (remind_date) where done_at is null;
create index if not exists reminders_owner_idx on public.reminders (created_by, remind_date);

drop trigger if exists reminders_set_audit on public.reminders;
create trigger reminders_set_audit before insert or update on public.reminders
  for each row execute function public.set_audit_columns();
drop trigger if exists reminders_audit on public.reminders;
create trigger reminders_audit after insert or update or delete on public.reminders
  for each row execute function public.audit_trigger();

alter table public.reminders enable row level security;
drop policy if exists "reminders_select" on public.reminders;
create policy "reminders_select" on public.reminders for select to authenticated
  using (created_by = auth.uid() or shared);
drop policy if exists "reminders_insert" on public.reminders;
create policy "reminders_insert" on public.reminders for insert to authenticated
  with check (created_by = auth.uid());
-- Modification / suppression : l'auteur ; un rappel partagé peut aussi être géré par l'administrateur
drop policy if exists "reminders_update" on public.reminders;
create policy "reminders_update" on public.reminders for update to authenticated
  using (created_by = auth.uid() or (shared and public.is_admin()))
  with check (created_by = auth.uid() or (shared and public.is_admin()));
drop policy if exists "reminders_delete" on public.reminders;
create policy "reminders_delete" on public.reminders for delete to authenticated
  using (created_by = auth.uid() or (shared and public.is_admin()));

grant select, insert, update, delete on public.reminders to authenticated;
