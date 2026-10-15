-- =============================================================================
-- 003 — Journée de travail (clôture manuelle) et pointage
-- =============================================================================

create type public.attendance_status as enum ('present', 'repos', 'ferie', 'absent', 'absent_maladie', 'conge');

-- ---------- Journées ----------------------------------------------------------
create table public.work_days (
  activity_date  date primary key,
  status         text not null default 'open' check (status in ('open', 'closed')),
  closed_at      timestamptz,
  closed_by      uuid references auth.users (id),
  reopened_at    timestamptz,
  reopened_by    uuid references auth.users (id),
  reopen_reason  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function public.is_day_closed(p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.work_days where activity_date = p_date and status = 'closed');
$$;

-- Bloque toute écriture sur une journée clôturée (la clôture ne supprime jamais rien)
create or replace function public.assert_day_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old date;
  v_new date;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := (to_jsonb(old) ->> 'activity_date')::date;
    if v_old is not null and public.is_day_closed(v_old) then
      raise exception 'JOURNEE_CLOTUREE: la journée du % est clôturée, modification impossible.', to_char(v_old, 'DD/MM/YYYY');
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := (to_jsonb(new) ->> 'activity_date')::date;
    if v_new is not null and public.is_day_closed(v_new) then
      raise exception 'JOURNEE_CLOTUREE: la journée du % est clôturée, modification impossible.', to_char(v_new, 'DD/MM/YYYY');
    end if;
    return new;
  end if;
  return old;
end;
$$;

-- Clôture (rôles autorisés : permission "cloture" en modification)
create or replace function public.close_day(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit('cloture') then
    raise exception 'ACCES_REFUSE: vous n''êtes pas autorisé à clôturer une journée.';
  end if;
  if p_date > current_date then
    raise exception 'DATE_INVALIDE: impossible de clôturer une journée future.';
  end if;
  insert into public.work_days (activity_date, status, closed_at, closed_by)
  values (p_date, 'closed', now(), auth.uid())
  on conflict (activity_date) do update
    set status = 'closed', closed_at = now(), closed_by = auth.uid(), updated_at = now();
  insert into public.audit_log (table_name, record_id, action, new_data, user_id, user_email)
  values ('work_days', p_date::text, 'CLOSE_DAY', jsonb_build_object('activity_date', p_date), auth.uid(),
          (select email from public.profiles where id = auth.uid()));
end;
$$;

-- Réouverture : administrateur uniquement, avec justification obligatoire
create or replace function public.reopen_day(p_date date, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ACCES_REFUSE: seul un administrateur peut rouvrir une journée.';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'JUSTIFICATION_REQUISE: indiquez le motif de la réouverture.';
  end if;
  update public.work_days
     set status = 'open', reopened_at = now(), reopened_by = auth.uid(), reopen_reason = trim(p_reason), updated_at = now()
   where activity_date = p_date and status = 'closed';
  if not found then
    raise exception 'JOURNEE_OUVERTE: cette journée n''est pas clôturée.';
  end if;
  insert into public.audit_log (table_name, record_id, action, new_data, user_id, user_email)
  values ('work_days', p_date::text, 'REOPEN_DAY', jsonb_build_object('activity_date', p_date, 'reason', trim(p_reason)), auth.uid(),
          (select email from public.profiles where id = auth.uid()));
end;
$$;

-- ---------- Pointage ----------------------------------------------------------
create table public.attendance (
  id                     uuid primary key default gen_random_uuid(),
  activity_date          date not null,
  employee_id            uuid not null references public.employees (id),
  shift                  smallint not null default 1 check (shift between 1 and 3),
  status                 public.attendance_status not null default 'present',
  time_in                time,
  time_out               time,
  overtime_hours         numeric(5,2) not null default 0 check (overtime_hours >= 0),
  observation            text not null default '',
  replacing_employee_id  uuid references public.employees (id),  -- remplace cet agent (en repos)
  chauffeur_id           uuid references public.employees (id),  -- équipe du jour (rippeurs)
  position               public.employee_position not null,
  team_type              public.team_type not null,
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users (id),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references auth.users (id),
  unique (activity_date, employee_id, shift)
);
create index attendance_date_idx on public.attendance (activity_date, team_type);
create index attendance_employee_idx on public.attendance (employee_id, activity_date desc);

-- En-tête des feuilles (chef d'équipe du jour)
create table public.attendance_sheet_meta (
  activity_date  date not null,
  team_type      public.team_type not null,
  team_lead      text not null default '',
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  primary key (activity_date, team_type)
);

create trigger attendance_day_open before insert or update or delete on public.attendance
  for each row execute function public.assert_day_open();
create trigger attendance_set_audit before insert or update on public.attendance
  for each row execute function public.set_audit_columns();
create trigger attendance_audit after insert or update or delete on public.attendance
  for each row execute function public.audit_trigger();
create trigger attendance_meta_day_open before insert or update or delete on public.attendance_sheet_meta
  for each row execute function public.assert_day_open();
create trigger attendance_meta_set_audit before insert or update on public.attendance_sheet_meta
  for each row execute function public.set_audit_columns();

-- ---------- Rapport mensuel de pointage ---------------------------------------
create or replace function public.monthly_attendance(p_month date, p_team public.team_type default null)
returns table (
  employee_id      uuid,
  worked_days      integer,
  absences         integer,
  sick_days        integer,
  leave_days       integer,
  rest_days        integer,
  holidays_worked  integer,
  double_days      integer,
  overtime_total   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with cfg as (
    select
      coalesce((select value::boolean from public.settings where key = 'double_day_on_rest_day'), true) as on_rest_day,
      coalesce((select value::boolean from public.settings where key = 'double_day_two_shifts'), true) as two_shifts
  ),
  s as (
    select a.employee_id, a.activity_date, a.status, a.overtime_hours, e.rest_day,
           extract(dow from a.activity_date)::int as dow,
           exists (select 1 from public.holidays h where h.date = a.activity_date) as is_holiday
      from public.attendance a
      join public.employees e on e.id = a.employee_id
     where a.activity_date >= date_trunc('month', p_month)::date
       and a.activity_date <  (date_trunc('month', p_month) + interval '1 month')::date
       and (p_team is null or a.team_type = p_team)
  ),
  per_day as (
    select employee_id, activity_date,
           bool_or(status = 'present')                      as present,
           count(*) filter (where status = 'present')       as present_shifts,
           bool_or(status = 'absent')                       as absent,
           bool_or(status = 'absent_maladie')               as sick,
           bool_or(status = 'conge')                        as conge,
           bool_or(status = 'repos')                        as repos,
           max(rest_day)                                    as rest_day,
           max(dow)                                         as dow,
           bool_or(is_holiday)                              as is_holiday,
           sum(overtime_hours)                              as ot
      from s
     group by employee_id, activity_date
  )
  select p.employee_id,
         count(*) filter (where p.present)::int,
         count(*) filter (where p.absent and not p.present)::int,
         count(*) filter (where p.sick and not p.present)::int,
         count(*) filter (where p.conge and not p.present)::int,
         count(*) filter (where p.repos and not p.present)::int,
         count(*) filter (where p.present and p.is_holiday)::int,
         count(*) filter (where p.present and (
             (cfg.on_rest_day and p.rest_day = p.dow) or
             (cfg.two_shifts and p.present_shifts >= 2)))::int,
         coalesce(sum(p.ot), 0)
    from per_day p, cfg
   group by p.employee_id;
$$;

-- ---------- RLS ---------------------------------------------------------------
alter table public.work_days enable row level security;
alter table public.attendance enable row level security;
alter table public.attendance_sheet_meta enable row level security;

create policy "work_days_select" on public.work_days for select to authenticated using (true);
-- aucune écriture directe : uniquement via close_day / reopen_day

create policy "attendance_select" on public.attendance for select to authenticated
  using (public.can_view('pointage'));
create policy "attendance_write" on public.attendance for all to authenticated
  using (public.can_edit('pointage')) with check (public.can_edit('pointage'));

create policy "attendance_meta_select" on public.attendance_sheet_meta for select to authenticated
  using (public.can_view('pointage'));
create policy "attendance_meta_write" on public.attendance_sheet_meta for all to authenticated
  using (public.can_edit('pointage')) with check (public.can_edit('pointage'));
