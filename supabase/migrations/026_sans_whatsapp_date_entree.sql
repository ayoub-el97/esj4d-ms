-- =============================================================================
-- 026 — Retrait de WhatsApp et date de début de travail facultative
--
--  1) WhatsApp retiré : tables whatsapp_config (identifiants Meta, jeton) et
--     whatsapp_messages (journal des envois) supprimées ; droit « Envoi WhatsApp »
--     retiré des permissions. Aucune donnée métier n'est touchée (rapports, employés…).
--     (La valeur 'whatsapp' de l'énumération app_module reste, inutilisée : Postgres
--     ne permet pas de retirer une valeur d'énumération sans risque.)
--  2) Date de début de travail (employees.hire_date) facultative et JAMAIS supposée :
--     * date renseignée : règle inchangée (congés acquis depuis max(date d'entrée, début du projet)) ;
--     * date inconnue : AUCUN congé calculé, sauf si l'employé est explicitement marqué
--       « déjà en poste au début du projet » (in_service_before_start) : les congés sont
--       alors décomptés depuis la date de début du projet (réglage project_start_date),
--       date connue et affichée comme telle. La date d'enregistrement dans l'application
--       n'est jamais utilisée comme date d'entrée.
--     Les dates déjà enregistrées ne sont pas modifiées.
-- =============================================================================

-- ---------- 1) WhatsApp -----------------------------------------------------------
drop table if exists public.whatsapp_messages;
drop table if exists public.whatsapp_config;
delete from public.role_permissions where module::text = 'whatsapp';

create or replace function public.module_default_permission(p_module text, p_role text, p_edit boolean)
returns boolean
language sql
immutable
as $$
  select case
    when p_module = 'achats' then
      case p_role when 'admin' then true when 'secretaire' then true when 'lecture' then not p_edit else false end
    else false
  end;
$$;

-- ---------- 2) Date de début de travail facultative --------------------------------
alter table public.employees alter column hire_date drop not null;   -- déjà facultative ; sans effet sinon
alter table public.employees add column if not exists in_service_before_start boolean not null default false;

-- Début du décompte des congés : jamais une date supposée
create or replace function public.accrual_start(p_hire date, p_in_service_before_start boolean)
returns date
language sql
stable
set search_path = public
as $$
  select case
    when p_hire is not null then
      case when public.project_start() is null then p_hire else greatest(p_hire, public.project_start()) end
    when p_in_service_before_start then public.project_start()   -- null si aucun début de projet
    else null
  end;
$$;

-- Ancienne signature (une seule date) : même règle, sans repli sur le début du projet
create or replace function public.accrual_start(p_hire date)
returns date
language sql
stable
set search_path = public
as $$
  select public.accrual_start(p_hire, false);
$$;

drop function if exists public.leave_balances(date);
create function public.leave_balances(p_as_of date default current_date)
returns table (
  employee_id   uuid,
  hire_date     date,
  months        integer,
  accrued       numeric,
  taken         numeric,
  planned       numeric,
  adjustments   numeric,
  balance       numeric,
  accrual_from  date
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
  ),
  st as (
    select e.id, public.accrual_start(e.hire_date, e.in_service_before_start) as s from public.employees e
  )
  select e.id, e.hire_date,
         public.service_months(st.s, p_as_of),
         public.service_months(st.s, p_as_of) * v_rate,
         coalesce(tk.n, 0), coalesce(pl.n, 0), coalesce(adj.n, 0),
         public.service_months(st.s, p_as_of) * v_rate - coalesce(tk.n, 0) + coalesce(adj.n, 0),
         st.s
    from public.employees e
    join st on st.id = e.id
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
  v_start date;
begin
  perform public.assert_can_read_balances();
  select public.accrual_start(hire_date, in_service_before_start) into v_start from public.employees where id = p_employee;
  if v_start is null then
    return;   -- date de début inconnue : aucun congé acquis
  end if;
  return query
  select n, (v_start + make_interval(months => n))::date, v_rate, n * v_rate
    from generate_series(1, public.service_months(v_start, p_as_of)) n;
end;
$$;
