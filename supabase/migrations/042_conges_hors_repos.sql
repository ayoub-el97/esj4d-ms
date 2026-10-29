-- =============================================================================
-- 042 — Congés : jours de repos hebdomadaires exclus automatiquement
--
--  Une demande de congé (une seule saisie, date de début → date de fin) ne déduit pas les jours de
--  repos hebdomadaires de l'employé compris dans la période. Le jour de repos applicable à chaque
--  date est celui de l'historique des jours de repos (employee_rest_day_history) ; sans historique,
--  le jour de repos actuel de la fiche. Les jours fériés ne sont PAS exclus (politique existante).
--  * La demande d'origine est conservée telle quelle ; elle est découpée en « périodes de congé »
--    (leave_requests_breakdown) autour des jours de repos, sans créer d'autres demandes.
--  * Demande acceptée : seuls les jours hors repos passent en « Congé » au pointage ; le jour de
--    repos reste un jour de repos.
--  * Solde : un jour de congé n'est déduit qu'une fois, jamais un jour de repos inclus dans une demande.
--  * Demandes déjà acceptées : recalculées pour les dates à venir uniquement (les journées passées
--    restent telles qu'elles ont été pointées ; les journées clôturées ne sont jamais modifiées).
-- =============================================================================

-- Jour de repos applicable à une date (0 = dimanche … 6 = samedi ; null = non défini)
create or replace function public.employee_rest_day_on(p_employee uuid, p_date date)
returns smallint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  h record;
begin
  -- dernier changement effectué au plus tard ce jour-là
  select new_rest_day into h from public.employee_rest_day_history
   where employee_id = p_employee and changed_at::date <= p_date
   order by changed_at desc, id desc limit 1;
  if found then
    return h.new_rest_day;
  end if;
  -- date antérieure au premier changement connu : ancienne valeur
  select old_rest_day into h from public.employee_rest_day_history
   where employee_id = p_employee
   order by changed_at, id limit 1;
  if found and h.old_rest_day is not null then
    return h.old_rest_day;
  end if;
  return (select rest_day from public.employees where id = p_employee);
end;
$$;
grant execute on function public.employee_rest_day_on(uuid, date) to authenticated;

create or replace function public.is_rest_day(p_employee uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.employee_rest_day_on(p_employee, p_date) = extract(dow from p_date)::smallint, false);
$$;
grant execute on function public.is_rest_day(uuid, date) to authenticated;

-- Détail d'une période : chaque date, jour de repos ou non, jour de repos connu ou non
create or replace function public.leave_period_breakdown(p_employee uuid, p_start date, p_end date)
returns table (day date, rest boolean, rest_known boolean)
language sql
stable
security definer
set search_path = public
as $$
  select d::date, public.is_rest_day(p_employee, d::date), public.employee_rest_day_on(p_employee, d::date) is not null
    from generate_series(p_start, greatest(p_start, p_end), interval '1 day') d
   where p_end >= p_start and p_end - p_start <= 400;
$$;
grant execute on function public.leave_period_breakdown(uuid, date, date) to authenticated;

-- Périodes de congé d'une ou plusieurs demandes (jours de repos exclus)
create or replace function public.leave_requests_breakdown(p_ids uuid[])
returns table (request_id uuid, seg_start date, seg_end date, days integer, rest_days integer)
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select lr.id, x.day, x.rest
      from public.leave_requests lr
      cross join lateral public.leave_period_breakdown(lr.employee_id, lr.start_date, lr.end_date) x
     where lr.id = any (p_ids)
  ),
  w as (
    select id, day, day - (row_number() over (partition by id order by day))::int as grp from d where not rest
  ),
  rest as (select id, count(*)::int as n from d where rest group by id)
  select w.id, min(w.day), max(w.day), count(*)::int, coalesce(max(rest.n), 0)
    from w left join rest on rest.id = w.id
   group by w.id, w.grp
  union all
  -- demande entièrement sur des jours de repos : aucune période, jours de repos comptés
  select rest.id, null, null, 0, rest.n from rest where not exists (select 1 from w where w.id = rest.id)
   order by 1, 2;
$$;
grant execute on function public.leave_requests_breakdown(uuid[]) to authenticated;

