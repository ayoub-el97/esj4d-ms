-- =============================================================================
-- 014 — Mois de projet et superviseur
--
-- 1) Mois calculé à partir de la date de début du projet (réglage project_start_date).
--    Ex. début le 08/10/2026 : 1er mois = 08/10/2026 → 07/11/2026, 2e mois = 08/11 → 07/12…
--    S'applique aux rapports mensuels, aux synthèses carburant par mois, au délai de
--    récupération d'un férié travaillé et à l'acquisition des congés (un mois complet
--    n'est atteint qu'au jour anniversaire). Sans date de début : mois calendaire.
-- 2) Poste « superviseur » (équipe Collecte) : pointé sur la feuille des chauffeurs
--    et rippeurs (présent, absent, férié travaillé…), avec les mêmes règles.
--
-- La nouvelle valeur d'énumération est comparée en texte (position::text) pour que le
-- script s'exécute en une seule transaction.
-- =============================================================================

insert into public.settings (key, value) values ('project_start_date', '""') on conflict (key) do nothing;

create or replace function public.project_start()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select nullif(value #>> '{}', '')::date from public.settings where key = 'project_start_date';
$$;

-- Index du mois de projet contenant une date (0 = 1er mois ; négatif avant le début)
create or replace function public.work_month_index(p_date date)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  a date := public.project_start();
  n integer;
begin
  if a is null or p_date is null then return null; end if;
  n := (extract(year from p_date)::int - extract(year from a)::int) * 12 + (extract(month from p_date)::int - extract(month from a)::int);
  if (a + make_interval(months => n))::date > p_date then n := n - 1; end if;
  return n;
end;
$$;

-- Début / fin du mois (de projet, ou calendaire sans date de début) contenant une date
create or replace function public.work_month_start(p_date date)
returns date
language sql
stable
set search_path = public
as $$
  select case when public.project_start() is null then date_trunc('month', p_date)::date
              else (public.project_start() + make_interval(months => public.work_month_index(p_date)))::date end;
$$;

create or replace function public.work_month_end(p_date date)
returns date
language sql
stable
set search_path = public
as $$
  select case when public.project_start() is null then (date_trunc('month', p_date) + interval '1 month - 1 day')::date
              else ((public.project_start() + make_interval(months => public.work_month_index(p_date) + 1))::date - 1) end;
$$;

-- Mois désigné par « aaaa-mm » : la période qui COMMENCE dans ce mois calendaire
-- (ex. octobre 2026 avec un début le 08 → 08/10/2026 au 07/11/2026)
create or replace function public.work_month_range(p_month date)
returns table (month_start date, month_end date)
language plpgsql
stable
set search_path = public
as $$
declare
  a date := public.project_start();
  n integer;
begin
  if a is null then
    return query select date_trunc('month', p_month)::date, (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
    return;
  end if;
  n := (extract(year from p_month)::int - extract(year from a)::int) * 12 + (extract(month from p_month)::int - extract(month from a)::int);
  return query select (a + make_interval(months => n))::date, ((a + make_interval(months => n + 1))::date - 1);
end;
$$;

-- Début du décompte des congés : date d'entrée, mais pas avant le début du projet
create or replace function public.accrual_start(p_hire date)
returns date
language sql
stable
set search_path = public
as $$
  select case when public.project_start() is null then p_hire
              when p_hire is null then public.project_start()
              else greatest(p_hire, public.project_start()) end;
$$;

-- ---------- Congés : acquisition à partir du début de décompte ------------------
create or replace function public.leave_balances(p_as_of date default current_date)
returns table (
  employee_id  uuid,
  hire_date    date,
  months       integer,
  accrued      numeric,
  taken        numeric,
  planned      numeric,
  adjustments  numeric,
  balance      numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rate numeric := coalesce((select value::numeric from public.settings where key = 'leave_days_per_month'), 1.5);
begin
  perform public.assert_can_read_balances();
  return query
  with tk as (
    select t.employee_id, count(*)::numeric as n from public.days_taken('conge', null, p_as_of) t group by t.employee_id
  ),
  pl as (
    select lr.employee_id, count(distinct d)::numeric as n
      from public.leave_requests lr, generate_series(greatest(lr.start_date, p_as_of + 1), lr.end_date, interval '1 day') d
     where lr.status = 'acceptee' and lr.end_date > p_as_of
     group by lr.employee_id
  ),
  adj as (
    select la.employee_id, sum(la.days) as n from public.leave_adjustments la
     where la.kind = 'conge' and la.created_at::date <= p_as_of group by la.employee_id
  )
  select e.id, e.hire_date,
         public.service_months(public.accrual_start(e.hire_date), p_as_of),
         public.service_months(public.accrual_start(e.hire_date), p_as_of) * v_rate,
         coalesce(tk.n, 0), coalesce(pl.n, 0), coalesce(adj.n, 0),
         public.service_months(public.accrual_start(e.hire_date), p_as_of) * v_rate - coalesce(tk.n, 0) + coalesce(adj.n, 0)
    from public.employees e
    left join tk on tk.employee_id = e.id
    left join pl on pl.employee_id = e.id
    left join adj on adj.employee_id = e.id;
end;
$$;

create or replace function public.leave_accrual_schedule(p_employee uuid, p_as_of date default current_date)
returns table (month_index integer, credit_date date, days numeric, cumulative numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rate numeric := coalesce((select value::numeric from public.settings where key = 'leave_days_per_month'), 1.5);
  v_start date;
begin
  perform public.assert_can_read_balances();
  select public.accrual_start(hire_date) into v_start from public.employees where id = p_employee;
  return query
  select n, (v_start + make_interval(months => n))::date, v_rate, n * v_rate
    from generate_series(1, public.service_months(v_start, p_as_of)) n;
end;
$$;

-- ---------- Rapport mensuel de pointage : mois de projet -----------------------
create or replace function public.monthly_attendance(p_month date, p_team public.team_type default null)
returns table (
  employee_id uuid, worked_days integer, rest_days_worked integer, absences integer, sick_days integer,
  leave_days integer, recovery_days integer, rest_days integer, holidays_worked integer, double_days integer, overtime_total numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select s.* from public.work_month_range(p_month) r, public.attendance_summary(r.month_start, r.month_end, p_team) s;
$$;

-- ---------- Carburant : synthèse « mois » = mois de projet ----------------------
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
    case p_period when 'week' then date_trunc('week', c.activity_date)::date
                  when 'day'  then c.activity_date
                  else public.work_month_start(c.activity_date) end as period_start,
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

-- ---------- Férié travaillé : délai = fin du mois de projet ---------------------
create or replace function public.recovery_credits(p_from date, p_to date)
returns table (
  employee_id      uuid,
  worked_rest_date date,
  used_by_request  uuid,
  request_status   text,
  kind             text,
  holiday_label    text,
  expires_on       date,
  state            text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ref date := least(coalesce(p_to, current_date), current_date);
begin
  perform public.assert_can_read_balances();
  return query
  with c as (
    select a.employee_id, a.activity_date as day,
           (select h.label from public.holidays h where h.date = a.activity_date limit 1) as hol
      from public.attendance a
     where a.activity_date between coalesce(p_from, date '1900-01-01') and coalesce(p_to, date '2999-12-31')
       and (a.status::text = 'repos_travaille' or (a.status::text = 'present' and public.is_holiday(a.activity_date)))
     group by a.employee_id, a.activity_date
  ),
  k as (
    select c.employee_id, c.day, c.hol,
           case when c.hol is not null then 'ferie' else 'repos' end as kind,
           case when c.hol is not null then public.work_month_end(c.day) end as expires_on,
           (select rr.id from public.recovery_requests rr
             where rr.employee_id = c.employee_id and rr.worked_rest_date = c.day and rr.status <> 'refusee' limit 1) as req,
           (select rr.status::text from public.recovery_requests rr
             where rr.employee_id = c.employee_id and rr.worked_rest_date = c.day and rr.status <> 'refusee' limit 1) as req_status
      from c
  )
  select k.employee_id, k.day, k.req, k.req_status, k.kind, k.hol, k.expires_on,
         case
           when k.req_status = 'acceptee' then 'pris'
           when k.req_status = 'en_attente' then 'demande'
           when k.kind = 'ferie' and k.expires_on < v_ref then 'a_payer'
           else 'disponible'
         end
    from k;
end;
$$;

create or replace function public.check_recovery_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_holiday boolean;
  v_deadline date;
begin
  if tg_op = 'INSERT' or new.worked_rest_date is distinct from old.worked_rest_date or new.employee_id is distinct from old.employee_id
     or new.request_date is distinct from old.request_date then
    v_holiday := public.is_holiday(new.worked_rest_date);
    if not exists (
      select 1 from public.attendance
       where employee_id = new.employee_id and activity_date = new.worked_rest_date
         and (status::text = 'repos_travaille' or (v_holiday and status::text = 'present'))
    ) then
      raise exception 'CREDIT_INVALIDE: aucun jour de repos ou jour férié travaillé pointé à cette date pour cet employé.';
    end if;
    v_deadline := public.work_month_end(new.worked_rest_date);
    if v_holiday and new.request_date > v_deadline then
      raise exception 'FERIE_HORS_DELAI: la récupération d''un jour férié travaillé doit être demandée avant la fin du mois (au plus tard le %).', to_char(v_deadline, 'DD/MM/YYYY');
    end if;
  end if;
  return new;
end;
$$;

-- ---------- Superviseur ---------------------------------------------------------
alter type public.employee_position add value if not exists 'superviseur';
alter table public.employees drop constraint if exists employees_team_position_chk;
alter table public.employees add constraint employees_team_position_chk check (
  (position::text in ('chauffeur', 'rippeur', 'chauffeur_remplacant', 'rippeur_remplacant', 'superviseur') and team_type = 'collecte') or
  (position::text = 'balayeur' and team_type = 'nettoiement')
);

grant execute on function public.project_start() to authenticated;
grant execute on function public.work_month_start(date) to authenticated;
grant execute on function public.work_month_end(date) to authenticated;
grant execute on function public.work_month_range(date) to authenticated;
