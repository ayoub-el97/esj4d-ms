-- Schéma complet ESJ-4D — généré à partir de supabase/migrations/*.sql (à exécuter une seule fois dans l'éditeur SQL)

-- ===== supabase/migrations/001_foundations.sql =====
-- =============================================================================
-- 001 — Fondations : profils, rôles, permissions, réglages, jours fériés, audit
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------- Types -------------------------------------------------------------
create type public.app_role as enum ('admin', 'secretaire', 'controleur', 'lecture');

create type public.app_module as enum (
  'pointage',
  'rapport_journalier',
  'rapport_mensuel',
  'rapport_camions',
  'conges',
  'avertissements',
  'programme',
  'dechet_vert',
  'rapports_travailleurs',
  'cloture',
  'employes',
  'parametres'
);

-- ---------- Profils (1 ligne par utilisateur auth) -----------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.app_role not null default 'lecture',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Création automatique du profil à l'inscription d'un utilisateur
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'lecture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Fonctions utilitaires d'autorisation -------------------------------
create or replace function public.user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.user_role() = 'admin', false);
$$;

-- ---------- Permissions configurables par rôle et module ----------------------
create table public.role_permissions (
  role       public.app_role not null,
  module     public.app_module not null,
  can_view   boolean not null default false,
  can_edit   boolean not null default false,
  primary key (role, module)
);

insert into public.role_permissions (role, module, can_view, can_edit)
select r, m,
  case r
    when 'admin' then true
    when 'secretaire' then m not in ('parametres')
    when 'controleur' then m in ('pointage','rapport_journalier','rapport_camions','programme','dechet_vert','avertissements','employes','rapports_travailleurs')
    when 'lecture' then m not in ('parametres','cloture')
  end,
  case r
    when 'admin' then true
    when 'secretaire' then m not in ('parametres','cloture')
    when 'controleur' then m in ('pointage','rapport_journalier','rapport_camions','programme','dechet_vert','avertissements')
    when 'lecture' then false
  end
from unnest(enum_range(null::public.app_role)) r
cross join unnest(enum_range(null::public.app_module)) m;

create or replace function public.can_view(p_module public.app_module)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rp.can_view from public.role_permissions rp where rp.role = public.user_role() and rp.module = p_module),
    false);
$$;

create or replace function public.can_edit(p_module public.app_module)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rp.can_edit from public.role_permissions rp where rp.role = public.user_role() and rp.module = p_module),
    false);
$$;

-- ---------- Réglages (clé / valeur) ------------------------------------------
create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

insert into public.settings (key, value) values
  ('agency_name',            '"Agence principale"'),
  ('company_name',           '"ESJ-4D"'),
  ('director_email',         '""'),
  ('timezone',               '"Africa/Casablanca"'),
  ('leave_days_per_month',   '1.5'),
  ('double_day_on_rest_day', 'true'),
  ('double_day_two_shifts',  'true');

-- ---------- Jours fériés ------------------------------------------------------
create table public.holidays (
  date  date primary key,
  label text not null
);

-- ---------- Journal d'audit ---------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text not null,
  action      text not null check (action in ('INSERT','UPDATE','DELETE','CLOSE_DAY','REOPEN_DAY')),
  old_data    jsonb,
  new_data    jsonb,
  user_id     uuid,
  user_email  text,
  created_at  timestamptz not null default now()
);
create index audit_log_table_record_idx on public.audit_log (table_name, record_id);
create index audit_log_created_idx on public.audit_log (created_at desc);

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id text;
  v_email text;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if tg_op = 'DELETE' then
    v_record_id := coalesce((to_jsonb(old) ->> 'id'), (to_jsonb(old) ->> 'activity_date'), '?');
    insert into public.audit_log (table_name, record_id, action, old_data, user_id, user_email)
    values (tg_table_name, v_record_id, tg_op, to_jsonb(old), auth.uid(), v_email);
    return old;
  else
    v_record_id := coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(new) ->> 'activity_date'), '?');
    insert into public.audit_log (table_name, record_id, action, old_data, new_data, user_id, user_email)
    values (tg_table_name, v_record_id, tg_op,
            case when tg_op = 'UPDATE' then to_jsonb(old) end,
            to_jsonb(new), auth.uid(), v_email);
    return new;
  end if;
end;
$$;

-- Horodatage automatique created_by / updated_at / updated_by
-- Générique : fonctionne quelle que soit la table (les colonnes absentes sont ignorées)
create or replace function public.set_audit_columns()
returns trigger
language plpgsql
as $$
declare
  j   jsonb := to_jsonb(new);
  uid jsonb := coalesce(to_jsonb(auth.uid()), 'null'::jsonb);
begin
  if tg_op = 'INSERT' and j ? 'created_by' and j -> 'created_by' = 'null'::jsonb then
    j := jsonb_set(j, '{created_by}', uid);
  end if;
  if j ? 'updated_at' then j := jsonb_set(j, '{updated_at}', to_jsonb(now())); end if;
  if j ? 'updated_by' then j := jsonb_set(j, '{updated_by}', uid); end if;
  new := jsonb_populate_record(new, j);
  return new;
end;
$$;

create trigger profiles_set_audit before insert or update on public.profiles
  for each row execute function public.set_audit_columns();
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.audit_trigger();
create trigger settings_audit after insert or update or delete on public.settings
  for each row execute function public.audit_trigger();
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function public.audit_trigger();

-- ---------- Sécurité au niveau des lignes (RLS) -------------------------------
alter table public.profiles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.settings enable row level security;
alter table public.holidays enable row level security;
alter table public.audit_log enable row level security;

-- profiles : chacun voit son profil ; l'admin voit et modifie tout
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles_update_admin" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "profiles_delete_admin" on public.profiles
  for delete to authenticated using (public.is_admin());

-- role_permissions : lecture par tous les connectés, modification admin
create policy "role_permissions_select" on public.role_permissions
  for select to authenticated using (true);
create policy "role_permissions_write_admin" on public.role_permissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- settings : lecture par tous les connectés, modification admin
create policy "settings_select" on public.settings
  for select to authenticated using (true);
create policy "settings_write_admin" on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- holidays : lecture par tous, modification selon permission 'parametres'
create policy "holidays_select" on public.holidays
  for select to authenticated using (true);
create policy "holidays_write" on public.holidays
  for all to authenticated using (public.can_edit('parametres')) with check (public.can_edit('parametres'));

-- audit_log : lecture admin uniquement (écriture via triggers security definer)
create policy "audit_log_select_admin" on public.audit_log
  for select to authenticated using (public.is_admin());

-- ===== supabase/migrations/002_referentiels.sql =====
-- =============================================================================
-- 002 — Référentiels : camions et employés
-- =============================================================================

create type public.team_type as enum ('collecte', 'nettoiement');
create type public.employee_position as enum ('chauffeur', 'rippeur', 'balayeur');

-- ---------- Camions -----------------------------------------------------------
create table public.trucks (
  id          uuid primary key default gen_random_uuid(),
  matricule   text not null unique,
  brand       text not null default '',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id)
);

-- ---------- Employés ----------------------------------------------------------
create table public.employees (
  id            uuid primary key default gen_random_uuid(),
  order_number  integer not null unique,                 -- NB : numéro d'ordre 1..N
  matricule     text not null unique,                    -- identifiant interne
  last_name     text not null,
  first_name    text not null,
  position      public.employee_position not null,
  team_type     public.team_type not null,
  rest_day      smallint check (rest_day between 0 and 6), -- 0 = dimanche … 6 = samedi
  truck_id      uuid references public.trucks (id),      -- chauffeur : camion attitré
  chauffeur_id  uuid references public.employees (id),   -- rippeur : chauffeur/équipe de rattachement
  hire_date     date,                                    -- début d'acquisition des congés
  phone         text not null default '',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  constraint employees_team_position_chk check (
    (position in ('chauffeur','rippeur') and team_type = 'collecte') or
    (position = 'balayeur' and team_type = 'nettoiement')
  )
);
create index employees_team_idx on public.employees (team_type, is_active);
create index employees_chauffeur_idx on public.employees (chauffeur_id);
create index employees_name_idx on public.employees (last_name, first_name);

-- Attribution automatique du numéro d'ordre (1 jusqu'au dernier employé)
create or replace function public.assign_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null then
    select coalesce(max(order_number), 0) + 1 into new.order_number from public.employees;
  end if;
  return new;
end;
$$;

create trigger employees_order_number before insert on public.employees
  for each row execute function public.assign_order_number();

create trigger trucks_set_audit before insert or update on public.trucks
  for each row execute function public.set_audit_columns();
create trigger trucks_audit after insert or update or delete on public.trucks
  for each row execute function public.audit_trigger();
create trigger employees_set_audit before insert or update on public.employees
  for each row execute function public.set_audit_columns();
create trigger employees_audit after insert or update or delete on public.employees
  for each row execute function public.audit_trigger();

-- ---------- RLS ---------------------------------------------------------------
alter table public.trucks enable row level security;
alter table public.employees enable row level security;

-- Les listes d'employés et de camions sont nécessaires à tous les modules : lecture pour tout utilisateur connecté.
create policy "trucks_select" on public.trucks for select to authenticated using (true);
create policy "trucks_write" on public.trucks for all to authenticated
  using (public.can_edit('employes')) with check (public.can_edit('employes'));

create policy "employees_select" on public.employees for select to authenticated using (true);
create policy "employees_write" on public.employees for all to authenticated
  using (public.can_edit('employes')) with check (public.can_edit('employes'));

-- ===== supabase/migrations/003_journee_pointage.sql =====
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

-- ===== supabase/migrations/004_rapports_photos.sql =====
-- =============================================================================
-- 004 — Photos (stockage privé), rapports journaliers, rapport camions
-- =============================================================================

create type public.photo_phase as enum ('avant', 'apres', 'justificatif');

-- ---------- Photos (table générique, une ligne par image) ---------------------
create table public.photos (
  id             uuid primary key default gen_random_uuid(),
  storage_path   text not null unique,          -- chemin dans le bucket "photos"
  entity_type    text not null,                 -- cleaning_report_agent | collection_report | warning | green_waste | work_task
  entity_id      uuid not null,
  phase          public.photo_phase not null default 'avant',
  activity_date  date,
  employee_id    uuid references public.employees (id),
  location       text not null default '',
  caption        text not null default '',
  mime_type      text not null default 'image/jpeg',
  size_bytes     integer not null default 0,
  uploaded_by    uuid references auth.users (id),
  created_at     timestamptz not null default now()
);
create index photos_entity_idx on public.photos (entity_type, entity_id, phase);
create index photos_employee_idx on public.photos (employee_id, activity_date);

-- Module responsable d'un type d'entité (pour les droits)
create or replace function public.photo_module(p_entity text)
returns public.app_module
language sql
immutable
as $$
  select case p_entity
    when 'cleaning_report_agent' then 'rapport_journalier'::public.app_module
    when 'collection_report'     then 'rapport_journalier'::public.app_module
    when 'warning'               then 'avertissements'::public.app_module
    when 'green_waste'           then 'dechet_vert'::public.app_module
    when 'work_task'             then 'programme'::public.app_module
    else 'rapport_journalier'::public.app_module
  end;
$$;

create trigger photos_day_open before insert or update or delete on public.photos
  for each row execute function public.assert_day_open();
create trigger photos_audit after insert or delete on public.photos
  for each row execute function public.audit_trigger();

alter table public.photos enable row level security;
create policy "photos_select" on public.photos for select to authenticated
  using (public.can_view(public.photo_module(entity_type)));
create policy "photos_insert" on public.photos for insert to authenticated
  with check (public.can_edit(public.photo_module(entity_type)) and uploaded_by = auth.uid());
create policy "photos_delete" on public.photos for delete to authenticated
  using (public.can_edit(public.photo_module(entity_type)));

-- Bucket privé + règles d'accès (chemin : {entity_type}/{entity_id}/{uuid}.jpg)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "storage_photos_select" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.can_view(public.photo_module(split_part(name, '/', 1))));
create policy "storage_photos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_edit(public.photo_module(split_part(name, '/', 1))));
create policy "storage_photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_edit(public.photo_module(split_part(name, '/', 1))));

-- ---------- Rapport journalier — Nettoiement ----------------------------------
create table public.cleaning_reports (
  id             uuid primary key default gen_random_uuid(),
  activity_date  date not null unique,
  observations   text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id)
);

create table public.cleaning_report_agents (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references public.cleaning_reports (id) on delete cascade,
  activity_date  date not null,
  employee_id    uuid not null references public.employees (id),
  location       text not null default '',
  comment        text not null default '',
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  unique (report_id, employee_id)
);
create index cleaning_agents_employee_idx on public.cleaning_report_agents (employee_id, activity_date);

-- ---------- Rapport journalier — Collecte -------------------------------------
create table public.collection_reports (
  id             uuid primary key default gen_random_uuid(),
  activity_date  date not null,
  truck_id       uuid not null references public.trucks (id),
  chauffeur_id   uuid references public.employees (id),
  sectors        text not null default '',
  observations   text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  unique (activity_date, truck_id)
);

create table public.collection_report_rippers (
  report_id    uuid not null references public.collection_reports (id) on delete cascade,
  employee_id  uuid not null references public.employees (id),
  primary key (report_id, employee_id)
);

-- ---------- Rapport camions (suivi journalier des véhicules) -------------------
create table public.truck_daily_reports (
  id             uuid primary key default gen_random_uuid(),
  activity_date  date not null,
  truck_id       uuid not null references public.trucks (id),
  chauffeur_id   uuid references public.employees (id),
  ticket1        text not null default '',
  tonnage1       numeric(8,2),
  ticket2        text not null default '',
  tonnage2       numeric(8,2),
  dumps_count    integer not null default 0,
  rippers_count  integer not null default 0,
  km             numeric(9,1),
  fuel           numeric(8,2),
  observations   text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  unique (activity_date, truck_id)
);
create index truck_reports_truck_idx on public.truck_daily_reports (truck_id, activity_date desc);

-- ---------- Rapport journalier global — récapitulatif nettoiement --------------
create table public.cleaning_daily_summary (
  id                uuid primary key default gen_random_uuid(),
  activity_date     date not null,
  zone              text not null default '',
  planned_headcount integer not null default 0,
  work_duration     text not null default '',
  active_count      integer not null default 0,
  sick_count        integer not null default 0,
  paid_leave_count  integer not null default 0,
  absent_count      integer not null default 0,
  holiday_count     integer not null default 0,
  rest_count        integer not null default 0,
  total_count       integer not null default 0,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id)
);
create index cleaning_summary_date_idx on public.cleaning_daily_summary (activity_date);

-- ---------- Triggers (journée ouverte, audit) -----------------------------------
do $$
declare t text;
begin
  foreach t in array array['cleaning_reports','cleaning_report_agents','collection_reports','truck_daily_reports','cleaning_daily_summary']
  loop
    execute format('create trigger %I_day_open before insert or update or delete on public.%I for each row execute function public.assert_day_open()', t, t);
    execute format('create trigger %I_set_audit before insert or update on public.%I for each row execute function public.set_audit_columns()', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

-- ---------- RLS ---------------------------------------------------------------
alter table public.cleaning_reports enable row level security;
alter table public.cleaning_report_agents enable row level security;
alter table public.collection_reports enable row level security;
alter table public.collection_report_rippers enable row level security;
alter table public.truck_daily_reports enable row level security;
alter table public.cleaning_daily_summary enable row level security;

create policy "cleaning_reports_select" on public.cleaning_reports for select to authenticated using (public.can_view('rapport_journalier'));
create policy "cleaning_reports_write" on public.cleaning_reports for all to authenticated using (public.can_edit('rapport_journalier')) with check (public.can_edit('rapport_journalier'));
create policy "cleaning_agents_select" on public.cleaning_report_agents for select to authenticated using (public.can_view('rapport_journalier') or public.can_view('rapports_travailleurs'));
create policy "cleaning_agents_write" on public.cleaning_report_agents for all to authenticated using (public.can_edit('rapport_journalier')) with check (public.can_edit('rapport_journalier'));
create policy "collection_reports_select" on public.collection_reports for select to authenticated using (public.can_view('rapport_journalier') or public.can_view('rapports_travailleurs'));
create policy "collection_reports_write" on public.collection_reports for all to authenticated using (public.can_edit('rapport_journalier')) with check (public.can_edit('rapport_journalier'));
create policy "collection_rippers_select" on public.collection_report_rippers for select to authenticated using (public.can_view('rapport_journalier') or public.can_view('rapports_travailleurs'));
create policy "collection_rippers_write" on public.collection_report_rippers for all to authenticated using (public.can_edit('rapport_journalier')) with check (public.can_edit('rapport_journalier'));
create policy "truck_reports_select" on public.truck_daily_reports for select to authenticated using (public.can_view('rapport_camions') or public.can_view('rapport_journalier'));
create policy "truck_reports_write" on public.truck_daily_reports for all to authenticated using (public.can_edit('rapport_camions') or public.can_edit('rapport_journalier')) with check (public.can_edit('rapport_camions') or public.can_edit('rapport_journalier'));
create policy "cleaning_summary_select" on public.cleaning_daily_summary for select to authenticated using (public.can_view('rapport_journalier'));
create policy "cleaning_summary_write" on public.cleaning_daily_summary for all to authenticated using (public.can_edit('rapport_journalier')) with check (public.can_edit('rapport_journalier'));

-- ===== supabase/migrations/005_conges_avertissements_taches.sql =====
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

-- ===== supabase/migrations/006_profil_entreprise.sql =====
-- =============================================================================
-- 006 — Profil de l'entreprise : logo, chefs d'équipe
-- =============================================================================

-- Chemin du logo dans le bucket public "branding" (vide = pas de logo)
insert into public.settings (key, value) values ('company_logo_path', '""')
on conflict (key) do nothing;

-- Le nom et le logo de la société s'affichent sur la page de connexion (avant authentification)
create policy "settings_select_public_branding" on public.settings
  for select to anon using (key in ('company_name', 'company_logo_path'));

-- Bucket public pour le logo (non sensible) ; écriture réservée aux administrateurs (permission "parametres")
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "storage_branding_select" on storage.objects for select to authenticated
  using (bucket_id = 'branding');
create policy "storage_branding_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.can_edit('parametres'));
create policy "storage_branding_update" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.can_edit('parametres'));
create policy "storage_branding_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.can_edit('parametres'));

-- ---------- Chefs d'équipe ----------------------------------------------------
create table public.team_leads (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  team_type    public.team_type,                        -- null = les deux équipes
  phone        text not null default '',
  employee_id  uuid references public.employees (id),   -- facultatif : chef qui est aussi un employé
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id)
);

create trigger team_leads_set_audit before insert or update on public.team_leads
  for each row execute function public.set_audit_columns();
create trigger team_leads_audit after insert or update or delete on public.team_leads
  for each row execute function public.audit_trigger();

alter table public.team_leads enable row level security;
create policy "team_leads_select" on public.team_leads for select to authenticated using (true);
create policy "team_leads_write" on public.team_leads for all to authenticated
  using (public.can_edit('parametres')) with check (public.can_edit('parametres'));

-- ===== supabase/migrations/007_repos_recuperation_conges.sql =====
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

-- ===== supabase/migrations/008_remplacants.sql =====
-- =============================================================================
-- 008 — Remplaçants : chauffeur remplaçant, rippeur remplaçant
--
--  * Deux nouveaux postes (équipe Collecte) : chauffeur_remplacant, rippeur_remplacant.
--  * Chaque chauffeur peut avoir un chauffeur remplaçant attitré, chaque rippeur un
--    rippeur remplaçant attitré (colonne substitute_id). Le remplaçant couvre le
--    titulaire pendant ses jours de repos ; la feuille de présence le propose
--    automatiquement.
--  * Un même remplaçant peut couvrir plusieurs titulaires (jours de repos différents).
--
-- Les nouvelles valeurs d'énumération sont comparées en texte (position::text)
-- pour que ce script puisse s'exécuter en une seule transaction.
-- =============================================================================

alter type public.employee_position add value if not exists 'chauffeur_remplacant';
alter type public.employee_position add value if not exists 'rippeur_remplacant';

-- Équipe déduite du poste : les remplaçants appartiennent à la Collecte
alter table public.employees drop constraint if exists employees_team_position_chk;
alter table public.employees add constraint employees_team_position_chk check (
  (position::text in ('chauffeur', 'rippeur', 'chauffeur_remplacant', 'rippeur_remplacant') and team_type = 'collecte') or
  (position::text = 'balayeur' and team_type = 'nettoiement')
);

-- Remplaçant attitré
alter table public.employees add column if not exists substitute_id uuid references public.employees (id);
alter table public.employees drop constraint if exists employees_substitute_not_self;
alter table public.employees add constraint employees_substitute_not_self check (substitute_id is null or substitute_id <> id);
create index if not exists employees_substitute_idx on public.employees (substitute_id);

-- Le remplaçant doit avoir le bon poste : chauffeur -> chauffeur remplaçant, rippeur -> rippeur remplaçant
create or replace function public.check_employee_substitute()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sub_position text;
begin
  if new.position::text not in ('chauffeur', 'rippeur') then
    new.substitute_id := null;
    return new;
  end if;
  if new.substitute_id is null then
    return new;
  end if;
  select position::text into v_sub_position from public.employees where id = new.substitute_id;
  if v_sub_position is distinct from (new.position::text || '_remplacant') then
    raise exception 'REMPLACANT_INVALIDE: le remplaçant d''un % doit avoir le poste « % remplaçant ».', new.position::text, new.position::text;
  end if;
  return new;
end;
$$;

drop trigger if exists employees_check_substitute on public.employees;
create trigger employees_check_substitute before insert or update of position, substitute_id on public.employees
  for each row execute function public.check_employee_substitute();

-- ===== supabase/migrations/009_camion_du_jour.sql =====
-- =============================================================================
-- 009 — Camion du jour dans le pointage
--
-- Les camions sont parfois échangés : le pointage enregistre, pour chaque
-- chauffeur (titulaire ou remplaçant), le camion réellement conduit ce jour-là.
-- Le rapport journalier de collecte et le rapport camions utilisent ce camion.
-- Le camion habituel reste défini dans la fiche du chauffeur (employees.truck_id).
-- =============================================================================

alter table public.attendance add column if not exists truck_id uuid references public.trucks (id);
create index if not exists attendance_truck_idx on public.attendance (activity_date, truck_id);

-- Rapport journalier nettoiement rempli automatiquement depuis le pointage :
--  * manual   : agent ajouté à la main au rapport (jamais retiré par la mise à jour automatique)
--  * excluded : agent retiré à la main du rapport (jamais réajouté par la mise à jour automatique)
-- Le pointage d'origine n'est jamais modifié par ces choix.
alter table public.cleaning_report_agents add column if not exists manual boolean not null default false;
alter table public.cleaning_report_agents add column if not exists excluded boolean not null default false;

-- ===== supabase/migrations/010_carburant.sql =====
-- =============================================================================
-- 010 — Rapport camions, partie 2 : suivi du carburant
--   * un plein = date, camion, chauffeur, litres, coût, kilométrage compteur
--   * photos (ticket, compteur, pompe) archivées dans le bucket privé "photos"
--   * consommation calculée : L/100 km par plein, synthèses hebdo / mensuelles
-- =============================================================================

create table if not exists public.fuel_entries (
  id             uuid primary key default gen_random_uuid(),
  activity_date  date not null,
  truck_id       uuid not null references public.trucks (id),
  driver_id      uuid references public.employees (id),
  liters         numeric(8,2) not null check (liters > 0),
  cost           numeric(10,2) not null check (cost >= 0),
  odometer_km    numeric(9,1) not null check (odometer_km >= 0),
  station        text not null default '',
  observations   text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id)
);
create index if not exists fuel_entries_truck_idx on public.fuel_entries (truck_id, activity_date, odometer_km);
create index if not exists fuel_entries_driver_idx on public.fuel_entries (driver_id, activity_date);
create index if not exists fuel_entries_date_idx on public.fuel_entries (activity_date desc);

drop trigger if exists fuel_entries_day_open on public.fuel_entries;
create trigger fuel_entries_day_open before insert or update or delete on public.fuel_entries
  for each row execute function public.assert_day_open();
drop trigger if exists fuel_entries_set_audit on public.fuel_entries;
create trigger fuel_entries_set_audit before insert or update on public.fuel_entries
  for each row execute function public.set_audit_columns();
drop trigger if exists fuel_entries_audit on public.fuel_entries;
create trigger fuel_entries_audit after insert or update or delete on public.fuel_entries
  for each row execute function public.audit_trigger();

alter table public.fuel_entries enable row level security;
drop policy if exists "fuel_entries_select" on public.fuel_entries;
create policy "fuel_entries_select" on public.fuel_entries for select to authenticated using (public.can_view('rapport_camions'));
drop policy if exists "fuel_entries_write" on public.fuel_entries;
create policy "fuel_entries_write" on public.fuel_entries for all to authenticated
  using (public.can_edit('rapport_camions')) with check (public.can_edit('rapport_camions'));

-- Photos des pleins : droits du module "rapport_camions"
create or replace function public.photo_module(p_entity text)
returns public.app_module
language sql
immutable
as $$
  select case p_entity
    when 'cleaning_report_agent' then 'rapport_journalier'::public.app_module
    when 'collection_report'     then 'rapport_journalier'::public.app_module
    when 'warning'               then 'avertissements'::public.app_module
    when 'green_waste'           then 'dechet_vert'::public.app_module
    when 'work_task'             then 'programme'::public.app_module
    when 'fuel_entry'            then 'rapport_camions'::public.app_module
    else 'rapport_journalier'::public.app_module
  end;
$$;

-- -----------------------------------------------------------------------------
-- Consommation par plein (méthode « plein à plein ») :
--   distance = kilométrage du plein − kilométrage du plein précédent du même camion
--   L/100 km = litres du plein × 100 / distance
-- Le premier plein d'un camion n'a pas de distance (pas de référence).
-- -----------------------------------------------------------------------------
create or replace view public.fuel_entries_calc with (security_invoker = true) as
select
  f.*,
  lag(f.odometer_km) over w as previous_km,
  f.odometer_km - lag(f.odometer_km) over w as distance_km,
  case when f.odometer_km - lag(f.odometer_km) over w > 0
       then round(f.liters * 100 / (f.odometer_km - lag(f.odometer_km) over w), 2) end as l_per_100km,
  case when f.liters > 0 then round(f.cost / f.liters, 3) end as price_per_liter
from public.fuel_entries f
window w as (partition by f.truck_id order by f.activity_date, f.odometer_km, f.created_at, f.id);

grant select on public.fuel_entries_calc to authenticated;

-- -----------------------------------------------------------------------------
-- Synthèse par semaine (lundi) ou par mois et par camion.
--   liters / cost        : tous les pleins de la période
--   distance_km          : somme des distances entre pleins
--   liters_measured      : litres des pleins ayant une distance (base du ratio)
--   l_per_100km          : liters_measured × 100 / distance_km
-- -----------------------------------------------------------------------------
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
    date_trunc(case when p_period = 'week' then 'week' else 'month' end, c.activity_date)::date as period_start,
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

grant execute on function public.fuel_summary(text, date, date, uuid, uuid) to authenticated;

-- ===== supabase/migrations/011_couts_rappels.sql =====
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

-- ===== supabase/migrations/012_feries.sql =====
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

-- ===== supabase/migrations/013_feries_maroc.sql =====
-- =============================================================================
-- 013 — Calendrier des jours fériés du Maroc (synchronisation)
--   sync_key  : identifiant du férié synchronisé (ex. « 2026:fitr:1 »), unique ;
--               vide pour un férié saisi à la main.
--   estimated : date estimée (fêtes religieuses, calendrier lunaire) à confirmer
--               à l'annonce officielle ; une resynchronisation ne modifie jamais
--               une date confirmée.
-- =============================================================================
alter table public.holidays add column if not exists estimated boolean not null default false;
alter table public.holidays add column if not exists sync_key text;
create unique index if not exists holidays_sync_key_uniq on public.holidays (sync_key) where sync_key is not null;

-- ===== supabase/migrations/014_mois_projet_superviseur.sql =====
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

-- ===== supabase/migrations/015_chef_securite_km.sql =====
-- =============================================================================
-- 015 — Chef d'équipe et agents de sécurité pointés ; km départ / km fin
--
--  * Postes « chef_equipe » et « agent_securite » (équipe Collecte) : pointés sur la
--    feuille de la collecte (chef d'équipe en tête), mêmes règles que les autres.
--  * Rapport camions : kilométrage de départ et de fin ; km parcourus = fin − départ.
--
-- Nouvelles valeurs d'énumération comparées en texte (position::text) : le script
-- s'exécute en une seule transaction.
-- =============================================================================

alter type public.employee_position add value if not exists 'chef_equipe';
alter type public.employee_position add value if not exists 'agent_securite';

alter table public.employees drop constraint if exists employees_team_position_chk;
alter table public.employees add constraint employees_team_position_chk check (
  (position::text in ('chauffeur', 'rippeur', 'chauffeur_remplacant', 'rippeur_remplacant', 'superviseur', 'chef_equipe', 'agent_securite') and team_type = 'collecte') or
  (position::text = 'balayeur' and team_type = 'nettoiement')
);

alter table public.truck_daily_reports add column if not exists km_start numeric(9,1) check (km_start >= 0);
alter table public.truck_daily_reports add column if not exists km_end numeric(9,1) check (km_end >= 0);
alter table public.truck_daily_reports drop constraint if exists truck_reports_km_order_chk;
alter table public.truck_daily_reports add constraint truck_reports_km_order_chk check (km_start is null or km_end is null or km_end >= km_start);

-- km parcourus calculé automatiquement quand départ et fin sont saisis
create or replace function public.truck_report_km()
returns trigger
language plpgsql
as $$
begin
  if new.km_start is not null and new.km_end is not null then
    new.km := new.km_end - new.km_start;
  end if;
  return new;
end;
$$;
drop trigger if exists truck_reports_km on public.truck_daily_reports;
create trigger truck_reports_km before insert or update on public.truck_daily_reports
  for each row execute function public.truck_report_km();

-- ===== supabase/migrations/016_reparations.sql =====
-- =============================================================================
-- 016 — Problèmes et réparations des camions
--
--  * truck_repairs : un enregistrement par problème / réparation, toujours lié à un
--    camion existant (aucun doublon de camion). Jamais supprimé : une erreur se
--    corrige ou passe au statut « Annulé » (historique complet, même camion inactif).
--  * Dépense réelle (vue truck_repair_expenses), comptée UNE fois par réparation :
--      coût saisi > 0 ET date de réparation renseignée ET
--      ( statut En cours ou Réparé  OU  statut Annulé avec frais engagés cochés ).
--    En attente : jamais compté (coût non confirmé). Le mois de la dépense est celui
--    de la DATE DE RÉPARATION, pas celui du signalement.
--  * Photos (bucket privé « photos ») : entity_type « truck_repair », catégories
--    vehicule (camion), avant, apres, justificatif (reçus / factures).
--  * Droits : ceux du module « Rapport camions ». Journal : audit_log (création,
--    modifications du coût et du statut), lisible via repair_history().
-- =============================================================================

alter type public.photo_phase add value if not exists 'vehicule';
alter table public.trucks add column if not exists model text not null default '';

create table if not exists public.truck_repairs (
  id                   uuid primary key default gen_random_uuid(),
  truck_id             uuid not null references public.trucks (id) on delete restrict,
  reported_date        date not null,
  problem_description  text not null check (length(trim(problem_description)) > 0),
  problem_location     text not null default '',
  notes                text not null default '',
  repair_date          date,
  repair_description   text not null default '',
  status               text not null default 'en_attente' check (status in ('en_attente', 'en_cours', 'repare', 'annule')),
  cost                 numeric(12,2) check (cost >= 0),
  cancelled_expense    boolean not null default false,  -- Annulé mais frais réellement engagés
  repair_notes         text not null default '',
  created_at           timestamptz not null default now(),
  created_by           uuid references auth.users (id),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id),
  -- Réparé : date de réparation et coût obligatoires (0 possible, ex. garantie)
  constraint truck_repairs_done_chk check (status <> 'repare' or (repair_date is not null and cost is not null)),
  constraint truck_repairs_dates_chk check (repair_date is null or repair_date >= reported_date)
);
create index if not exists truck_repairs_truck_idx on public.truck_repairs (truck_id, reported_date desc);
create index if not exists truck_repairs_repair_date_idx on public.truck_repairs (repair_date);
create index if not exists truck_repairs_status_idx on public.truck_repairs (status);

drop trigger if exists truck_repairs_set_audit on public.truck_repairs;
create trigger truck_repairs_set_audit before insert or update on public.truck_repairs
  for each row execute function public.set_audit_columns();
drop trigger if exists truck_repairs_audit on public.truck_repairs;
create trigger truck_repairs_audit after insert or update or delete on public.truck_repairs
  for each row execute function public.audit_trigger();

alter table public.truck_repairs enable row level security;
drop policy if exists "truck_repairs_select" on public.truck_repairs;
create policy "truck_repairs_select" on public.truck_repairs for select to authenticated using (public.can_view('rapport_camions'));
drop policy if exists "truck_repairs_insert" on public.truck_repairs;
create policy "truck_repairs_insert" on public.truck_repairs for insert to authenticated with check (public.can_edit('rapport_camions'));
drop policy if exists "truck_repairs_update" on public.truck_repairs;
create policy "truck_repairs_update" on public.truck_repairs for update to authenticated
  using (public.can_edit('rapport_camions')) with check (public.can_edit('rapport_camions'));
-- pas de politique DELETE : l'historique des réparations est conservé

-- ---------- Dépenses réelles (une ligne par réparation, jamais deux) ------------
create or replace view public.truck_repair_expenses with (security_invoker = true) as
select r.id as repair_id, r.truck_id, r.repair_date as expense_date, r.cost, r.status
  from public.truck_repairs r
 where r.cost is not null and r.cost > 0 and r.repair_date is not null
   and (r.status in ('en_cours', 'repare') or (r.status = 'annule' and r.cancelled_expense));
grant select on public.truck_repair_expenses to authenticated;

-- Dépenses par camion sur une période (date de réparation)
create or replace function public.repair_expenses_by_truck(p_from date, p_to date)
returns table (truck_id uuid, repairs integer, total numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select x.truck_id, count(*)::int, sum(x.cost)
    from public.truck_repair_expenses x
   where x.expense_date between p_from and p_to
   group by x.truck_id
   order by sum(x.cost) desc;
$$;
grant execute on function public.repair_expenses_by_truck(date, date) to authenticated;

-- Historique d'une réparation (journal d'audit), lisible par qui peut voir le module
create or replace function public.repair_history(p_repair uuid)
returns table (at timestamptz, action text, user_email text, old_status text, new_status text, old_cost numeric, new_cost numeric, changed text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view('rapport_camions') then
    raise exception 'ACCES_REFUSE: historique non autorisé.';
  end if;
  return query
  select l.created_at, l.action, l.user_email,
         l.old_data ->> 'status', l.new_data ->> 'status',
         (l.old_data ->> 'cost')::numeric, (l.new_data ->> 'cost')::numeric,
         array(select k from jsonb_object_keys(coalesce(l.new_data, '{}'::jsonb)) k
                where k not in ('updated_at', 'updated_by', 'created_at', 'created_by')
                  and (l.old_data is null or l.old_data -> k is distinct from l.new_data -> k))
    from public.audit_log l
   where l.table_name = 'truck_repairs' and l.record_id = p_repair::text
   order by l.created_at;
end;
$$;
grant execute on function public.repair_history(uuid) to authenticated;

-- ---------- Photos : droits du module camions ---------------------------------
create or replace function public.photo_module(p_entity text)
returns public.app_module
language sql
immutable
as $$
  select case p_entity
    when 'cleaning_report_agent' then 'rapport_journalier'::public.app_module
    when 'collection_report'     then 'rapport_journalier'::public.app_module
    when 'warning'               then 'avertissements'::public.app_module
    when 'green_waste'           then 'dechet_vert'::public.app_module
    when 'work_task'             then 'programme'::public.app_module
    when 'fuel_entry'            then 'rapport_camions'::public.app_module
    when 'truck_repair'          then 'rapport_camions'::public.app_module
    else 'rapport_journalier'::public.app_module
  end;
$$;

-- ===== supabase/migrations/017_camions_postes_vidages.sql =====
-- =============================================================================
-- 017 — Rapport camions : poste Matin / Soir, vidages multiples, photos par ligne
--
--  * shift (matin | soir) et line_no : un camion peut avoir plusieurs lignes le même
--    jour (une ou plusieurs le matin, une ou plusieurs le soir). L'unicité passe de
--    (date, camion) à (date, camion, poste, n° de ligne). Lignes existantes : Matin, n° 1.
--  * loads : liste des vidages [{ticket, tonnage}], autant que nécessaire.
--    Calcul automatique (trigger) : dumps_count = nombre de tonnages > 0,
--    tonnage_total = somme. Correction manuelle de dumps_count seulement si
--    dumps_override (réservée à l'administrateur par l'application).
--    Compatibilité : ticket1/tonnage1/ticket2/tonnage2 restent alimentés avec les
--    deux premiers vidages ; une écriture « ancienne » de ces colonnes reconstruit loads.
--  * Photos des lignes : entity_type « truck_report », droits du module camions.
-- =============================================================================

alter table public.truck_daily_reports add column if not exists shift text not null default 'matin';
alter table public.truck_daily_reports drop constraint if exists truck_reports_shift_chk;
alter table public.truck_daily_reports add constraint truck_reports_shift_chk check (shift in ('matin', 'soir'));
alter table public.truck_daily_reports add column if not exists line_no integer not null default 1 check (line_no >= 1);
alter table public.truck_daily_reports add column if not exists loads jsonb not null default '[]'::jsonb;
alter table public.truck_daily_reports add column if not exists tonnage_total numeric(10,2) not null default 0;
alter table public.truck_daily_reports add column if not exists dumps_override boolean not null default false;

-- Unicité : (date, camion) -> (date, camion, poste, n° de ligne)
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
     where con.conrelid = 'public.truck_daily_reports'::regclass and con.contype = 'u'
       and (select array_agg(att.attname::text order by att.attname) from unnest(con.conkey) k join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k)
           = array['activity_date', 'truck_id']
  loop
    execute format('alter table public.truck_daily_reports drop constraint %I', c);
  end loop;
end $$;
alter table public.truck_daily_reports drop constraint if exists truck_reports_line_uniq;
alter table public.truck_daily_reports add constraint truck_reports_line_uniq unique (activity_date, truck_id, shift, line_no);
create index if not exists truck_reports_day_idx on public.truck_daily_reports (activity_date, truck_id);

-- Calcul des vidages et du tonnage, compatibilité avec les colonnes ticket1..tonnage2
create or replace function public.truck_report_loads()
returns trigger
language plpgsql
as $$
declare
  legacy_changed boolean := false;
  arr jsonb := '[]'::jsonb;
  item jsonb;
  ton numeric;
begin
  if tg_op = 'UPDATE' then
    legacy_changed := new.loads is not distinct from old.loads
      and (new.ticket1 is distinct from old.ticket1 or new.tonnage1 is distinct from old.tonnage1
           or new.ticket2 is distinct from old.ticket2 or new.tonnage2 is distinct from old.tonnage2);
  else
    legacy_changed := coalesce(jsonb_array_length(new.loads), 0) = 0
      and (coalesce(new.ticket1, '') <> '' or new.tonnage1 is not null or coalesce(new.ticket2, '') <> '' or new.tonnage2 is not null);
  end if;

  if legacy_changed then
    -- Écriture par les anciennes colonnes : on reconstruit la liste en gardant les vidages au-delà du 2e
    if coalesce(new.ticket1, '') <> '' or new.tonnage1 is not null then
      arr := arr || jsonb_build_array(jsonb_build_object('ticket', coalesce(new.ticket1, ''), 'tonnage', new.tonnage1));
    end if;
    if coalesce(new.ticket2, '') <> '' or new.tonnage2 is not null then
      arr := arr || jsonb_build_array(jsonb_build_object('ticket', coalesce(new.ticket2, ''), 'tonnage', new.tonnage2));
    end if;
    if tg_op = 'UPDATE' and jsonb_array_length(old.loads) > 2 then
      for i in 2 .. jsonb_array_length(old.loads) - 1 loop
        arr := arr || jsonb_build_array(old.loads -> i);
      end loop;
    end if;
    new.loads := arr;
  end if;

  -- Normalisation : garder les vidages avec un ticket ou un tonnage
  arr := '[]'::jsonb;
  for item in select * from jsonb_array_elements(coalesce(new.loads, '[]'::jsonb)) loop
    ton := nullif(item ->> 'tonnage', '')::numeric;
    if coalesce(item ->> 'ticket', '') <> '' or ton is not null then
      arr := arr || jsonb_build_array(jsonb_build_object('ticket', coalesce(item ->> 'ticket', ''), 'tonnage', ton));
    end if;
  end loop;
  new.loads := arr;

  new.ticket1  := coalesce(arr -> 0 ->> 'ticket', '');
  new.tonnage1 := nullif(arr -> 0 ->> 'tonnage', '')::numeric;
  new.ticket2  := coalesce(arr -> 1 ->> 'ticket', '');
  new.tonnage2 := nullif(arr -> 1 ->> 'tonnage', '')::numeric;
  new.tonnage_total := coalesce((select sum((e ->> 'tonnage')::numeric) from jsonb_array_elements(arr) e where (e ->> 'tonnage')::numeric > 0), 0);
  if not new.dumps_override then
    new.dumps_count := (select count(*) from jsonb_array_elements(arr) e where (e ->> 'tonnage')::numeric > 0);
  end if;
  return new;
end;
$$;
drop trigger if exists truck_reports_loads on public.truck_daily_reports;
create trigger truck_reports_loads before insert or update on public.truck_daily_reports
  for each row execute function public.truck_report_loads();

-- Reprise des lignes existantes : les deux tickets deviennent des vidages ; le nombre de
-- vidages déjà saisi est conservé s'il diffère du calcul (marqué comme correction)
update public.truck_daily_reports r
   set dumps_override = r.dumps_count <> ((case when r.tonnage1 > 0 then 1 else 0 end) + (case when r.tonnage2 > 0 then 1 else 0 end)),
       loads = (
         select coalesce(jsonb_agg(x), '[]'::jsonb) from (
           select jsonb_build_object('ticket', coalesce(r.ticket1, ''), 'tonnage', r.tonnage1) x where coalesce(r.ticket1, '') <> '' or r.tonnage1 is not null
           union all
           select jsonb_build_object('ticket', coalesce(r.ticket2, ''), 'tonnage', r.tonnage2) where coalesce(r.ticket2, '') <> '' or r.tonnage2 is not null
         ) s
       );

-- Photos des lignes du rapport camions
create or replace function public.photo_module(p_entity text)
returns public.app_module
language sql
immutable
as $$
  select case p_entity
    when 'cleaning_report_agent' then 'rapport_journalier'::public.app_module
    when 'collection_report'     then 'rapport_journalier'::public.app_module
    when 'warning'               then 'avertissements'::public.app_module
    when 'green_waste'           then 'dechet_vert'::public.app_module
    when 'work_task'             then 'programme'::public.app_module
    when 'fuel_entry'            then 'rapport_camions'::public.app_module
    when 'truck_repair'          then 'rapport_camions'::public.app_module
    when 'truck_report'          then 'rapport_camions'::public.app_module
    else 'rapport_journalier'::public.app_module
  end;
$$;

-- ===== supabase/migrations/018_collecte_modifiable.sql =====
-- =============================================================================
-- 018 — Rapport de collecte modifiable toute la journée, traçabilité
--
--  * manual_team : le camion, le chauffeur ou l'équipe ont été corrigés dans le
--    rapport lui-même ; la mise à jour depuis le pointage ne les écrase plus et ne
--    supprime plus ce rapport.
--  * record_audit_info() : création / dernière modification (qui, quand) et photos
--    ajoutées / retirées d'une liste d'enregistrements, lues dans le journal d'audit
--    avec les droits du module concerné (journal lui-même réservé à l'administrateur).
-- =============================================================================

alter table public.collection_reports add column if not exists manual_team boolean not null default false;

create or replace function public.record_audit_info(p_table text, p_ids uuid[])
returns table (
  record_id        uuid,
  created_at       timestamptz,
  created_by_email text,
  updated_at       timestamptz,
  updated_by_email text,
  photos_added     integer,
  photos_removed   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_module public.app_module;
  v_entity text;
begin
  select m, e into v_module, v_entity from (values
    ('collection_reports', 'rapport_journalier'::public.app_module, 'collection_report'),
    ('cleaning_report_agents', 'rapport_journalier'::public.app_module, 'cleaning_report_agent'),
    ('green_waste_entries', 'dechet_vert'::public.app_module, 'green_waste'),
    ('work_tasks', 'programme'::public.app_module, 'work_task'),
    ('warnings', 'avertissements'::public.app_module, 'warning'),
    ('truck_daily_reports', 'rapport_camions'::public.app_module, 'truck_report'),
    ('truck_repairs', 'rapport_camions'::public.app_module, 'truck_repair'),
    ('fuel_entries', 'rapport_camions'::public.app_module, 'fuel_entry')
  ) v(tbl, m, e) where v.tbl = p_table;
  if v_module is null then
    raise exception 'TABLE_INCONNUE: %', p_table;
  end if;
  if not public.can_view(v_module) then
    raise exception 'ACCES_REFUSE: historique non autorisé.';
  end if;

  return query
  select i.id,
         (select l.created_at from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'INSERT' order by l.created_at limit 1),
         (select l.user_email from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'INSERT' order by l.created_at limit 1),
         (select l.created_at from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'UPDATE' order by l.created_at desc limit 1),
         (select l.user_email from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'UPDATE' order by l.created_at desc limit 1),
         (select count(*)::int from public.audit_log l where l.table_name = 'photos' and l.action = 'INSERT' and l.new_data ->> 'entity_type' = v_entity and l.new_data ->> 'entity_id' = i.id::text),
         (select count(*)::int from public.audit_log l where l.table_name = 'photos' and l.action = 'DELETE' and l.old_data ->> 'entity_type' = v_entity and l.old_data ->> 'entity_id' = i.id::text)
    from unnest(p_ids) as i(id);
end;
$$;
grant execute on function public.record_audit_info(text, uuid[]) to authenticated;

-- ===== supabase/migrations/019_achats_materiel.sql =====
-- =============================================================================
-- 019 — Achats de matériel
--
--  * material_purchases : un achat = une ligne (jamais supprimée ; une erreur se corrige
--    ou l'achat est ANNULÉ avec un motif, ce qui le retire des totaux).
--    Montant total = quantité × prix unitaire (calculé par la base). Écart autorisé
--    uniquement par l'administrateur avec un motif (amount_adjusted + adjustment_reason).
--  * material_purchase_payments : les paiements (un ou plusieurs, à des dates
--    différentes). Payé = somme des paiements non annulés ; reste dû = total − payé ;
--    le total payé ne peut pas dépasser le montant de l'achat.
--  * Rapports : la VALEUR des achats se rattache à la date d'achat, les PAIEMENTS à leur
--    propre date (un achat payé plus tard ou en plusieurs fois apparaît correctement).
--  * Droits : nouveau module « achats ». La valeur d'énumération ajoutée ici n'est pas
--    utilisée dans ce script (exécution en une seule transaction) : les politiques
--    passent par can_view_module / can_edit_module (texte), avec des droits par défaut
--    tant qu'aucune ligne n'est enregistrée dans Paramètres › Permissions :
--    administrateur et secrétaire = lecture + modification ; lecture seule = lecture.
--  * Photos : entity_type « material_purchase » ; catégories materiel, justificatif
--    (reçus / factures), document (pièces complémentaires).
-- =============================================================================

alter type public.app_module add value if not exists 'achats';
alter type public.photo_phase add value if not exists 'materiel';
alter type public.photo_phase add value if not exists 'document';

-- ---------- Droits par nom de module (texte), avec valeurs par défaut ------------
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

create or replace function public.can_view_module(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or coalesce(
    (select rp.can_view from public.role_permissions rp where rp.role = public.user_role() and rp.module::text = p_module),
    public.module_default_permission(p_module, public.user_role()::text, false));
$$;

create or replace function public.can_edit_module(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or coalesce(
    (select rp.can_edit from public.role_permissions rp where rp.role = public.user_role() and rp.module::text = p_module),
    public.module_default_permission(p_module, public.user_role()::text, true));
$$;
grant execute on function public.can_view_module(text) to authenticated;
grant execute on function public.can_edit_module(text) to authenticated;

-- ---------- Achats ---------------------------------------------------------------
create table if not exists public.material_purchases (
  id                 uuid primary key default gen_random_uuid(),
  purchase_date      date not null,
  supplier_name      text not null check (length(trim(supplier_name)) > 0),
  supplier_contact   text not null default '',
  material_name      text not null check (length(trim(material_name)) > 0),
  category           text not null default 'autre' check (category in ('produits_nettoyage', 'outillage', 'equipement', 'pieces_rechange', 'vetements_protection', 'autre')),
  description        text not null default '',
  quantity           numeric(12,3) not null check (quantity > 0),
  unit               text not null default 'piece' check (unit in ('piece', 'boite', 'carton', 'kg', 'litre', 'metre', 'lot', 'autre')),
  unit_label         text not null default '',          -- précision si unité « autre »
  unit_price         numeric(12,2) not null check (unit_price >= 0),
  total_amount       numeric(14,2) not null default 0 check (total_amount >= 0),
  amount_adjusted    boolean not null default false,    -- total différent de quantité × prix (administrateur)
  adjustment_reason  text not null default '',
  payment_method     text not null default '',
  notes              text not null default '',
  cancelled          boolean not null default false,
  cancel_reason      text not null default '',
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id),
  constraint material_purchases_adjust_chk check (not amount_adjusted or length(trim(adjustment_reason)) > 0),
  constraint material_purchases_cancel_chk check (not cancelled or length(trim(cancel_reason)) > 0)
);
create index if not exists material_purchases_date_idx on public.material_purchases (purchase_date desc);
create index if not exists material_purchases_supplier_idx on public.material_purchases (lower(supplier_name));
create index if not exists material_purchases_category_idx on public.material_purchases (category);

create table if not exists public.material_purchase_payments (
  id             uuid primary key default gen_random_uuid(),
  purchase_id    uuid not null references public.material_purchases (id) on delete restrict,
  payment_date   date not null,
  amount         numeric(14,2) not null check (amount > 0),
  method         text not null default '',
  note           text not null default '',
  cancelled      boolean not null default false,
  cancel_reason  text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  constraint purchase_payments_cancel_chk check (not cancelled or length(trim(cancel_reason)) > 0)
);
create index if not exists purchase_payments_purchase_idx on public.material_purchase_payments (purchase_id);
create index if not exists purchase_payments_date_idx on public.material_purchase_payments (payment_date);

-- Montant total calculé (sauf ajustement documenté par l'administrateur)
create or replace function public.material_purchase_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.amount_adjusted then
    if not public.is_admin() and (tg_op = 'INSERT' or not old.amount_adjusted or new.total_amount is distinct from old.total_amount) then
      raise exception 'AJUSTEMENT_RESERVE: seul l''administrateur peut ajuster le montant total d''un achat.';
    end if;
  else
    new.total_amount := round(new.quantity * new.unit_price, 2);
    new.adjustment_reason := '';
  end if;
  if new.cancelled and (tg_op = 'INSERT' or not old.cancelled) then
    new.cancelled_at := now();
  elsif not new.cancelled then
    new.cancelled_at := null;
    new.cancel_reason := '';
  end if;
  -- Le total ne peut pas descendre sous ce qui est déjà payé
  if tg_op = 'UPDATE' and new.total_amount < coalesce((select sum(p.amount) from public.material_purchase_payments p where p.purchase_id = new.id and not p.cancelled), 0) then
    raise exception 'PAIEMENT_SUPERIEUR: le montant total de l''achat ne peut pas être inférieur aux paiements déjà enregistrés.';
  end if;
  return new;
end;
$$;
drop trigger if exists material_purchases_total on public.material_purchases;
create trigger material_purchases_total before insert or update on public.material_purchases
  for each row execute function public.material_purchase_total();

-- Paiements : jamais au-delà du montant de l'achat, pas sur un achat annulé
create or replace function public.check_purchase_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_cancelled boolean;
  v_paid numeric;
begin
  select total_amount, cancelled into v_total, v_cancelled from public.material_purchases where id = new.purchase_id;
  if v_cancelled and not new.cancelled then
    raise exception 'ACHAT_ANNULE: impossible d''enregistrer un paiement sur un achat annulé.';
  end if;
  select coalesce(sum(p.amount), 0) into v_paid from public.material_purchase_payments p
   where p.purchase_id = new.purchase_id and not p.cancelled and p.id <> new.id;
  if not new.cancelled and v_paid + new.amount > v_total then
    raise exception 'PAIEMENT_SUPERIEUR: le total payé (% DH) dépasserait le montant de l''achat (% DH).', v_paid + new.amount, v_total;
  end if;
  if new.cancelled and tg_op = 'UPDATE' and not old.cancelled then
    null; -- annulation : conservée avec son motif
  end if;
  return new;
end;
$$;
drop trigger if exists purchase_payments_check on public.material_purchase_payments;
create trigger purchase_payments_check before insert or update on public.material_purchase_payments
  for each row execute function public.check_purchase_payment();

do $$
declare t text;
begin
  foreach t in array array['material_purchases', 'material_purchase_payments']
  loop
    execute format('drop trigger if exists %I_set_audit on public.%I', t, t);
    execute format('create trigger %I_set_audit before insert or update on public.%I for each row execute function public.set_audit_columns()', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

-- ---------- Sécurité : lecture / modification selon le module « achats », jamais de suppression
alter table public.material_purchases enable row level security;
alter table public.material_purchase_payments enable row level security;
drop policy if exists "purchases_select" on public.material_purchases;
create policy "purchases_select" on public.material_purchases for select to authenticated using (public.can_view_module('achats'));
drop policy if exists "purchases_insert" on public.material_purchases;
create policy "purchases_insert" on public.material_purchases for insert to authenticated with check (public.can_edit_module('achats'));
drop policy if exists "purchases_update" on public.material_purchases;
create policy "purchases_update" on public.material_purchases for update to authenticated using (public.can_edit_module('achats')) with check (public.can_edit_module('achats'));
drop policy if exists "purchase_payments_select" on public.material_purchase_payments;
create policy "purchase_payments_select" on public.material_purchase_payments for select to authenticated using (public.can_view_module('achats'));
drop policy if exists "purchase_payments_insert" on public.material_purchase_payments;
create policy "purchase_payments_insert" on public.material_purchase_payments for insert to authenticated with check (public.can_edit_module('achats'));
drop policy if exists "purchase_payments_update" on public.material_purchase_payments;
create policy "purchase_payments_update" on public.material_purchase_payments for update to authenticated using (public.can_edit_module('achats')) with check (public.can_edit_module('achats'));

-- ---------- Vue de calcul : payé, reste dû, statut ------------------------------
create or replace view public.material_purchases_calc with (security_invoker = true) as
select p.*,
       coalesce(pay.paid, 0)::numeric(14,2) as amount_paid,
       (p.total_amount - coalesce(pay.paid, 0))::numeric(14,2) as amount_due,
       round(p.quantity * p.unit_price, 2) as computed_total,
       case
         when p.cancelled then 'annule'
         when coalesce(pay.paid, 0) >= p.total_amount then 'paye'
         when coalesce(pay.paid, 0) > 0 then 'partiel'
         else 'impaye'
       end as payment_status
  from public.material_purchases p
  left join (select purchase_id, sum(amount) paid from public.material_purchase_payments where not cancelled group by purchase_id) pay on pay.purchase_id = p.id;
grant select on public.material_purchases_calc to authenticated;

-- ---------- Photos : droits du module « achats » (comparaison texte) ----------------
create or replace function public.photo_can_view(p_entity text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case when p_entity = 'material_purchase' then public.can_view_module('achats') else public.can_view(public.photo_module(p_entity)) end;
$$;
create or replace function public.photo_can_edit(p_entity text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case when p_entity = 'material_purchase' then public.can_edit_module('achats') else public.can_edit(public.photo_module(p_entity)) end;
$$;
grant execute on function public.photo_can_view(text) to authenticated;
grant execute on function public.photo_can_edit(text) to authenticated;

drop policy if exists "photos_select" on public.photos;
create policy "photos_select" on public.photos for select to authenticated using (public.photo_can_view(entity_type));
drop policy if exists "photos_insert" on public.photos;
create policy "photos_insert" on public.photos for insert to authenticated with check (public.photo_can_edit(entity_type) and uploaded_by = auth.uid());
drop policy if exists "photos_delete" on public.photos;
create policy "photos_delete" on public.photos for delete to authenticated using (public.photo_can_edit(entity_type));

drop policy if exists "storage_photos_select" on storage.objects;
create policy "storage_photos_select" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.photo_can_view(split_part(name, '/', 1)));
drop policy if exists "storage_photos_insert" on storage.objects;
create policy "storage_photos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.photo_can_edit(split_part(name, '/', 1)));
drop policy if exists "storage_photos_delete" on storage.objects;
create policy "storage_photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.photo_can_edit(split_part(name, '/', 1)));

-- ---------- Journal : création / modifications d'un achat -------------------------
create or replace function public.record_audit_info(p_table text, p_ids uuid[])
returns table (
  record_id        uuid,
  created_at       timestamptz,
  created_by_email text,
  updated_at       timestamptz,
  updated_by_email text,
  photos_added     integer,
  photos_removed   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_module text;
  v_entity text;
begin
  select m, e into v_module, v_entity from (values
    ('collection_reports', 'rapport_journalier', 'collection_report'),
    ('cleaning_report_agents', 'rapport_journalier', 'cleaning_report_agent'),
    ('green_waste_entries', 'dechet_vert', 'green_waste'),
    ('work_tasks', 'programme', 'work_task'),
    ('warnings', 'avertissements', 'warning'),
    ('truck_daily_reports', 'rapport_camions', 'truck_report'),
    ('truck_repairs', 'rapport_camions', 'truck_repair'),
    ('fuel_entries', 'rapport_camions', 'fuel_entry'),
    ('material_purchases', 'achats', 'material_purchase')
  ) v(tbl, m, e) where v.tbl = p_table;
  if v_module is null then
    raise exception 'TABLE_INCONNUE: %', p_table;
  end if;
  if not public.can_view_module(v_module) and not (v_module <> 'achats' and public.can_view(v_module::public.app_module)) then
    raise exception 'ACCES_REFUSE: historique non autorisé.';
  end if;

  return query
  select i.id,
         (select l.created_at from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'INSERT' order by l.created_at limit 1),
         (select l.user_email from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'INSERT' order by l.created_at limit 1),
         (select l.created_at from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'UPDATE' order by l.created_at desc limit 1),
         (select l.user_email from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'UPDATE' order by l.created_at desc limit 1),
         (select count(*)::int from public.audit_log l where l.table_name = 'photos' and l.action = 'INSERT' and l.new_data ->> 'entity_type' = v_entity and l.new_data ->> 'entity_id' = i.id::text),
         (select count(*)::int from public.audit_log l where l.table_name = 'photos' and l.action = 'DELETE' and l.old_data ->> 'entity_type' = v_entity and l.old_data ->> 'entity_id' = i.id::text)
    from unnest(p_ids) as i(id);
end;
$$;

-- Historique détaillé d'un achat : quantité, prix, total, statut, paiements
create or replace function public.purchase_history(p_purchase uuid)
returns table (at timestamptz, tbl text, action text, user_email text, old_data jsonb, new_data jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view_module('achats') then
    raise exception 'ACCES_REFUSE: historique non autorisé.';
  end if;
  return query
  select l.created_at, l.table_name, l.action, l.user_email, l.old_data, l.new_data
    from public.audit_log l
   where (l.table_name = 'material_purchases' and l.record_id = p_purchase::text)
      or (l.table_name = 'material_purchase_payments' and coalesce(l.new_data, l.old_data) ->> 'purchase_id' = p_purchase::text)
   order by l.created_at;
end;
$$;
grant execute on function public.purchase_history(uuid) to authenticated;

-- ===== supabase/migrations/020_conges_pointage.sql =====
-- =============================================================================
-- 020 — Synchronisation automatique Congé ↔ Pointage
--
--  * Demande ACCEPTÉE : chaque date couverte est pointée « Congé » automatiquement
--    (ligne créée si besoin ; un pointage déjà saisi est converti et son ancien statut
--    mémorisé dans pre_leave_status). Journées clôturées : jamais modifiées.
--  * Un pointage autre que « Congé » sur une date de congé approuvé est REFUSÉ
--    (CONGE_APPROUVE), sauf dérogation autorisée et motivée (attendance_leave_overrides).
--  * Demande refusée, annulée, remise en attente ou dates réduites : le congé
--    automatique est retiré (ligne créée par le congé supprimée, ancien statut restauré),
--    sauf si une autre demande acceptée couvre la date.
--  * Le solde de congés ne compte jamais deux fois une journée (fonction days_taken :
--    une journée = une fois ; une journée dérogée et travaillée n'est pas déduite).
--  * Nouveau statut de demande « annulee » (la demande est conservée).
-- =============================================================================

alter type public.leave_status add value if not exists 'annulee';

alter table public.attendance add column if not exists leave_request_id uuid references public.leave_requests (id);
-- Statut avant application du congé ; null = ligne créée par le congé
alter table public.attendance add column if not exists pre_leave_status text;
create index if not exists attendance_leave_idx on public.attendance (leave_request_id) where leave_request_id is not null;

-- ---------- Dérogations autorisées ----------------------------------------------
create table if not exists public.attendance_leave_overrides (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.employees (id),
  activity_date     date not null,
  leave_request_id  uuid references public.leave_requests (id),
  reason            text not null check (length(trim(reason)) >= 5),
  revoked           boolean not null default false,
  revoked_at        timestamptz,
  revoked_by        uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  created_by        uuid not null default auth.uid() references auth.users (id),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id)
);
create unique index if not exists leave_overrides_active_uniq on public.attendance_leave_overrides (employee_id, activity_date) where not revoked;

drop trigger if exists leave_overrides_set_audit on public.attendance_leave_overrides;
create trigger leave_overrides_set_audit before insert or update on public.attendance_leave_overrides
  for each row execute function public.set_audit_columns();
drop trigger if exists leave_overrides_audit on public.attendance_leave_overrides;
create trigger leave_overrides_audit after insert or update or delete on public.attendance_leave_overrides
  for each row execute function public.audit_trigger();

alter table public.attendance_leave_overrides enable row level security;
drop policy if exists "leave_overrides_select" on public.attendance_leave_overrides;
create policy "leave_overrides_select" on public.attendance_leave_overrides for select to authenticated
  using (public.can_view('pointage') or public.can_view('conges'));
-- Autoriser une dérogation : droits de modification sur les congés ET le pointage
drop policy if exists "leave_overrides_insert" on public.attendance_leave_overrides;
create policy "leave_overrides_insert" on public.attendance_leave_overrides for insert to authenticated
  with check (public.can_edit('conges') and public.can_edit('pointage') and created_by = auth.uid());
drop policy if exists "leave_overrides_update" on public.attendance_leave_overrides;
create policy "leave_overrides_update" on public.attendance_leave_overrides for update to authenticated
  using (public.can_edit('conges') and public.can_edit('pointage')) with check (public.can_edit('conges') and public.can_edit('pointage'));

-- ---------- Fonctions de base ------------------------------------------------------
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
   order by lr.start_date, lr.created_at
   limit 1;
$$;

create or replace function public.has_leave_override(p_employee uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.attendance_leave_overrides o where o.employee_id = p_employee and o.activity_date = p_date and not o.revoked);
$$;

-- ---------- Protection du pointage ----------------------------------------------
create or replace function public.enforce_leave_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attendance;
  v_name text;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  -- Statut « Congé » toujours accepté ; suppression ou autre statut : vérification
  if tg_op <> 'DELETE' and new.status::text = 'conge' then
    if new.leave_request_id is null then
      new.leave_request_id := public.approved_leave_for(new.employee_id, new.activity_date);
    end if;
    return new;
  end if;
  if public.approved_leave_for(v_row.employee_id, v_row.activity_date) is not null
     and not public.has_leave_override(v_row.employee_id, v_row.activity_date) then
    select last_name || ' ' || first_name into v_name from public.employees where id = v_row.employee_id;
    raise exception 'CONGE_APPROUVE|%|%', coalesce(v_name, '?'), to_char(v_row.activity_date, 'DD/MM/YYYY');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists attendance_enforce_leave on public.attendance;
create trigger attendance_enforce_leave before insert or update or delete on public.attendance
  for each row execute function public.enforce_leave_attendance();

-- ---------- Synchronisation d'une demande avec le pointage ------------------------
-- Renvoie : dates mises en congé, pointages convertis (conflits), dates retirées,
-- dates clôturées non modifiées, dates avec dérogation laissées telles quelles.
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

  -- 1) Lignes liées à cette demande qui ne sont plus couvertes
  for a in
    select * from public.attendance at
     where at.leave_request_id = p_request
       and not (r.status::text = 'acceptee' and at.employee_id = r.employee_id and at.activity_date between r.start_date and r.end_date)
  loop
    v_other := public.approved_leave_for(a.employee_id, a.activity_date, p_request);
    if v_other is not null then
      update public.attendance set leave_request_id = v_other where id = a.id;
    elsif public.is_day_closed(a.activity_date) then
      v_closed := v_closed + 1;
    elsif a.status::text <> 'conge' then
      -- statut modifié par dérogation : on le laisse, on détache seulement le lien
      update public.attendance set leave_request_id = null where id = a.id;
    elsif a.pre_leave_status is null then
      delete from public.attendance where id = a.id;
      v_removed := v_removed + 1;
    else
      update public.attendance set status = a.pre_leave_status::public.attendance_status, leave_request_id = null, pre_leave_status = null where id = a.id;
      v_removed := v_removed + 1;
    end if;
  end loop;

  -- 2) Demande acceptée : chaque date couverte passe en « Congé »
  if r.status::text = 'acceptee' then
    for d in select generate_series(r.start_date, r.end_date, interval '1 day')::date loop
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
grant execute on function public.sync_leave_attendance(uuid) to authenticated;

create or replace function public.leave_requests_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_leave_attendance(new.id);
  return new;
end;
$$;
drop trigger if exists leave_requests_sync on public.leave_requests;
create trigger leave_requests_sync after insert or update of status, start_date, end_date, employee_id on public.leave_requests
  for each row execute function public.leave_requests_sync_trigger();

-- ---------- Révocation d'une dérogation : le congé s'applique de nouveau ----------
create or replace function public.leave_override_revoked_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_req uuid;
begin
  if new.revoked and not old.revoked then
    new.revoked_at := now();
    new.revoked_by := auth.uid();
    v_req := public.approved_leave_for(new.employee_id, new.activity_date);
    if v_req is not null and not public.is_day_closed(new.activity_date) then
      update public.attendance
         set pre_leave_status = case when leave_request_id is null then status::text else pre_leave_status end,
             status = 'conge', leave_request_id = v_req
       where employee_id = new.employee_id and activity_date = new.activity_date;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists leave_overrides_revoke on public.attendance_leave_overrides;
create trigger leave_overrides_revoke before update on public.attendance_leave_overrides
  for each row execute function public.leave_override_revoked_trigger();

-- ---------- Reprise : congés déjà acceptés -----------------------------------------
-- Les dates passées déjà pointées avec un autre statut sont converties en « Congé »
-- (ancien statut conservé) ; les journées clôturées ne sont pas modifiées.
do $$
declare lr record;
begin
  for lr in select id from public.leave_requests where status::text = 'acceptee' loop
    perform public.sync_leave_attendance(lr.id);
  end loop;
end $$;

-- ===== supabase/migrations/021_rapport_mensuel_pointage.sql =====
-- =============================================================================
-- 021 — Rapport mensuel de pointage (grille du 8 au 7) et nouvelles fonctions
--
--  * Nouvelles fonctions : mécanicien, gardien, directeur, « autre fonction »
--    (libellé libre employees.job_title, pour les fonctions ajoutées plus tard).
--    Elles sont pointées sur la feuille Collecte (groupes dédiés).
--  * Réglage pointage_period_start_day (8 par défaut) : la période de pointage va du
--    8 d'un mois au 7 du mois suivant ; le mois affiché est celui du début (8/09 → « Septembre »).
--  * La grille est calculée en direct depuis le Pointage (aucune double saisie).
--    Une période peut être FINALISÉE : la grille (employés, codes, totaux) est figée
--    dans attendance_period_snapshots. Toute mise à jour ultérieure crée une nouvelle
--    version avec un motif obligatoire ; les versions précédentes sont conservées
--    (aucune modification ni suppression possible) et journalisées.
-- =============================================================================

alter type public.employee_position add value if not exists 'mecanicien';
alter type public.employee_position add value if not exists 'gardien';
alter type public.employee_position add value if not exists 'directeur';
alter type public.employee_position add value if not exists 'autre';

alter table public.employees add column if not exists job_title text not null default '';

alter table public.employees drop constraint if exists employees_team_position_chk;
alter table public.employees add constraint employees_team_position_chk check (
  (position::text in ('chauffeur', 'rippeur', 'chauffeur_remplacant', 'rippeur_remplacant', 'superviseur', 'chef_equipe', 'agent_securite',
                      'mecanicien', 'gardien', 'directeur', 'autre') and team_type = 'collecte') or
  (position::text = 'balayeur' and team_type = 'nettoiement')
);

insert into public.settings (key, value) values ('pointage_period_start_day', '8') on conflict (key) do nothing;

-- ---------- Versions finalisées de la grille mensuelle ---------------------------
create table if not exists public.attendance_period_snapshots (
  id            uuid primary key default gen_random_uuid(),
  period_month  text not null check (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  revision      integer not null check (revision >= 1),
  period_start  date not null,
  period_end    date not null,
  data          jsonb not null,
  reason        text not null default '',
  created_at    timestamptz not null default now(),
  created_by    uuid not null default auth.uid() references auth.users (id),
  constraint attendance_period_snapshots_range_chk check (period_end >= period_start),
  -- Une mise à jour d'une période déjà finalisée exige un motif
  constraint attendance_period_snapshots_reason_chk check (revision = 1 or length(trim(reason)) >= 5),
  constraint attendance_period_snapshots_uniq unique (period_month, revision)
);

drop trigger if exists attendance_period_snapshots_audit on public.attendance_period_snapshots;
create trigger attendance_period_snapshots_audit after insert or update or delete on public.attendance_period_snapshots
  for each row execute function public.audit_trigger();

alter table public.attendance_period_snapshots enable row level security;
drop policy if exists "attendance_period_snapshots_select" on public.attendance_period_snapshots;
create policy "attendance_period_snapshots_select" on public.attendance_period_snapshots for select to authenticated
  using (public.can_view('pointage'));
drop policy if exists "attendance_period_snapshots_insert" on public.attendance_period_snapshots;
create policy "attendance_period_snapshots_insert" on public.attendance_period_snapshots for insert to authenticated
  with check (public.can_edit('pointage') and created_by = auth.uid());
-- Pas de politique UPDATE / DELETE : les versions finalisées sont conservées telles quelles.

-- ===== supabase/migrations/022_immobilisation_camions.sql =====
-- =============================================================================
-- 022 — Immobilisation des camions (jours hors service) et alertes
--
--  * Statuts affichés : en_attente = « En panne », en_cours = « En réparation »,
--    repare = « Réparé », annule = « Annulé » (saisie erronée : jamais comptée).
--  * out_of_service_since : date à laquelle le camion est devenu indisponible
--    (null = problème signalé sans immobilisation). Les dossiers existants sont repris
--    avec leur date de signalement.
--  * Convention de calcul : jours calendaires, jour d'immobilisation ET jour de remise
--    en service inclus (panne et réparation le même jour = 1 jour). Panne ouverte :
--    jusqu'à aujourd'hui (fuseau Africa/Casablanca, calculé à l'affichage).
--  * Réparé : la durée finale est figée dans downtime_days (repair_date = remise en service).
--  * Correction d'un dossier déjà réparé (dates ou statut) : motif obligatoire
--    (correction_reason), conservé dans le journal d'audit.
--  * Seuils d'alerte (orange / rouge) dans les réglages, modifiables par l'administrateur.
-- =============================================================================

alter table public.truck_repairs add column if not exists out_of_service_since date;
alter table public.truck_repairs add column if not exists expected_return_date date;
alter table public.truck_repairs add column if not exists correction_reason text not null default '';

-- Reprise : les dossiers existants (hors annulés) sont considérés immobilisés dès le signalement,
-- sauf si la réparation est datée avant (saisie incohérente : on prend la date de réparation).
update public.truck_repairs
   set out_of_service_since = case when repair_date is not null and repair_date < reported_date then repair_date else reported_date end
 where out_of_service_since is null and status <> 'annule';

alter table public.truck_repairs drop constraint if exists truck_repairs_oos_dates_chk;
alter table public.truck_repairs add constraint truck_repairs_oos_dates_chk
  check (out_of_service_since is null or repair_date is null or status <> 'repare' or repair_date >= out_of_service_since);
alter table public.truck_repairs drop constraint if exists truck_repairs_expected_chk;
alter table public.truck_repairs add constraint truck_repairs_expected_chk
  check (expected_return_date is null or out_of_service_since is null or expected_return_date >= out_of_service_since);

-- Durée finale (jours calendaires inclus), figée quand le camion est réparé
alter table public.truck_repairs drop column if exists downtime_days;
alter table public.truck_repairs add column downtime_days integer
  generated always as (case when status = 'repare' and out_of_service_since is not null and repair_date is not null
                            then (repair_date - out_of_service_since) + 1 end) stored;

create index if not exists truck_repairs_oos_idx on public.truck_repairs (truck_id, out_of_service_since) where out_of_service_since is not null;

-- ---------- Correction d'un dossier réparé : motif obligatoire --------------------
create or replace function public.truck_repairs_correction_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'repare'
     and (new.status is distinct from old.status
          or new.repair_date is distinct from old.repair_date
          or new.out_of_service_since is distinct from old.out_of_service_since)
     and (length(trim(new.correction_reason)) < 5 or new.correction_reason is not distinct from old.correction_reason) then
    raise exception 'MOTIF_CORRECTION: indiquez le motif de la correction (dossier déjà réparé).';
  end if;
  return new;
end;
$$;
drop trigger if exists truck_repairs_correction on public.truck_repairs;
create trigger truck_repairs_correction before update on public.truck_repairs
  for each row execute function public.truck_repairs_correction_guard();

-- ---------- Seuils d'alerte ----------------------------------------------------------
insert into public.settings (key, value) values
  ('truck_alert_orange_days', '3'),
  ('truck_alert_red_days', '7'),
  ('truck_alert_orange_count', '3'),
  ('truck_alert_red_count', '5'),
  ('truck_alert_window_days', '30')
on conflict (key) do nothing;