-- ---------- Pointage : jours de repos jamais passés en « Congé » par une demande ---------
create or replace function public.sync_leave_attendance(p_request uuid)
returns table (applied integer, converted integer, removed integer, skipped_closed integer, skipped_override integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.leave_requests;
  e public.employees;
  a record;
  d date;
  v_other uuid;
  v_applied int := 0; v_converted int := 0; v_removed int := 0; v_closed int := 0; v_override int := 0;
begin
  select * into r from public.leave_requests where id = p_request;
  if not found then return; end if;
  select * into e from public.employees where id = r.employee_id;

  -- 1) Lignes liées à cette demande qui ne sont plus couvertes (dont les jours de repos)
  for a in
    select * from public.attendance at
     where at.leave_request_id = p_request
       and not (r.status::text = 'acceptee' and at.employee_id = r.employee_id and at.activity_date between r.start_date and r.end_date
                and not public.is_rest_day(r.employee_id, at.activity_date))
  loop
    v_other := public.approved_leave_for(a.employee_id, a.activity_date, p_request);
    if v_other is not null and not public.is_rest_day(a.employee_id, a.activity_date) then
      update public.attendance set leave_request_id = v_other where id = a.id;
    elsif public.is_day_closed(a.activity_date) then
      v_closed := v_closed + 1;
    elsif a.status::text <> 'conge' then
      update public.attendance set leave_request_id = null where id = a.id;
    elsif a.pre_leave_status is null then
      delete from public.attendance where id = a.id;
      v_removed := v_removed + 1;
    else
      update public.attendance set status = a.pre_leave_status::public.attendance_status, leave_request_id = null, pre_leave_status = null where id = a.id;
      v_removed := v_removed + 1;
    end if;
  end loop;

  -- 2) Demande acceptée : chaque date couverte hors jour de repos passe en « Congé »
  if r.status::text = 'acceptee' then
    for d in select generate_series(r.start_date, r.end_date, interval '1 day')::date loop
      if public.is_rest_day(r.employee_id, d) then
        continue;   -- jour de repos hebdomadaire : jamais compté comme congé
      end if;
      if public.is_day_closed(d) then
        v_closed := v_closed + 1;
        continue;
      end if;
      if public.has_leave_override(r.employee_id, d) then
        v_override := v_override + 1;
        continue;
      end if;
      if not exists (select 1 from public.attendance where employee_id = r.employee_id and activity_date = d) then
        insert into public.attendance (activity_date, employee_id, shift, status, position, team_type, leave_request_id, pre_leave_status)
        values (d, r.employee_id, 1, 'conge', e.position, e.team_type, p_request, null);
        v_applied := v_applied + 1;
      else
        for a in select * from public.attendance where employee_id = r.employee_id and activity_date = d loop
          if a.status::text <> 'conge' then v_converted := v_converted + 1; end if;
          update public.attendance
             set status = 'conge',
                 pre_leave_status = case when a.leave_request_id is null then a.status::text else a.pre_leave_status end,
                 leave_request_id = p_request
           where id = a.id;
        end loop;
        v_applied := v_applied + 1;
      end if;
    end loop;
  end if;

  return query select v_applied, v_converted, v_removed, v_closed, v_override;
end;
$$;

