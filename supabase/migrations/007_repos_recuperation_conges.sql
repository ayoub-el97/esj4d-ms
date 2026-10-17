-- =============================================================================
-- 007 — Jour de repos travaillé, récupération, congés liés au pointage,
--       acquisition par mois complet, rapports par période
--
-- Règles centralisées ici (les écrans et les PDF lisent ces fonctions) :
--  * Un jour (employé, date) n'est jamais compté deux fois : tous les calculs
--    regroupent par jour, quel que soit le nombre de services ou d'enregistrements.
--  * 1 jour de repos travaillé pointé = 1 crédit de récupération, relié à sa date.
--  * Congé / récupération pris : le pointage fait foi. Pour un jour pointé, le jour
--    est décompté seulement si le statut est « Congé » (ou « Récupération »).
--    Pour un jour passé sans pointage, une demande ACCEPTÉE qui le couvre est décomptée.
--    Les demandes en attente ou refusées ne sont jamais décomptées.
--  * Acquisition : 1,5 jour (réglable) par mois complet de service, le premier crédit
--    à la date du premier mois anniversaire de la date d'entrée.
--
-- Note : les nouvelles valeurs d'énumération sont comparées en texte (status::text)
-- pour que ce script puisse s'exécuter en une seule transaction.
-- =============================================================================

alter type public.attendance_status add value if not exists 'repos_travaille';
alter type public.attendance_status add value if not exists 'recuperation';

-- ---------- Historique du jour de repos habituel ------------------------------
create table public.employee_rest_day_history (
  id                bigint generated always as identity primary key,
  employee_id       uuid not null references public.employees (id) on delete cascade,
  old_rest_day      smallint,
  new_rest_day      smallint,
  changed_by        uuid references auth.users (id),
  changed_by_email  text,
  changed_at        timestamptz not null default now()
);
create index rest_day_history_employee_idx on public.employee_rest_day_history (employee_id, changed_at desc);

create or replace function public.log_rest_day_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or old.rest_day is distinct from new.rest_day then
    insert into public.employee_rest_day_history (employee_id, old_rest_day, new_rest_day, changed_by, changed_by_email)
    values (new.id, case when tg_op = 'UPDATE' then old.rest_day end, new.rest_day, auth.uid(),
            (select email from public.profiles where id = auth.uid()));
  end if;
  return new;
end;
$$;

create trigger employees_rest_day_history after insert or update of rest_day on public.employees
  for each row execute function public.log_rest_day_change();

-- Historique initial des employés existants
insert into public.employee_rest_day_history (employee_id, old_rest_day, new_rest_day, changed_at)
select id, null, rest_day, created_at from public.employees where rest_day is not null;

alter table public.employee_rest_day_history enable row level security;
create policy "rest_day_history_select" on public.employee_rest_day_history for select to authenticated
  using (public.can_view('employes') or public.can_view('pointage'));

-- ---------- Demandes de congé : date de demande, jours demandés, conservation ---
alter table public.leave_requests add column if not exists request_date date not null default current_date;
alter table public.leave_requests add column if not exists requested_days numeric(5,1);
update public.leave_requests set requested_days = days where requested_days is null;
alter table public.leave_requests alter column requested_days set not null;
alter table public.leave_requests add constraint leave_requested_days_chk check (requested_days > 0);
update public.leave_requests set request_date = created_at::date;

-- Les demandes ne sont jamais supprimées (historique durable)
drop policy if exists "leave_requests_write" on public.leave_requests;
create policy "leave_requests_insert" on public.leave_requests for insert to authenticated with check (public.can_edit('conges'));
create policy "leave_requests_update" on public.leave_requests for update to authenticated using (public.can_edit('conges')) with check (public.can_edit('conges'));

