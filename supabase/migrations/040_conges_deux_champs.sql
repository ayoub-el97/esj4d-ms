-- =============================================================================
-- 040 — Congés simplifiés : deux champs saisis, un seul calcul
--
--  Saisie (fiche employé, administrateur) :
--   * Date d'entrée en service (employees.hire_date) ;
--   * Congés pris avant le système, en jours (employees.leave_taken_before, ≥ 0, demi-journées).
--  Calcul (un seul, pour tous les employés) :
--   * Solde congé   = 1,5 j × mois complets depuis la date d'entrée en service (+ corrections) ;
--   * Solde pris    = congés pris avant le système + congés approuvés déjà pris dans l'application ;
--   * Solde restant = Solde congé − Solde pris. Date d'entrée manquante : aucun calcul.
--  Reprise sans perte :
--   * le total de l'« Historique des congés avant le système » (037) est reporté dans
--     employees.leave_taken_before (les lignes restent en base) ;
--   * les soldes initiaux saisis (leave_adjustments « solde_initial ») restent en base mais ne
--     sont plus utilisés : la fiche le signale pour que l'administrateur renseigne les deux champs.
-- =============================================================================

update public.employees e
   set leave_taken_before = h.total
  from (select employee_id, sum(days) as total from public.leave_history_before group by employee_id) h
 where h.employee_id = e.id and e.leave_taken_before is distinct from h.total;

update public.employees set leave_start_method = 'pris_avant' where leave_start_method <> 'pris_avant';

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
    -- ancien solde initial (non utilisé dans le calcul, affiché pour information)
    select la.employee_id, sum(la.days) as n from public.leave_adjustments la
     where la.kind = 'conge' and la.category = 'solde_initial' group by la.employee_id
  ),
  adj as (
    select la.employee_id, sum(la.days) as n from public.leave_adjustments la
     where la.kind = 'conge' and la.category = 'correction' and la.created_at::date <= p_as_of group by la.employee_id
  ),
  tk as (
    -- congés approuvés et déjà pris (pointage « Congé » ou demande acceptée), une fois par jour
    select t.employee_id, count(*)::numeric as n from public.days_taken('conge', null, p_as_of) t group by t.employee_id
  ),
  pl as (
    select lr.employee_id, count(distinct d)::numeric as n
      from public.leave_requests lr, generate_series(greatest(lr.start_date, p_as_of + 1), lr.end_date, interval '1 day') d
     where lr.status = 'acceptee' and lr.end_date > p_as_of
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
  select e.hire_date into v_start from public.employees e where e.id = p_employee;
  if v_start is null then
    return;
  end if;
  return query
  select n, (v_start + make_interval(months => n))::date, v_rate, n * v_rate
    from generate_series(1, public.service_months(v_start, p_as_of)) n;
end;
$$;
