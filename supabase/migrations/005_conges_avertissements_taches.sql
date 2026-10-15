-- =============================================================================
-- 005 — Congés, avertissements, déchet vert, programme de travail
-- =============================================================================

-- ---------- Congés ------------------------------------------------------------
create type public.leave_status as enum ('en_attente', 'acceptee', 'refusee');

create table public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees (id),
  start_date     date not null,
  end_date       date not null,
  days           numeric(5,1) generated always as ((end_date - start_date) + 1) stored,
  reason         text not null default '',
  status         public.leave_status not null default 'en_attente',
  decided_by     uuid references auth.users (id),
  decided_at     timestamptz,
  decision_note  text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  constraint leave_dates_chk check (end_date >= start_date)
);
create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date desc);

-- Ajustements manuels du solde (traçables)
create table public.leave_adjustments (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id),
  days         numeric(5,1) not null,
  reason       text not null,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id)
);

-- Soldes : acquis (règle paramétrable, 1,5 j/mois par défaut) - pris (demandes acceptées) + ajustements
create or replace function public.leave_balances(p_as_of date default current_date)
returns table (
  employee_id  uuid,
  accrued      numeric,
  taken        numeric,
  adjustments  numeric,
  balance      numeric,
  months       integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with cfg as (
    select coalesce((select value::numeric from public.settings where key = 'leave_days_per_month'), 1.5) as rate
  ),
  m as (
    select e.id as employee_id,
           greatest(0,
             (extract(year from age(p_as_of, coalesce(e.hire_date, e.created_at::date))) * 12
            + extract(month from age(p_as_of, coalesce(e.hire_date, e.created_at::date))))::int) as months
      from public.employees e
  ),
  t as (
    select employee_id, coalesce(sum(days), 0) as taken
      from public.leave_requests
     where status = 'acceptee' and start_date <= p_as_of
     group by employee_id
  ),
  a as (
    select employee_id, coalesce(sum(days), 0) as adj
      from public.leave_adjustments
     where created_at::date <= p_as_of
     group by employee_id
  )
  select m.employee_id,
         round(m.months * cfg.rate, 1),
         coalesce(t.taken, 0),
         coalesce(a.adj, 0),
         round(m.months * cfg.rate, 1) - coalesce(t.taken, 0) + coalesce(a.adj, 0),
         m.months
    from m
    cross join cfg
    left join t on t.employee_id = m.employee_id
    left join a on a.employee_id = m.employee_id;
$$;

-- Le rapport mensuel de pointage compte aussi les congés acceptés
create or replace function public.monthly_leave_days(p_month date, p_employee uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(distinct d)::int
    from public.leave_requests lr,
         generate_series(greatest(lr.start_date, date_trunc('month', p_month)::date),
                         least(lr.end_date, (date_trunc('month', p_month) + interval '1 month - 1 day')::date),
                         interval '1 day') d
   where lr.employee_id = p_employee and lr.status = 'acceptee'
     and lr.end_date >= date_trunc('month', p_month)::date
     and lr.start_date < (date_trunc('month', p_month) + interval '1 month')::date;
$$;

-- ---------- Avertissements ----------------------------------------------------
create type public.warning_status as enum ('ouvert', 'en_cours', 'clos');

create table public.warnings (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees (id),
  incident_date  date not null,
  description    text not null,
  observations   text not null default '',
  status         public.warning_status not null default 'ouvert',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id)
);
create index warnings_employee_idx on public.warnings (employee_id, incident_date desc);

-- ---------- Déchet vert -------------------------------------------------------
create table public.green_waste_entries (
  id             uuid primary key default gen_random_uuid(),
  activity_date  date not null,
  location       text not null default '',
  comment        text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id)
);
create index green_waste_date_idx on public.green_waste_entries (activity_date desc);

-- ---------- Programme de travail ----------------------------------------------
create type public.task_status as enum ('planifiee', 'realisee');

create table public.work_tasks (
  id            uuid primary key default gen_random_uuid(),
  planned_date  date not null,
  location      text not null default '',
  description   text not null,
  status        public.task_status not null default 'planifiee',
  completed_at  timestamptz,
  comments      text not null default '',
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id)
);
create index work_tasks_date_idx on public.work_tasks (planned_date desc);

create table public.work_task_agents (
  task_id      uuid not null references public.work_tasks (id) on delete cascade,
  employee_id  uuid not null references public.employees (id),
  primary key (task_id, employee_id)
);

-- ---------- Triggers ----------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['leave_requests','warnings','green_waste_entries','work_tasks']
  loop
    execute format('create trigger %I_set_audit before insert or update on public.%I for each row execute function public.set_audit_columns()', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;
create trigger leave_adjustments_set_audit before insert on public.leave_adjustments for each row execute function public.set_audit_columns();
create trigger leave_adjustments_audit after insert or delete on public.leave_adjustments for each row execute function public.audit_trigger();
create trigger green_waste_day_open before insert or update or delete on public.green_waste_entries for each row execute function public.assert_day_open();

-- ---------- RLS ---------------------------------------------------------------
alter table public.leave_requests enable row level security;
alter table public.leave_adjustments enable row level security;
alter table public.warnings enable row level security;
alter table public.green_waste_entries enable row level security;
alter table public.work_tasks enable row level security;
alter table public.work_task_agents enable row level security;

create policy "leave_requests_select" on public.leave_requests for select to authenticated using (public.can_view('conges') or public.can_view('rapports_travailleurs'));
create policy "leave_requests_write" on public.leave_requests for all to authenticated using (public.can_edit('conges')) with check (public.can_edit('conges'));
create policy "leave_adjustments_select" on public.leave_adjustments for select to authenticated using (public.can_view('conges'));
create policy "leave_adjustments_write" on public.leave_adjustments for all to authenticated using (public.can_edit('conges')) with check (public.can_edit('conges'));

create policy "warnings_select" on public.warnings for select to authenticated using (public.can_view('avertissements'));
create policy "warnings_write" on public.warnings for all to authenticated using (public.can_edit('avertissements')) with check (public.can_edit('avertissements'));

create policy "green_waste_select" on public.green_waste_entries for select to authenticated using (public.can_view('dechet_vert'));
create policy "green_waste_write" on public.green_waste_entries for all to authenticated using (public.can_edit('dechet_vert')) with check (public.can_edit('dechet_vert'));

create policy "work_tasks_select" on public.work_tasks for select to authenticated using (public.can_view('programme') or public.can_view('rapports_travailleurs'));
create policy "work_tasks_write" on public.work_tasks for all to authenticated using (public.can_edit('programme')) with check (public.can_edit('programme'));
create policy "work_task_agents_select" on public.work_task_agents for select to authenticated using (public.can_view('programme') or public.can_view('rapports_travailleurs'));
create policy "work_task_agents_write" on public.work_task_agents for all to authenticated using (public.can_edit('programme')) with check (public.can_edit('programme'));