-- Congé approuvé pour une date : jamais un jour de repos (protection du pointage)
create or replace function public.approved_leave_for(p_employee uuid, p_date date, p_except uuid default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select lr.id from public.leave_requests lr
   where lr.employee_id = p_employee and lr.status::text = 'acceptee'
     and p_date between lr.start_date and lr.end_date
     and (p_except is null or lr.id <> p_except)
     and not public.is_rest_day(p_employee, p_date)
   order by lr.start_date, lr.created_at
   limit 1;
$$;

-- ---------- Jours pris : jours de repos d'une demande non déduits -------------------------
create or replace function public.days_taken(p_kind text, p_from date, p_to date)
returns table (employee_id uuid, day date, source text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, date '1900-01-01');
begin
  perform public.assert_can_read_balances();
  if p_kind not in ('conge', 'recuperation') then
    raise exception 'TYPE_INVALIDE: %', p_kind;
  end if;

  return query
  with pointed as (
    select distinct a.employee_id, a.activity_date as day
      from public.attendance a
     where a.activity_date between v_from and p_to and a.status::text = p_kind
  ),
  any_pointage as (
    select distinct a.employee_id, a.activity_date as day
      from public.attendance a
     where a.activity_date between v_from and p_to
  ),
  requested as (
    select distinct lr.employee_id, d::date as day
      from public.leave_requests lr,
           generate_series(greatest(lr.start_date, v_from), least(lr.end_date, p_to), interval '1 day') d
     where p_kind = 'conge' and lr.status = 'acceptee' and lr.end_date >= v_from and lr.start_date <= p_to
       and not public.is_rest_day(lr.employee_id, d::date)
    union
    select distinct rr.employee_id, rr.recovery_date
      from public.recovery_requests rr
     where p_kind = 'recuperation' and rr.status = 'acceptee' and rr.recovery_date between v_from and p_to
  )
  select p.employee_id, p.day, 'pointage'::text from pointed p
  union all
  select r.employee_id, r.day, 'demande'::text
    from requested r
   where not exists (select 1 from any_pointage x where x.employee_id = r.employee_id and x.day = r.day);
end;
$$;

-- ---------- Soldes (calcul 040) : congés acceptés à venir hors jours de repos ---------------
drop function if exists public.leave_balances(date);
create function public.leave_balances(p_as_of date default current_date)
returns table (
  employee_id     uuid,
  hire_date       date,
  months          integer,
  accrued         numeric,
  taken           numeric,
  planned         numeric,
  adjustments     numeric,
  balance         numeric,
  accrual_from    date,
  initial_balance numeric,
  tracking_start  date,
  taken_before    numeric,
  method          text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rate numeric := coalesce((select value::numeric from public.settings where key = 'leave_days_per_month'), 1.5);
  v_on boolean := coalesce((select (value #>> '{}')::boolean from public.settings where key = 'leave_accrual_enabled'), true);
begin
  perform public.assert_can_read_balances();
  return query
  with ini as (
    select la.employee_id, sum(la.days) as n from public.leave_adjustments la
     where la.kind = 'conge' and la.category = 'solde_initial' group by la.employee_id
  ),
  adj as (
    select la.employee_id, sum(la.days) as n from public.leave_adjustments la
     where la.kind = 'conge' and la.category = 'correction' and la.created_at::date <= p_as_of group by la.employee_id
  ),
  tk as (
    select t.employee_id, count(*)::numeric as n from public.days_taken('conge', null, p_as_of) t group by t.employee_id
  ),
  pl as (
    select lr.employee_id, count(distinct d)::numeric as n
      from public.leave_requests lr, generate_series(greatest(lr.start_date, p_as_of + 1), lr.end_date, interval '1 day') d
     where lr.status = 'acceptee' and lr.end_date > p_as_of and not public.is_rest_day(lr.employee_id, d::date)
     group by lr.employee_id
  )
  select e.id, e.hire_date,
         public.service_months(e.hire_date, p_as_of),
         case when v_on then public.service_months(e.hire_date, p_as_of) * v_rate else 0 end,
         coalesce(tk.n, 0), coalesce(pl.n, 0), coalesce(adj.n, 0),
         (case when v_on then public.service_months(e.hire_date, p_as_of) * v_rate else 0 end)
           + coalesce(adj.n, 0) - coalesce(e.leave_taken_before, 0) - coalesce(tk.n, 0),
         e.hire_date, coalesce(ini.n, 0), null::date, e.leave_taken_before, 'pris_avant'::text
    from public.employees e
    left join ini on ini.employee_id = e.id
    left join tk on tk.employee_id = e.id
    left join pl on pl.employee_id = e.id
    left join adj on adj.employee_id = e.id;
end;
$$;
grant execute on function public.leave_balances(date) to authenticated;

-- ---------- Demandes acceptées en cours ou à venir : pointage recalculé (dates futures) ------
do $$
declare r record;
begin
  for r in select id from public.leave_requests where status::text = 'acceptee' and end_date >= current_date loop
    perform public.sync_leave_attendance(r.id);
  end loop;
end $$;