-- Ajustements manuels : congé ou récupération, jamais supprimés
alter table public.leave_adjustments add column if not exists kind text not null default 'conge' check (kind in ('conge', 'recuperation'));
drop policy if exists "leave_adjustments_write" on public.leave_adjustments;
create policy "leave_adjustments_insert" on public.leave_adjustments for insert to authenticated with check (public.is_admin());

-- ---------- Demandes de récupération ------------------------------------------
create table public.recovery_requests (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.employees (id),
  request_date      date not null default current_date,
  worked_rest_date  date not null,              -- jour de repos travaillé qui a généré le crédit
  recovery_date     date not null,              -- jour de récupération demandé
  requested_days    numeric(3,1) not null default 1 check (requested_days > 0 and requested_days <= 1),
  comment           text not null default '',
  status            public.leave_status not null default 'en_attente',
  decided_by        uuid references auth.users (id),
  decided_at        timestamptz,
  decision_note     text not null default '',
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id),
  constraint recovery_after_credit_chk check (recovery_date > worked_rest_date)
);
create index recovery_requests_employee_idx on public.recovery_requests (employee_id, recovery_date desc);
-- Un crédit ne peut être utilisé que par une seule demande non refusée
create unique index recovery_requests_credit_uniq on public.recovery_requests (employee_id, worked_rest_date) where status <> 'refusee';

-- Le jour de repos travaillé doit exister dans le pointage
create or replace function public.check_recovery_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.worked_rest_date is distinct from old.worked_rest_date or new.employee_id is distinct from old.employee_id then
    if not exists (
      select 1 from public.attendance
       where employee_id = new.employee_id and activity_date = new.worked_rest_date and status::text = 'repos_travaille'
    ) then
      raise exception 'CREDIT_INVALIDE: aucun jour de repos travaillé pointé à cette date pour cet employé.';
    end if;
  end if;
  return new;
end;
$$;

create trigger recovery_requests_check_credit before insert or update on public.recovery_requests
  for each row execute function public.check_recovery_credit();
create trigger recovery_requests_set_audit before insert or update on public.recovery_requests
  for each row execute function public.set_audit_columns();
create trigger recovery_requests_audit after insert or update or delete on public.recovery_requests
  for each row execute function public.audit_trigger();

alter table public.recovery_requests enable row level security;
create policy "recovery_requests_select" on public.recovery_requests for select to authenticated
  using (public.can_view('conges') or public.can_view('rapports_travailleurs'));
create policy "recovery_requests_insert" on public.recovery_requests for insert to authenticated with check (public.can_edit('conges'));
create policy "recovery_requests_update" on public.recovery_requests for update to authenticated
  using (public.can_edit('conges')) with check (public.can_edit('conges'));

-- ---------- Calculs centralisés -------------------------------------------------

-- Nombre de mois complets de service : n tel que date d'entrée + n mois <= date de référence
create or replace function public.service_months(p_hire date, p_as_of date)
returns integer
language sql
immutable
as $$
  select case
    when p_hire is null or p_as_of is null or p_as_of < p_hire then 0
    else (
      select coalesce(max(n), 0)
        from generate_series(0, ((extract(year from age(p_as_of, p_hire)) * 12 + extract(month from age(p_as_of, p_hire)))::int + 1)) n
       where (p_hire + make_interval(months => n))::date <= p_as_of
    )
  end;
$$;

create or replace function public.assert_can_read_balances()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.can_view('conges') or public.can_view('rapports_travailleurs') or public.can_view('rapport_mensuel') or public.can_view('pointage')) then
    raise exception 'ACCES_REFUSE: lecture des soldes non autorisée.';
  end if;
end;
$$;

-- Jours effectivement pris (congé ou récupération), un jour au plus par employé
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

