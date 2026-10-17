-- =============================================================================
-- 012 — Règle des jours fériés (nationaux ou internationaux)
--
--   * Férié travaillé (Présent ou Repos travaillé un jour férié) = compte double :
--     l'employé gagne 1 jour de récupération « férié ».
--   * Ce jour doit être DEMANDÉ au plus tard le dernier jour du mois du férié
--     (date de la demande ≤ fin du mois). La date de récupération elle-même est libre.
--   * Non demandé à la fin du mois (ou demande refusée) : le crédit n'est plus
--     récupérable, il est « à payer » (ajouté au salaire).
--   * Férié non travaillé (statut Férié) = journée normale (comptée comme jour
--     de travail), sans heure d'entrée ni de sortie.
--   Les jours de repos travaillés gardent leur règle : 1 crédit, sans échéance.
-- =============================================================================

create or replace function public.is_holiday(p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.holidays h where h.date = p_date);
$$;

-- ---------- Crédits de récupération : repos travaillé + férié travaillé ---------
-- state : disponible | demande (en attente) | pris (acceptée) | a_payer (férié non demandé à temps)
-- Date de référence de l'échéance : la plus petite entre p_to et aujourd'hui.
drop function if exists public.recovery_credits(date, date);
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
           bool_or(a.status::text = 'repos_travaille') as rest_worked,
           (select h.label from public.holidays h where h.date = a.activity_date limit 1) as hol
      from public.attendance a
     where a.activity_date between coalesce(p_from, date '1900-01-01') and coalesce(p_to, date '2999-12-31')
       and (a.status::text = 'repos_travaille' or (a.status::text = 'present' and public.is_holiday(a.activity_date)))
     group by a.employee_id, a.activity_date
  ),
  k as (
    select c.employee_id, c.day, c.hol,
           case when c.hol is not null then 'ferie' else 'repos' end as kind,
           case when c.hol is not null then (date_trunc('month', c.day) + interval '1 month - 1 day')::date end as expires_on,
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

-- Soldes de récupération : un férié « à payer » ne fait plus partie du solde à récupérer
create or replace function public.recovery_balances(p_from date, p_to date default current_date)
returns table (
  employee_id     uuid,
  credits_period  numeric,
  taken_period    numeric,
  credits_total   numeric,
  taken_total     numeric,
  adjustments     numeric,
  pending         numeric,
  balance         numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_can_read_balances();
  return query
  with ct as (select c.employee_id, count(*)::numeric n from public.recovery_credits(null, p_to) c where c.state <> 'a_payer' group by c.employee_id),
       cp as (select c.employee_id, count(*)::numeric n from public.recovery_credits(p_from, p_to) c where c.state <> 'a_payer' group by c.employee_id),
       tt as (select t.employee_id, count(*)::numeric n from public.days_taken('recuperation', null, p_to) t group by t.employee_id),
       tp as (select t.employee_id, count(*)::numeric n from public.days_taken('recuperation', p_from, p_to) t group by t.employee_id),
       adj as (select la.employee_id, sum(la.days) n from public.leave_adjustments la
                where la.kind = 'recuperation' and la.created_at::date <= p_to group by la.employee_id),
       pe as (select rr.employee_id, count(*)::numeric n from public.recovery_requests rr where rr.status = 'en_attente' group by rr.employee_id)
  select e.id, coalesce(cp.n, 0), coalesce(tp.n, 0), coalesce(ct.n, 0), coalesce(tt.n, 0), coalesce(adj.n, 0), coalesce(pe.n, 0),
         coalesce(ct.n, 0) - coalesce(tt.n, 0) + coalesce(adj.n, 0)
    from public.employees e
    left join ct on ct.employee_id = e.id
    left join cp on cp.employee_id = e.id
    left join tt on tt.employee_id = e.id
    left join tp on tp.employee_id = e.id
    left join adj on adj.employee_id = e.id
    left join pe on pe.employee_id = e.id;
end;
$$;

-- ---------- Demande de récupération : crédit valide et délai du férié ------------
create or replace function public.check_recovery_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_holiday boolean;
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
    -- Férié : la demande doit être faite au plus tard le dernier jour du mois du férié
    if v_holiday and new.request_date > (date_trunc('month', new.worked_rest_date) + interval '1 month - 1 day')::date then
      raise exception 'FERIE_HORS_DELAI: la récupération d''un jour férié travaillé doit être demandée avant la fin du mois (au plus tard le %).',
        to_char((date_trunc('month', new.worked_rest_date) + interval '1 month - 1 day')::date, 'DD/MM/YYYY');
    end if;
  end if;
  return new;
end;
$$;

-- ---------- Synthèse du pointage ----------------------------------------------
--   worked_days : jours travaillés + fériés non travaillés (journée normale)
--   holidays_worked : fériés travaillés ; double_days les inclut (comptent double)
create or replace function public.attendance_summary(p_from date, p_to date, p_team public.team_type default null)
returns table (
  employee_id        uuid,
  worked_days        integer,
  rest_days_worked   integer,
  absences           integer,
  sick_days          integer,
  leave_days         integer,
  recovery_days      integer,
  rest_days          integer,
  holidays_worked    integer,
  double_days        integer,
  overtime_total     numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_on_rest boolean := coalesce((select value::boolean from public.settings where key = 'double_day_on_rest_day'), true);
  v_two     boolean := coalesce((select value::boolean from public.settings where key = 'double_day_two_shifts'), true);
begin
  perform public.assert_can_read_balances();
  return query
  with per_day as (
    select a.employee_id, a.activity_date,
           bool_or(a.status::text in ('present', 'repos_travaille'))                       as worked,
           count(*) filter (where a.status::text in ('present', 'repos_travaille'))        as worked_shifts,
           bool_or(a.status::text = 'repos_travaille')                                       as rest_worked,
           bool_or(a.status::text = 'absent')                                                as absent,
           bool_or(a.status::text = 'absent_maladie')                                        as sick,
           bool_or(a.status::text = 'conge')                                                 as conge,
           bool_or(a.status::text = 'recuperation')                                          as recup,
           bool_or(a.status::text = 'repos')                                                 as repos,
           bool_or(a.status::text = 'ferie')                                                 as ferie_off,
           max(e.rest_day)                                                                   as rest_day,
           extract(dow from a.activity_date)::int                                            as dow,
           public.is_holiday(a.activity_date)                                                as is_holiday,
           sum(a.overtime_hours)                                                             as ot
      from public.attendance a
      join public.employees e on e.id = a.employee_id
     where a.activity_date between p_from and p_to
       and (p_team is null or a.team_type = p_team)
     group by a.employee_id, a.activity_date
  )
  select p.employee_id,
         count(*) filter (where p.worked or p.ferie_off)::int,
         count(*) filter (where p.rest_worked)::int,
         count(*) filter (where p.absent and not p.worked)::int,
         count(*) filter (where p.sick and not p.worked)::int,
         count(*) filter (where p.conge and not p.worked)::int,
         count(*) filter (where p.recup and not p.worked)::int,
         count(*) filter (where p.repos and not p.worked)::int,
         count(*) filter (where p.worked and p.is_holiday)::int,
         count(*) filter (where p.worked and (p.is_holiday or p.rest_worked or (v_on_rest and p.rest_day = p.dow) or (v_two and p.worked_shifts >= 2)))::int,
         coalesce(sum(p.ot), 0)
    from per_day p
   group by p.employee_id;
end;
$$;

-- ---------- Férié non travaillé : pas d'heures ----------------------------------
create or replace function public.clear_times_when_not_worked()
returns trigger
language plpgsql
as $$
begin
  if new.status::text not in ('present', 'repos_travaille') then
    new.time_in := null;
    new.time_out := null;
    new.overtime_hours := 0;
  end if;
  return new;
end;
$$;
drop trigger if exists attendance_clear_times on public.attendance;
create trigger attendance_clear_times before insert or update on public.attendance
  for each row execute function public.clear_times_when_not_worked();

grant execute on function public.is_holiday(date) to authenticated;
grant execute on function public.recovery_credits(date, date) to authenticated;
