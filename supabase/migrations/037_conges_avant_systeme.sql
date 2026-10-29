-- =============================================================================
-- 037 — Congés pris avant le système et méthode de départ du solde, par employé
--
--  * leave_history_before : « Historique des congés avant le système » (registres papier) :
--    jours, dates facultatives, note ; auteur et date ; modifiable par l'administrateur
--    (journalisé). Les valeurs déjà saisies dans employees.leave_taken_before sont reprises
--    (une ligne par employé) ; la colonne reste en base mais n'est plus utilisée.
--  * employees.leave_start_method : méthode de départ du solde (choisie par l'administrateur)
--     - 'solde_initial' (situation B, par défaut = calcul actuel inchangé) :
--         solde = solde initial confirmé + acquis depuis le début du suivi
--                 − congés approuvés pris depuis le début du suivi + corrections ;
--         les congés pris avant le système sont affichés mais jamais déduits (déjà dans le solde).
--     - 'pris_avant' (situation A) : acquisition depuis la date réelle de début de travail
--         (obligatoire ; inconnue = aucun calcul) ;
--         solde = acquis depuis le début de travail − congés pris avant le système
--                 − congés approuvés pris dans l'application + corrections (solde initial ignoré).
--  * Total des congés pris = pris avant le système + pris depuis le système (affichage).
--  Seuls les congés approuvés (demande acceptée ou pointage « Congé ») sont déduits, une fois par jour.
-- =============================================================================

create table if not exists public.leave_history_before (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id) on delete restrict,
  days         numeric(5,1) not null check (days > 0),
  start_date   date,
  end_date     date,
  note         text not null default '',
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  constraint leave_history_before_dates_chk check (start_date is null or end_date is null or end_date >= start_date)
);
create index if not exists leave_history_before_employee_idx on public.leave_history_before (employee_id);

drop trigger if exists leave_history_before_set_audit on public.leave_history_before;
create trigger leave_history_before_set_audit before insert or update on public.leave_history_before
  for each row execute function public.set_audit_columns();
drop trigger if exists leave_history_before_audit on public.leave_history_before;
create trigger leave_history_before_audit after insert or update or delete on public.leave_history_before
  for each row execute function public.audit_trigger();

alter table public.leave_history_before enable row level security;
drop policy if exists "leave_history_before_select" on public.leave_history_before;
create policy "leave_history_before_select" on public.leave_history_before for select to authenticated
  using (public.can_view('conges') or public.can_view('employes'));
drop policy if exists "leave_history_before_write" on public.leave_history_before;
create policy "leave_history_before_write" on public.leave_history_before for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.leave_history_before to authenticated;

-- Reprise des valeurs déjà saisies (« Congés déjà pris avant le système » de la fiche)
insert into public.leave_history_before (employee_id, days, note)
select e.id, e.leave_taken_before, 'Repris de la fiche employé (congés déjà pris avant le système)'
  from public.employees e
 where e.leave_taken_before > 0
   and not exists (select 1 from public.leave_history_before h where h.employee_id = e.id);

alter table public.employees add column if not exists leave_start_method text not null default 'solde_initial';
alter table public.employees drop constraint if exists employees_leave_start_method_chk;
alter table public.employees add constraint employees_leave_start_method_chk check (leave_start_method in ('solde_initial', 'pris_avant'));

-- Données de reprise (dont la méthode) : administrateur uniquement
create or replace function public.employees_leave_fields_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.leave_tracking_start is distinct from (case when tg_op = 'UPDATE' then old.leave_tracking_start end)
          or new.leave_taken_before is distinct from (case when tg_op = 'UPDATE' then old.leave_taken_before end)
          or (tg_op = 'UPDATE' and new.leave_start_method is distinct from old.leave_start_method)
          or (tg_op = 'INSERT' and new.leave_start_method <> 'solde_initial')) then
    raise exception 'REPRISE_CONGES_ADMIN: seul un administrateur peut modifier les données de reprise des congés.';
  end if;
  return new;
end;
$$;

-- ---------- Calcul des soldes ----------------------------------------------------------
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
  hist as (
    select h.employee_id, sum(h.days) as n from public.leave_history_before h group by h.employee_id
  ),
  st as (
    select e.id,
           e.leave_start_method as m,
           public.leave_tracking_start_of(e.leave_tracking_start) as tr,
           case when e.leave_start_method = 'pris_avant' then e.hire_date
                else public.leave_accrual_from(e.hire_date, e.leave_tracking_start, e.in_service_before_start, ini.employee_id is not null) end as s,
           coalesce(ini.n, 0) as initial
      from public.employees e left join ini on ini.employee_id = e.id
  ),
  tk as (
    select t.employee_id, count(*)::numeric as n
      from public.days_taken('conge', null, p_as_of) t
      join st on st.id = t.employee_id
     -- méthode B : congés pris avant le début du suivi déjà dans le solde initial ; méthode A : tous
     where st.m = 'pris_avant' or st.tr is null or t.day >= st.tr
     group by t.employee_id
  ),
  pl as (
    select lr.employee_id, count(distinct d)::numeric as n
      from public.leave_requests lr, generate_series(greatest(lr.start_date, p_as_of + 1), lr.end_date, interval '1 day') d
     where lr.status = 'acceptee' and lr.end_date > p_as_of
     group by lr.employee_id
  )
  select e.id, e.hire_date,
         public.service_months(st.s, p_as_of),
         case when v_on then public.service_months(st.s, p_as_of) * v_rate else 0 end,
         coalesce(tk.n, 0), coalesce(pl.n, 0), coalesce(adj.n, 0),
         (case when st.m = 'pris_avant' then -coalesce(hist.n, 0)
               when st.tr is null or p_as_of >= st.tr then st.initial else 0 end)
           + (case when v_on then public.service_months(st.s, p_as_of) * v_rate else 0 end)
           - coalesce(tk.n, 0) + coalesce(adj.n, 0),
         st.s, st.initial, st.tr, hist.n, st.m
    from public.employees e
    join st on st.id = e.id
    left join tk on tk.employee_id = e.id
    left join pl on pl.employee_id = e.id
    left join adj on adj.employee_id = e.id
    left join hist on hist.employee_id = e.id;
end;
$$;
grant execute on function public.leave_balances(date) to authenticated;

create or replace function public.leave_accrual_schedule(p_employee uuid, p_as_of date default current_date)
returns table (month_index integer, credit_date date, days numeric, cumulative numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rate numeric := coalesce((select value::numeric from public.settings where key = 'leave_days_per_month'), 1.5);
  v_on boolean := coalesce((select (value #>> '{}')::boolean from public.settings where key = 'leave_accrual_enabled'), true);
  v_start date;
begin
  perform public.assert_can_read_balances();
  if not v_on then
    return;
  end if;
  select case when e.leave_start_method = 'pris_avant' then e.hire_date
              else public.leave_accrual_from(e.hire_date, e.leave_tracking_start, e.in_service_before_start,
                     exists (select 1 from public.leave_adjustments la where la.employee_id = e.id and la.kind = 'conge' and la.category = 'solde_initial')) end
    into v_start from public.employees e where e.id = p_employee;
  if v_start is null then
    return;
  end if;
  return query
  select n, (v_start + make_interval(months => n))::date, v_rate, n * v_rate
    from generate_series(1, public.service_months(v_start, p_as_of)) n;
end;
$$;