-- Crédits de récupération : un par jour de repos travaillé pointé
create or replace function public.recovery_credits(p_from date, p_to date)
returns table (employee_id uuid, worked_rest_date date, used_by_request uuid, request_status text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_can_read_balances();
  return query
  select c.employee_id, c.day,
         (select rr.id from public.recovery_requests rr
           where rr.employee_id = c.employee_id and rr.worked_rest_date = c.day and rr.status <> 'refusee' limit 1),
         (select rr.status::text from public.recovery_requests rr
           where rr.employee_id = c.employee_id and rr.worked_rest_date = c.day and rr.status <> 'refusee' limit 1)
    from (
      select distinct a.employee_id, a.activity_date as day
        from public.attendance a
       where a.status::text = 'repos_travaille'
         and a.activity_date between coalesce(p_from, date '1900-01-01') and p_to
    ) c;
end;
$$;

-- Soldes de congés à une date de référence
drop function if exists public.leave_balances(date);
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
         public.service_months(e.hire_date, p_as_of),
         public.service_months(e.hire_date, p_as_of) * v_rate,
         coalesce(tk.n, 0), coalesce(pl.n, 0), coalesce(adj.n, 0),
         public.service_months(e.hire_date, p_as_of) * v_rate - coalesce(tk.n, 0) + coalesce(adj.n, 0)
    from public.employees e
    left join tk on tk.employee_id = e.id
    left join pl on pl.employee_id = e.id
    left join adj on adj.employee_id = e.id;
end;
$$;

-- Détail des acquisitions d'un employé (une ligne par mois anniversaire)
create or replace function public.leave_accrual_schedule(p_employee uuid, p_as_of date default current_date)
returns table (month_index integer, credit_date date, days numeric, cumulative numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rate numeric := coalesce((select value::numeric from public.settings where key = 'leave_days_per_month'), 1.5);
  v_hire date;
begin
  perform public.assert_can_read_balances();
  select hire_date into v_hire from public.employees where id = p_employee;
  return query
  select n, (v_hire + make_interval(months => n))::date, v_rate, n * v_rate
    from generate_series(1, public.service_months(v_hire, p_as_of)) n;
end;
$$;

-- Soldes de récupération : crédits et utilisations sur une période, solde à la fin de la période
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
  with ct as (select c.employee_id, count(*)::numeric n from public.recovery_credits(null, p_to) c group by c.employee_id),
       cp as (select c.employee_id, count(*)::numeric n from public.recovery_credits(p_from, p_to) c group by c.employee_id),
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

-- Synthèse du pointage sur une période (un jour = une fois, quel que soit le nombre de services)
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
           max(e.rest_day)                                                                   as rest_day,
           extract(dow from a.activity_date)::int                                            as dow,
           exists (select 1 from public.holidays h where h.date = a.activity_date)           as is_holiday,
           sum(a.overtime_hours)                                                             as ot
      from public.attendance a
      join public.employees e on e.id = a.employee_id
     where a.activity_date between p_from and p_to
       and (p_team is null or a.team_type = p_team)
     group by a.employee_id, a.activity_date
  )
  select p.employee_id,
         count(*) filter (where p.worked)::int,
         count(*) filter (where p.rest_worked)::int,
         count(*) filter (where p.absent and not p.worked)::int,
         count(*) filter (where p.sick and not p.worked)::int,
         count(*) filter (where p.conge and not p.worked)::int,
         count(*) filter (where p.recup and not p.worked)::int,
         count(*) filter (where p.repos and not p.worked)::int,
         count(*) filter (where p.worked and p.is_holiday)::int,
         count(*) filter (where p.worked and (p.rest_worked or (v_on_rest and p.rest_day = p.dow) or (v_two and p.worked_shifts >= 2)))::int,
         coalesce(sum(p.ot), 0)
    from per_day p
   group by p.employee_id;
end;
$$;

-- Le rapport mensuel de pointage utilise la même synthèse
drop function if exists public.monthly_attendance(date, public.team_type);
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
  select * from public.attendance_summary(
    date_trunc('month', p_month)::date,
    (date_trunc('month', p_month) + interval '1 month - 1 day')::date,
    p_team);
$$;
