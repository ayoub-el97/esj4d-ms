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

-- ===== supabase/migrations/023_mise_en_route_pilote.sql =====
-- =============================================================================
-- 023 — Mise en route du pilote (aucune donnée ajoutée, aucune donnée supprimée)
--
--  * Coordonnées de l'entreprise (réglages) : adresse, téléphone, e-mail,
--    identifiants légaux (ICE, RC, IF…) — affichées dans les en-têtes des PDF.
--  * Employés : horaire habituel (texte libre, informatif ; aucun calcul n'en dépend).
--  * Camions : numéro interne (unique s'il est renseigné) et type de camion.
-- =============================================================================

insert into public.settings (key, value) values
  ('company_address', '""'),
  ('company_phone', '""'),
  ('company_email', '""'),
  ('company_legal', '""')
on conflict (key) do nothing;

alter table public.employees add column if not exists work_schedule text not null default '';

alter table public.trucks add column if not exists internal_number text not null default '';
alter table public.trucks add column if not exists truck_type text not null default '';
create unique index if not exists trucks_internal_number_uniq on public.trucks (lower(internal_number)) where internal_number <> '';

-- ===== supabase/migrations/024_depart_employes.sql =====
-- =============================================================================
-- 024 — Départ, désactivation et suppression des employés
--
--  * Départ (démission, fin de contrat, licenciement, autre) : l'employé est DÉSACTIVÉ,
--    jamais supprimé. departure_date = dernier jour de travail : il reste proposé sur les
--    feuilles de pointage des dates antérieures ou égales (saisie rétroactive) ; tout
--    l'historique (pointage, rapports, congés…) est conservé tel quel.
--  * Suppression définitive : uniquement par la fonction delete_employee (administrateur),
--    seulement si l'employé n'apparaît dans AUCUN enregistrement (vérification automatique
--    de toutes les tables liées), avec confirmation par le matricule. Les liens de
--    configuration (remplaçant attitré, équipe d'un rippeur, chef d'équipe) sont retirés ;
--    l'historique des jours de repos de la fiche part avec elle. Journalisé (audit_log).
--  * La suppression directe par l'API est fermée (plus de politique DELETE sur employees).
-- =============================================================================

alter table public.employees add column if not exists departure_date date;
alter table public.employees add column if not exists departure_reason text;
alter table public.employees add column if not exists departure_comment text not null default '';
alter table public.employees drop constraint if exists employees_departure_reason_chk;
alter table public.employees add constraint employees_departure_reason_chk
  check (departure_reason is null or departure_reason in ('demission', 'fin_contrat', 'licenciement', 'autre'));
alter table public.employees drop constraint if exists employees_departure_chk;
alter table public.employees add constraint employees_departure_chk
  check ((departure_date is null) = (departure_reason is null));

-- Écriture : création et modification seulement (la suppression passe par delete_employee)
drop policy if exists "employees_write" on public.employees;
drop policy if exists "employees_insert" on public.employees;
create policy "employees_insert" on public.employees for insert to authenticated with check (public.can_edit('employes'));
drop policy if exists "employees_update" on public.employees;
create policy "employees_update" on public.employees for update to authenticated
  using (public.can_edit('employes')) with check (public.can_edit('employes'));

-- ---------- Enregistrements qui font référence à un employé ----------------------------
-- Toutes les clés étrangères vers employees sont lues dans le catalogue (aucune table oubliée,
-- y compris les tables ajoutées plus tard). Exclus : liens de configuration et historique de la fiche.
create or replace function public.employee_dependencies(p_employee uuid)
returns table (table_name text, label text, records bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fk record;
  n bigint;
begin
  if not public.can_view('employes') then
    raise exception 'ACCES_REFUSE: consultation non autorisée.';
  end if;
  for fk in
    select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f' and c.confrelid = 'public.employees'::regclass
       and c.conrelid::regclass::text not in ('employees', 'public.employees', 'team_leads', 'public.team_leads', 'employee_rest_day_history', 'public.employee_rest_day_history')
  loop
    execute format('select count(*) from %s where %I = $1', fk.tbl, fk.col) into n using p_employee;
    if n > 0 then
      table_name := regexp_replace(fk.tbl, '^public\.', '');
      label := case table_name
        when 'attendance' then 'Pointage'
        when 'attendance_leave_overrides' then 'Modifications autorisées sur congé'
        when 'cleaning_report_agents' then 'Rapports de nettoiement'
        when 'collection_reports' then 'Rapports de collecte (chauffeur)'
        when 'collection_report_rippers' then 'Rapports de collecte (équipier)'
        when 'truck_daily_reports' then 'Rapport camions'
        when 'fuel_entries' then 'Pleins de carburant'
        when 'leave_requests' then 'Demandes de congé'
        when 'leave_adjustments' then 'Corrections de solde de congé'
        when 'recovery_requests' then 'Demandes de récupération'
        when 'warnings' then 'Avertissements'
        when 'work_task_agents' then 'Programme de travail'
        when 'photos' then 'Photos'
        else table_name end;
      records := n;
      return next;
    end if;
  end loop;
end;
$$;
grant execute on function public.employee_dependencies(uuid) to authenticated;

-- ---------- Suppression définitive (administrateur, sans historique, confirmée) ----------
create or replace function public.delete_employee(p_employee uuid, p_confirm_matricule text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employees;
  deps text;
begin
  if not public.is_admin() then
    raise exception 'SUPPRESSION_REFUSEE: seul un administrateur peut supprimer définitivement un employé.';
  end if;
  select * into e from public.employees where id = p_employee for update;
  if not found then
    raise exception 'EMPLOYE_INTROUVABLE';
  end if;
  if coalesce(trim(p_confirm_matricule), '') <> e.matricule then
    raise exception 'CONFIRMATION_INVALIDE: saisissez le matricule exact pour confirmer.';
  end if;
  select string_agg(d.label || ' (' || d.records || ')', ', ') into deps from public.employee_dependencies(p_employee) d;
  if deps is not null then
    raise exception 'EMPLOYE_HISTORIQUE|%', deps;
  end if;
  -- Liens de configuration uniquement (aucun historique)
  update public.employees set substitute_id = null where substitute_id = p_employee;
  update public.employees set chauffeur_id = null where chauffeur_id = p_employee;
  update public.team_leads set employee_id = null where employee_id = p_employee;
  delete from public.employees where id = p_employee;   -- journalisé par employees_audit (DELETE, ancienne fiche)
end;
$$;
grant execute on function public.delete_employee(uuid, text) to authenticated;

-- ===== supabase/migrations/025_whatsapp.sql =====
-- =============================================================================
-- 025 — Envoi des rapports par WhatsApp (API officielle WhatsApp Business Cloud de Meta)
--
--  * whatsapp_config (une seule ligne) : identifiants Meta, destinataires, modèle de message.
--    AUCUNE politique RLS : lisible et modifiable uniquement par le serveur (clé service_role),
--    après vérification du rôle administrateur. Le jeton d'accès n'est jamais renvoyé au navigateur.
--    (Les variables d'environnement WHATSAPP_ACCESS_TOKEN / WHATSAPP_APP_SECRET /
--    WHATSAPP_VERIFY_TOKEN de Vercel ont priorité sur les valeurs enregistrées ici.)
--  * whatsapp_messages : journal de chaque envoi (rapport, destinataire, expéditeur, date,
--    statut, identifiant WhatsApp, erreur, nouvelle tentative). Écrit par le serveur seulement ;
--    lisible par l'administrateur et par l'expéditeur.
--  * Nouveau droit « Envoi WhatsApp » (Paramètres › Permissions) : par défaut administrateur
--    et secrétaire ; il faut aussi le droit de consulter le rapport envoyé.
-- =============================================================================

alter type public.app_module add value if not exists 'whatsapp';

create or replace function public.module_default_permission(p_module text, p_role text, p_edit boolean)
returns boolean
language sql
immutable
as $$
  select case
    when p_module = 'achats' then
      case p_role when 'admin' then true when 'secretaire' then true when 'lecture' then not p_edit else false end
    when p_module = 'whatsapp' then
      case p_role when 'admin' then true when 'secretaire' then true else false end
    else false
  end;
$$;

create table if not exists public.whatsapp_config (
  id                  smallint primary key default 1 check (id = 1),
  api_version         text not null default 'v26.0',
  phone_number_id     text not null default '',
  waba_id             text not null default '',
  access_token        text not null default '',
  app_secret          text not null default '',
  verify_token        text not null default '',
  manager_name        text not null default '',
  manager_number      text not null default '',
  extra_recipients    jsonb not null default '[]'::jsonb,   -- [{ "name": "...", "number": "212..." }]
  default_message     text not null default '',
  attach_pdf          boolean not null default true,
  send_mode           text not null default 'modele' check (send_mode in ('modele', 'session')),
  template_name       text not null default '',
  template_lang       text not null default 'fr',
  group_enabled       boolean not null default false,
  group_id            text not null default '',
  group_subject       text not null default '',
  group_invite_link   text not null default '',
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id)
);
insert into public.whatsapp_config (id) values (1) on conflict (id) do nothing;
alter table public.whatsapp_config enable row level security;
-- Pas de politique : accès serveur uniquement (service_role).

create table if not exists public.whatsapp_messages (
  id               uuid primary key default gen_random_uuid(),
  report_kind      text not null,
  report_params    jsonb not null default '{}'::jsonb,
  report_title     text not null,
  recipient_kind   text not null check (recipient_kind in ('directeur', 'destinataire', 'groupe', 'test')),
  recipient_label  text not null default '',
  recipient        text not null,                -- numéro (chiffres, format international) ou identifiant de groupe
  message_text     text not null default '',
  with_pdf         boolean not null default false,
  send_mode        text not null default 'modele',
  status           text not null default 'envoi_en_cours' check (status in ('envoi_en_cours', 'envoye', 'remis', 'lu', 'echec')),
  wa_message_id    text,
  error            text not null default '',
  dedupe_key       text not null,
  retry_of         uuid references public.whatsapp_messages (id),
  status_at        timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid not null references auth.users (id),
  updated_at       timestamptz not null default now()
);
create index if not exists whatsapp_messages_created_idx on public.whatsapp_messages (created_at desc);
create index if not exists whatsapp_messages_dedupe_idx on public.whatsapp_messages (dedupe_key, created_at desc);
create unique index if not exists whatsapp_messages_wa_id_uniq on public.whatsapp_messages (wa_message_id) where wa_message_id is not null;
-- Un seul envoi en cours à la fois pour un même rapport et un même destinataire (double clic)
create unique index if not exists whatsapp_messages_inflight_uniq on public.whatsapp_messages (dedupe_key) where status = 'envoi_en_cours';

alter table public.whatsapp_messages enable row level security;
drop policy if exists "whatsapp_messages_select" on public.whatsapp_messages;
create policy "whatsapp_messages_select" on public.whatsapp_messages for select to authenticated
  using (public.is_admin() or created_by = auth.uid());
-- Écriture : serveur uniquement (service_role), après vérification des droits.

-- ===== supabase/migrations/026_sans_whatsapp_date_entree.sql =====
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

-- ===== supabase/migrations/027_heures_sup_auto_manuel.sql =====
-- =============================================================================
-- 027 — Heures supplémentaires : automatique + manuel (toujours additionnés)
--
--  * attendance.overtime_manual : heures saisies par le responsable (ancienne colonne « HS »,
--    valeurs existantes reprises telles quelles).
--  * attendance.overtime_auto : calculé par la base depuis l'heure de sortie réelle et l'heure de
--    fin normale de l'entreprise (réglage normal_end_time, « HH:MM », vide = calcul désactivé).
--    Règle de l'entreprise : chaque demi-heure entamée après l'heure de fin normale compte 0,5 h.
--    Seulement pour un statut travaillé (Présent, Repos travaillé) et le 1er service du jour.
--    Recalculé uniquement quand l'heure de sortie (ou le statut / le service) change : la saisie
--    manuelle n'est jamais modifiée, et un changement ultérieur de l'heure de fin normale ne
--    réécrit pas l'historique.
--  * attendance.overtime_hours devient le TOTAL = automatique + manuel (colonne calculée) : tous les
--    totaux existants (synthèse mensuelle, rapports travailleurs…) additionnent donc les deux.
--  * Lignes existantes : automatique = 0 (le réglage est vide à l'installation) → totaux inchangés.
-- =============================================================================

insert into public.settings (key, value) values ('normal_end_time', '""') on conflict (key) do nothing;

alter table public.attendance add column if not exists overtime_manual numeric(5,2) not null default 0;
alter table public.attendance add column if not exists overtime_auto numeric(5,2) not null default 0;

-- Reprise des heures déjà saisies (déclencheurs suspendus : journées clôturées et journal non concernés)
alter table public.attendance disable trigger user;
update public.attendance set overtime_manual = overtime_hours where overtime_manual = 0 and overtime_hours <> 0;
alter table public.attendance enable trigger user;

alter table public.attendance drop constraint if exists attendance_overtime_manual_chk;
alter table public.attendance add constraint attendance_overtime_manual_chk check (overtime_manual >= 0 and overtime_manual <= 24);
alter table public.attendance drop constraint if exists attendance_overtime_auto_chk;
alter table public.attendance add constraint attendance_overtime_auto_chk check (overtime_auto >= 0 and overtime_auto <= 24);

alter table public.attendance drop column overtime_hours;
alter table public.attendance add column overtime_hours numeric(6,2) generated always as (overtime_manual + overtime_auto) stored;

-- Heure de fin normale (réglage), null si non configurée
create or replace function public.normal_end_time()
returns time
language sql
stable
security definer
set search_path = public
as $$
  select case when (value #>> '{}') ~ '^\d{1,2}:\d{2}$' then (value #>> '{}')::time end
    from public.settings where key = 'normal_end_time';
$$;

-- Calcul : demi-heures entamées après l'heure de fin normale
create or replace function public.auto_overtime(p_time_out time, p_end time, p_status text, p_shift integer)
returns numeric
language sql
immutable
as $$
  select case
    when p_time_out is null or p_end is null or p_shift <> 1 or p_status not in ('present', 'repos_travaille') or p_time_out <= p_end then 0
    else ceil(extract(epoch from (p_time_out - p_end)) / 1800.0) * 0.5
  end::numeric;
$$;

-- Statut non travaillé : pas d'heures (ni sortie, ni heures sup.)
create or replace function public.clear_times_when_not_worked()
returns trigger
language plpgsql
as $$
begin
  if new.status::text not in ('present', 'repos_travaille') then
    new.time_in := null;
    new.time_out := null;
    new.overtime_manual := 0;
    new.overtime_auto := 0;
  end if;
  return new;
end;
$$;

-- Composante automatique : calculée par la base, jamais saisie par le navigateur.
-- (Nom en « zz » : s'exécute après attendance_clear_times.)
create or replace function public.attendance_overtime_auto()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     or new.time_out is distinct from old.time_out
     or new.status is distinct from old.status
     or new.shift is distinct from old.shift then
    new.overtime_auto := least(24, public.auto_overtime(new.time_out, public.normal_end_time(), new.status::text, new.shift));
  else
    new.overtime_auto := old.overtime_auto;   -- inchangé (ex. seule la saisie manuelle a été modifiée)
  end if;
  return new;
end;
$$;
drop trigger if exists attendance_zz_overtime_auto on public.attendance;
create trigger attendance_zz_overtime_auto before insert or update on public.attendance
  for each row execute function public.attendance_overtime_auto();

-- ===== supabase/migrations/028_heures_sup_depuis_entree.sql =====
-- =============================================================================
-- 028 — Heures sup. automatiques calculées depuis l'heure d'entrée réelle
--
--  Règles de l'entreprise (remplacent l'heure de fin normale unique de la migration 027) :
--   * Journée standard : 8 heures à partir de l'heure d'entrée enregistrée.
--     Fin prévue = entrée + 8 h (06:00 → 14:00 ; 16:00 → 00:00 le lendemain ; 18:00 → 02:00).
--   * Sortie avant ou à la fin prévue : journée complète, 0 heure sup. automatique (rien n'est déduit).
--   * Sortie après la fin prévue : dépassement arrondi à l'heure entière supérieure
--     (30 min → 1 h ; 1 h 15 → 2 h ; 2 h → 2 h), y compris après minuit
--     (sortie plus « petite » que l'entrée = lendemain).
--   * Entrée ou sortie manquante, statut non travaillé : 0.
--   * Heures manuelles : inchangées, toujours ajoutées (total = automatique + manuel).
--  Historique : les lignes existantes ne sont PAS recalculées ; la nouvelle règle s'applique à toute
--  ligne créée, et à toute ligne dont l'heure d'entrée, de sortie ou le statut est modifié.
-- =============================================================================

create or replace function public.auto_overtime(p_time_in time, p_time_out time, p_status text)
returns numeric
language sql
immutable
as $$
  select case
    when p_time_in is null or p_time_out is null or p_status not in ('present', 'repos_travaille') then 0
    else greatest(0, ceil(
      (extract(epoch from (p_time_out - p_time_in)) + case when p_time_out < p_time_in then 86400 else 0 end - 8 * 3600) / 3600.0
    ))
  end::numeric;
$$;

create or replace function public.attendance_overtime_auto()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     or new.time_in is distinct from old.time_in
     or new.time_out is distinct from old.time_out
     or new.status is distinct from old.status then
    new.overtime_auto := least(24, public.auto_overtime(new.time_in, new.time_out, new.status::text));
  else
    new.overtime_auto := old.overtime_auto;   -- inchangé (ex. seule la saisie manuelle a été modifiée)
  end if;
  return new;
end;
$$;

-- Ancienne règle (heure de fin unique) retirée
drop function if exists public.auto_overtime(time, time, text, integer);
drop function if exists public.normal_end_time();
delete from public.settings where key = 'normal_end_time';

-- ===== supabase/migrations/029_matricule_facultatif.sql =====
-- =============================================================================
-- 029 — Matricule des employés facultatif
--
--  * employees.matricule peut rester vide (null). S'il est renseigné, il reste unique
--    (la contrainte unique existante accepte plusieurs valeurs nulles).
--  * Les enregistrements sont identifiés par leur identifiant interne (id), jamais par le matricule.
--  * Les doublons sans matricule sont empêchés par l'application (même nom et prénom).
--  * Suppression définitive : confirmation par le matricule, ou par le mot SUPPRIMER si l'employé
--    n'en a pas. Aucune donnée existante n'est modifiée.
-- =============================================================================

alter table public.employees alter column matricule drop not null;
-- Un matricule vide est enregistré comme absent (jamais une chaîne vide)
alter table public.employees drop constraint if exists employees_matricule_not_blank;
alter table public.employees add constraint employees_matricule_not_blank check (matricule is null or length(trim(matricule)) > 0) not valid;

create or replace function public.delete_employee(p_employee uuid, p_confirm_matricule text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employees;
  deps text;
begin
  if not public.is_admin() then
    raise exception 'SUPPRESSION_REFUSEE: seul un administrateur peut supprimer définitivement un employé.';
  end if;
  select * into e from public.employees where id = p_employee for update;
  if not found then
    raise exception 'EMPLOYE_INTROUVABLE';
  end if;
  if coalesce(trim(p_confirm_matricule), '') is distinct from coalesce(e.matricule, 'SUPPRIMER') then
    raise exception 'CONFIRMATION_INVALIDE: saisissez le matricule exact (ou SUPPRIMER si l''employé n''a pas de matricule).';
  end if;
  select string_agg(d.label || ' (' || d.records || ')', ', ') into deps from public.employee_dependencies(p_employee) d;
  if deps is not null then
    raise exception 'EMPLOYE_HISTORIQUE|%', deps;
  end if;
  update public.employees set substitute_id = null where substitute_id = p_employee;
  update public.employees set chauffeur_id = null where chauffeur_id = p_employee;
  update public.team_leads set employee_id = null where employee_id = p_employee;
  delete from public.employees where id = p_employee;
end;
$$;

-- ===== supabase/migrations/030_depart_maladie.sql =====
-- =============================================================================
-- 030 — Départ anticipé pour maladie
--
--  Cas normal (inchangé) : statut travaillé = journée standard de 8 h, même en partant avant la
--  fin prévue ; heures sup. automatiques au-delà de entrée + 8 h, + heures manuelles.
--
--  Cas exceptionnel, choisi explicitement (attendance.sick_departure) :
--   * statut obligatoirement « Absent maladie » ;
--   * 0 heure standard (ce n'est pas un jour travaillé) ;
--   * heures réellement travaillées avant le départ saisies UNIQUEMENT en heures sup. manuelles
--     (overtime_manual) ; aucune heure sup. automatique ;
--   * heure d'entrée, heure de départ, heures et commentaire (observation) conservés.
--  Les autres statuts non travaillés gardent leur règle : heures effacées.
--  Aucune ligne existante n'est modifiée.
-- =============================================================================

alter table public.attendance add column if not exists sick_departure boolean not null default false;
alter table public.attendance drop constraint if exists attendance_sick_departure_chk;
alter table public.attendance add constraint attendance_sick_departure_chk
  check (not sick_departure or status = 'absent_maladie');

create or replace function public.clear_times_when_not_worked()
returns trigger
language plpgsql
as $$
begin
  -- L'option ne vaut que pour « Absent maladie » (changement de statut : option retirée)
  if new.status::text <> 'absent_maladie' then
    new.sick_departure := false;
  end if;
  if new.status::text = 'absent_maladie' and new.sick_departure then
    -- Départ anticipé pour maladie : heures conservées, comptées seulement en heures sup. manuelles
    new.overtime_auto := 0;
  elsif new.status::text not in ('present', 'repos_travaille') then
    new.sick_departure := false;
    new.time_in := null;
    new.time_out := null;
    new.overtime_manual := 0;
    new.overtime_auto := 0;
  end if;
  return new;
end;
$$;

-- ===== supabase/migrations/031_postes_secretaire_responsable.sql =====
-- =============================================================================
-- 031 — Postes : ajout de « Secrétaire » et « Responsable », retrait de « Agent de sécurité »
--
--  * Nouveaux postes secretaire et responsable (équipe administrative rattachée à la collecte,
--    comme mécanicien, gardien, directeur : pointés sur la feuille Collecte, groupes dédiés).
--  * « Agent de sécurité » n'est plus proposé (l'application le retire des listes et refuse de
--    l'attribuer à une fiche). La valeur reste dans la base : les employés qui l'ont et tout leur
--    historique (pointage, rapports) sont conservés tels quels ; leur poste est à mettre à jour
--    lors de la prochaine modification de leur fiche. Aucune donnée n'est modifiée ici.
-- =============================================================================

alter type public.employee_position add value if not exists 'secretaire';
alter type public.employee_position add value if not exists 'responsable';

alter table public.employees drop constraint if exists employees_team_position_chk;
alter table public.employees add constraint employees_team_position_chk check (
  (position::text in ('chauffeur', 'rippeur', 'chauffeur_remplacant', 'rippeur_remplacant', 'superviseur', 'chef_equipe', 'agent_securite',
                      'mecanicien', 'gardien', 'directeur', 'autre', 'secretaire', 'responsable') and team_type = 'collecte') or
  (position::text = 'balayeur' and team_type = 'nettoiement')
);

-- ===== supabase/migrations/032_rappels_recurrents.sql =====
-- =============================================================================
-- 032 — Rappels récurrents (une fois, chaque jour, chaque semaine, jours choisis, chaque mois)
--
--  * reminders : fréquence, jours de la semaine (0 = dimanche … 6 = samedi), jour du mois,
--    heure (facultative), date de début (remind_date), date de fin, pause, priorité,
--    report (snoozed_until). Les rappels existants deviennent des rappels « une fois » (inchangés).
--  * reminder_completions : chaque occurrence terminée (date de l'occurrence, qui, quand).
--    Terminer une occurrence d'un rappel récurrent ne désactive jamais les suivantes.
--    Les rappels déjà marqués « faits » sont repris comme occurrence terminée.
--  * Les occurrences non terminées restent dues (« en retard ») jusqu'à ce qu'elles soient
--    terminées, même si l'application n'a pas été ouverte le jour prévu.
--  Fuseau : Africa/Casablanca (calcul effectué par l'application à l'ouverture).
-- =============================================================================

alter table public.reminders add column if not exists frequency text not null default 'once';
alter table public.reminders add column if not exists weekdays smallint[] not null default '{}';
alter table public.reminders add column if not exists month_day smallint;
alter table public.reminders add column if not exists remind_time time;
alter table public.reminders add column if not exists end_date date;
alter table public.reminders add column if not exists paused boolean not null default false;
alter table public.reminders add column if not exists priority text not null default 'normal';
alter table public.reminders add column if not exists snoozed_until date;

alter table public.reminders drop constraint if exists reminders_frequency_chk;
alter table public.reminders add constraint reminders_frequency_chk check (frequency in ('once', 'daily', 'weekly', 'weekdays', 'monthly'));
alter table public.reminders drop constraint if exists reminders_priority_chk;
alter table public.reminders add constraint reminders_priority_chk check (priority in ('normal', 'important', 'urgent'));
alter table public.reminders drop constraint if exists reminders_weekdays_chk;
alter table public.reminders add constraint reminders_weekdays_chk check (
  weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  and (frequency not in ('weekly', 'weekdays') or cardinality(weekdays) >= 1)
  and (frequency <> 'weekly' or cardinality(weekdays) = 1)
);
alter table public.reminders drop constraint if exists reminders_month_day_chk;
alter table public.reminders add constraint reminders_month_day_chk check ((month_day is null or month_day between 1 and 31) and (frequency <> 'monthly' or month_day is not null));
alter table public.reminders drop constraint if exists reminders_end_chk;
alter table public.reminders add constraint reminders_end_chk check (end_date is null or end_date >= remind_date);

-- ---------- Occurrences terminées ---------------------------------------------------
create table if not exists public.reminder_completions (
  id               uuid primary key default gen_random_uuid(),
  reminder_id      uuid not null references public.reminders (id) on delete cascade,
  occurrence_date  date not null,
  done_at          timestamptz not null default now(),
  done_by          uuid not null default auth.uid() references auth.users (id),
  constraint reminder_completions_uniq unique (reminder_id, occurrence_date)
);
create index if not exists reminder_completions_reminder_idx on public.reminder_completions (reminder_id, occurrence_date desc);

drop trigger if exists reminder_completions_audit on public.reminder_completions;
create trigger reminder_completions_audit after insert or update or delete on public.reminder_completions
  for each row execute function public.audit_trigger();

alter table public.reminder_completions enable row level security;
-- Visible / terminable par quiconque voit le rappel (le sien ou un rappel partagé)
drop policy if exists "reminder_completions_select" on public.reminder_completions;
create policy "reminder_completions_select" on public.reminder_completions for select to authenticated
  using (exists (select 1 from public.reminders r where r.id = reminder_id and (r.created_by = auth.uid() or r.shared)));
drop policy if exists "reminder_completions_insert" on public.reminder_completions;
create policy "reminder_completions_insert" on public.reminder_completions for insert to authenticated
  with check (done_by = auth.uid() and exists (select 1 from public.reminders r where r.id = reminder_id and (r.created_by = auth.uid() or r.shared)));
-- Annuler une occurrence terminée : celui qui l'a terminée, l'auteur du rappel, ou l'administrateur (rappel partagé)
drop policy if exists "reminder_completions_delete" on public.reminder_completions;
create policy "reminder_completions_delete" on public.reminder_completions for delete to authenticated
  using (done_by = auth.uid() or exists (select 1 from public.reminders r where r.id = reminder_id and (r.created_by = auth.uid() or (r.shared and public.is_admin()))));
grant select, insert, delete on public.reminder_completions to authenticated;

-- Reprise : rappels déjà « faits » → occurrence terminée (journal désactivé pour la reprise)
alter table public.reminder_completions disable trigger user;
insert into public.reminder_completions (reminder_id, occurrence_date, done_at, done_by)
select r.id, r.remind_date, r.done_at, coalesce(r.done_by, r.created_by)
  from public.reminders r
 where r.done_at is not null
on conflict (reminder_id, occurrence_date) do nothing;
alter table public.reminder_completions enable trigger user;

-- ===== supabase/migrations/033_conges_reprise_contrat.sql =====
-- =============================================================================
-- 033 — Reprise des congés depuis les registres papier, contrat de la société
--
--  Employés :
--   * leave_tracking_start : « Date de début dans le système » (début du suivi des congés dans
--     l'application). Vide = date de début du projet (réglage project_start_date).
--   * leave_taken_before : « Congés déjà pris avant le système » (information, JAMAIS déduite :
--     ces jours sont déjà reflétés dans le solde initial des registres papier).
--   * Modifiables uniquement par l'administrateur (journalisés comme toute modification de fiche).
--  Solde initial : correction de catégorie « solde_initial » (table leave_adjustments existante :
--   date, utilisateur, motif, nombre de jours) — réservé à l'administrateur.
--  Solde restant = solde initial + congés acquis depuis le début du suivi
--                  − congés approuvés pris depuis le début du suivi + autres corrections.
--   * Acquisition : réglage leave_days_per_month (1,5 j/mois) ; désactivable (leave_accrual_enabled)
--     pendant la vérification des registres.
--   * Début de l'acquisition : date d'entrée si elle est postérieure au début du suivi (nouvel
--     employé) ; sinon début du suivi, seulement si l'employé est suivi (date d'entrée connue,
--     solde initial saisi, « déjà en poste » coché ou début du suivi renseigné). Jamais une date
--     supposée.
--   * Seuls les congés approuvés (pointage « Congé » ou demande acceptée) sont déduits, et seulement
--     à partir du début du suivi.
--  Contrat de la société : réglages company_contract_start / _end / _ref et contract_alert_days ;
--   rappels partagés générés dans « Rappels et alertes » (reminders.system_key).
--  Aucune donnée existante n'est modifiée : sans date de début du projet ni solde initial, les soldes
--  restent calculés comme avant.
-- =============================================================================

alter table public.employees add column if not exists leave_tracking_start date;
alter table public.employees add column if not exists leave_taken_before numeric(5,1) check (leave_taken_before is null or leave_taken_before >= 0);

-- Données sensibles de reprise : administrateur uniquement (l'éditeur SQL, sans utilisateur connecté, reste possible)
create or replace function public.employees_leave_fields_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.leave_tracking_start is distinct from (case when tg_op = 'UPDATE' then old.leave_tracking_start end)
          or new.leave_taken_before is distinct from (case when tg_op = 'UPDATE' then old.leave_taken_before end)) then
    raise exception 'REPRISE_CONGES_ADMIN: seul un administrateur peut modifier les données de reprise des congés.';
  end if;
  return new;
end;
$$;
drop trigger if exists employees_leave_fields_guard on public.employees;
create trigger employees_leave_fields_guard before insert or update on public.employees
  for each row execute function public.employees_leave_fields_guard();

alter table public.leave_adjustments add column if not exists category text not null default 'correction';
alter table public.leave_adjustments drop constraint if exists leave_adjustments_category_chk;
alter table public.leave_adjustments add constraint leave_adjustments_category_chk
  check (category in ('correction', 'solde_initial') and (category = 'correction' or kind = 'conge'));

insert into public.settings (key, value) values
  ('leave_accrual_enabled', 'true'),
  ('company_contract_start', '""'),
  ('company_contract_end', '""'),
  ('company_contract_ref', '""'),
  ('contract_alert_days', '"90,60,30"')
on conflict (key) do nothing;

alter table public.reminders add column if not exists system_key text;
create unique index if not exists reminders_system_key_uniq on public.reminders (system_key) where system_key is not null;

-- ---------- Calcul des congés -------------------------------------------------------
create or replace function public.leave_tracking_start_of(p_tracking date)
returns date
language sql
stable
set search_path = public
as $$
  select coalesce(p_tracking, public.project_start());
$$;

-- Début de l'acquisition (null = aucun congé calculé)
create or replace function public.leave_accrual_from(p_hire date, p_tracking date, p_in_service boolean, p_has_initial boolean)
returns date
language sql
stable
set search_path = public
as $$
  select case
    when p_hire is not null then
      case when public.leave_tracking_start_of(p_tracking) is null then p_hire else greatest(p_hire, public.leave_tracking_start_of(p_tracking)) end
    when p_in_service or p_has_initial or p_tracking is not null then public.leave_tracking_start_of(p_tracking)
    else null
  end;
$$;

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
  taken_before    numeric
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
  st as (
    select e.id,
           public.leave_tracking_start_of(e.leave_tracking_start) as tr,
           public.leave_accrual_from(e.hire_date, e.leave_tracking_start, e.in_service_before_start, ini.employee_id is not null) as s,
           coalesce(ini.n, 0) as initial
      from public.employees e left join ini on ini.employee_id = e.id
  ),
  tk as (
    select t.employee_id, count(*)::numeric as n
      from public.days_taken('conge', null, p_as_of) t
      join st on st.id = t.employee_id
     where st.tr is null or t.day >= st.tr      -- congés pris avant le suivi : déjà dans le solde initial
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
         -- solde initial pris en compte à partir du début du suivi
         (case when st.tr is null or p_as_of >= st.tr then st.initial else 0 end)
           + (case when v_on then public.service_months(st.s, p_as_of) * v_rate else 0 end)
           - coalesce(tk.n, 0) + coalesce(adj.n, 0),
         st.s, st.initial, st.tr, e.leave_taken_before
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
  v_on boolean := coalesce((select (value #>> '{}')::boolean from public.settings where key = 'leave_accrual_enabled'), true);
  v_start date;
begin
  perform public.assert_can_read_balances();
  if not v_on then
    return;   -- acquisition désactivée (vérification des registres en cours)
  end if;
  select public.leave_accrual_from(e.hire_date, e.leave_tracking_start, e.in_service_before_start,
           exists (select 1 from public.leave_adjustments la where la.employee_id = e.id and la.kind = 'conge' and la.category = 'solde_initial'))
    into v_start from public.employees e where e.id = p_employee;
  if v_start is null then
    return;
  end if;
  return query
  select n, (v_start + make_interval(months => n))::date, v_rate, n * v_rate
    from generate_series(1, public.service_months(v_start, p_as_of)) n;
end;
$$;

-- ---------- Contrat de la société : rappels automatiques -------------------------------
-- Rappels partagés « une seule fois » dans « Rappels et alertes », identifiés par system_key :
--   contrat:<date de fin>:<n>       n jours avant la fin (réglage contract_alert_days, ex. 90,60,30) ;
--   contrat:<date de fin>:expire    le lendemain de la date de fin (contrat expiré).
-- Un seuil déjà dépassé n'est pas recréé dans le passé : seul le plus proche est créé pour aujourd'hui.
-- Les rappels déjà terminés restent dans l'historique ; ceux d'une ancienne date de fin non terminés
-- sont retirés. Appelée à chaque enregistrement du profil de l'entreprise.
create or replace function public.sync_contract_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Casablanca')::date;
  v_uid uuid := coalesce(auth.uid(), (select p.id from public.profiles p where p.role = 'admin' order by p.created_at limit 1));
  v_txt text := nullif(trim(coalesce((select value #>> '{}' from public.settings where key = 'company_contract_end'), '')), '');
  v_ref text := trim(coalesce((select value #>> '{}' from public.settings where key = 'company_contract_ref'), ''));
  v_days int[];
  v_end date;
  v_fin text;
  v_keys text[] := '{}';
  v_passed int;
  n int;
begin
  if auth.uid() is not null and not public.can_edit('parametres') then
    raise exception 'ACCES_REFUSE: modification des paramètres non autorisée.';
  end if;
  select coalesce(array_agg(distinct trim(x)::int order by trim(x)::int desc), '{}') into v_days
    from unnest(string_to_array(coalesce((select value #>> '{}' from public.settings where key = 'contract_alert_days'), ''), ',')) x
   where trim(x) ~ '^[0-9]{1,3}$' and trim(x)::int between 1 and 730;

  if v_txt is not null and v_uid is not null then
    v_end := v_txt::date;
    v_fin := to_char(v_end, 'DD/MM/YYYY');
    foreach n in array v_days loop
      if v_end - n >= v_today then
        v_keys := v_keys || ('contrat:' || v_end || ':' || n);
        insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
        values ('Fin du contrat de la société le ' || v_fin || ' (dans ' || n || ' jours)',
                'Le contrat de la société' || case when v_ref <> '' then ' (réf. ' || v_ref || ')' else '' end
                  || ' se termine le ' || v_fin || '. Préparez le renouvellement.',
                v_end - n, 0, true, 'once', case when n <= 30 then 'urgent' else 'important' end, v_uid,
                'contrat:' || v_end || ':' || n)
        on conflict (system_key) where system_key is not null do nothing;
      elsif v_end >= v_today then
        v_passed := n;   -- ordre décroissant : reste le seuil dépassé le plus proche
      end if;
    end loop;
    if v_passed is not null then
      v_keys := v_keys || ('contrat:' || v_end || ':' || v_passed);
      insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
      values ('Fin du contrat de la société le ' || v_fin || ' (moins de ' || v_passed || ' jours)',
              'Le contrat de la société' || case when v_ref <> '' then ' (réf. ' || v_ref || ')' else '' end
                || ' se termine le ' || v_fin || '. Préparez le renouvellement.',
              v_today, 0, true, 'once', case when v_passed <= 30 then 'urgent' else 'important' end, v_uid,
              'contrat:' || v_end || ':' || v_passed)
      on conflict (system_key) where system_key is not null do nothing;
    end if;
    v_keys := v_keys || ('contrat:' || v_end || ':expire');
    insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
    values ('Contrat de la société expiré (fin le ' || v_fin || ')',
            'Le contrat de la société' || case when v_ref <> '' then ' (réf. ' || v_ref || ')' else '' end
              || ' est arrivé à échéance le ' || v_fin || '. Renseignez la nouvelle date de fin dans Profil › Entreprise une fois renouvelé.',
            v_end + 1, 0, true, 'once', 'urgent', v_uid, 'contrat:' || v_end || ':expire')
    on conflict (system_key) where system_key is not null do nothing;
  end if;

  delete from public.reminders r
   where r.system_key like 'contrat:%' and not (r.system_key = any (v_keys))
     and r.done_at is null
     and not exists (select 1 from public.reminder_completions c where c.reminder_id = r.id);
  return cardinality(v_keys);
end;
$$;
revoke all on function public.sync_contract_reminders() from public;
grant execute on function public.sync_contract_reminders() to authenticated;

-- ===== supabase/migrations/034_achats_simplifies.sql =====
-- =============================================================================
-- 034 — Achats simplifiés
--
--  Saisie : date d'achat, description, catégorie, montant total (DH) saisi directement,
--  photos des achats (phase « materiel ») et de la facture / du bon (phase « justificatif »).
--  * Quantité, unité, prix unitaire, fournisseur et matériel deviennent facultatifs
--    (colonnes conservées : les achats existants gardent toutes leurs informations).
--  * Le montant total n'est plus recalculé (quantité × prix) : il est enregistré tel que saisi.
--    Les montants déjà enregistrés ne changent pas.
--  * Catégorie : liste existante + nouvelles catégories (texte libre).
--  * Les paiements déjà enregistrés sont conservés (le total ne peut toujours pas descendre
--    sous ce qui a été payé).
--  Aucune donnée n'est supprimée ni modifiée.
-- =============================================================================

alter table public.material_purchases drop constraint if exists material_purchases_supplier_name_check;
alter table public.material_purchases drop constraint if exists material_purchases_material_name_check;
alter table public.material_purchases drop constraint if exists material_purchases_quantity_check;
alter table public.material_purchases drop constraint if exists material_purchases_unit_price_check;
alter table public.material_purchases drop constraint if exists material_purchases_category_check;

alter table public.material_purchases alter column supplier_name set default '';
alter table public.material_purchases alter column material_name set default '';
alter table public.material_purchases alter column quantity drop not null;
alter table public.material_purchases alter column unit_price drop not null;

alter table public.material_purchases drop constraint if exists material_purchases_quantity_chk;
alter table public.material_purchases add constraint material_purchases_quantity_chk check (quantity is null or quantity > 0);
alter table public.material_purchases drop constraint if exists material_purchases_unit_price_chk;
alter table public.material_purchases add constraint material_purchases_unit_price_chk check (unit_price is null or unit_price >= 0);
alter table public.material_purchases drop constraint if exists material_purchases_category_chk;
alter table public.material_purchases add constraint material_purchases_category_chk check (length(trim(category)) between 1 and 60);
-- Un achat doit être identifiable : description (nouveaux achats) ou matériel (anciens achats)
alter table public.material_purchases drop constraint if exists material_purchases_label_chk;
alter table public.material_purchases add constraint material_purchases_label_chk
  check (length(trim(description)) > 0 or length(trim(material_name)) > 0) not valid;

-- Montant total : saisi directement (plus de calcul quantité × prix)
create or replace function public.material_purchase_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.total_amount is null or new.total_amount < 0 then
    raise exception 'MONTANT_INVALIDE: le montant total doit être positif.';
  end if;
  if new.cancelled and (tg_op = 'INSERT' or not old.cancelled) then
    new.cancelled_at := now();
  elsif not new.cancelled then
    new.cancelled_at := null;
    new.cancel_reason := '';
  end if;
  -- Paiements déjà enregistrés (ancien suivi) : le total ne peut pas descendre en dessous
  if tg_op = 'UPDATE' and new.total_amount < coalesce((select sum(p.amount) from public.material_purchase_payments p where p.purchase_id = new.id and not p.cancelled), 0) then
    raise exception 'PAIEMENT_SUPERIEUR: le montant total de l''achat ne peut pas être inférieur aux paiements déjà enregistrés.';
  end if;
  return new;
end;
$$;

-- ===== supabase/migrations/035_affectation_du_jour.sql =====
-- =============================================================================
-- 035 — Affectation temporaire d'un employé à l'autre équipe pour une journée
--
--  Exemple : un balayeur (Nettoiement) travaille à la Collecte le 12/11.
--  * daily_team_assignments : une ligne par employé et par date (équipe du jour, fonction du
--    jour, équipe de camion). La fiche de l'employé (équipe et poste permanents) n'est jamais
--    modifiée ; les autres dates ne sont pas concernées.
--  * set_day_assignment : enregistre l'affectation et déplace dans l'équipe du jour le pointage
--    déjà saisi pour cette date (statut, heures, HS, observation conservés) : l'employé ne figure
--    que sur une seule feuille.
--  * cancel_day_assignment : retire l'affectation ; le pointage de la date revient dans l'équipe
--    habituelle (poste habituel), sans perte.
--  * Protection : un employé ne peut pas être pointé dans les deux équipes à la même date ;
--    une affectation du jour impose l'équipe de ses lignes de pointage.
--  * Un pointage enregistré dans l'autre équipe (ajout manuel) crée l'affectation du jour.
--  * Journées clôturées : non modifiables ; journal d'audit comme pour le pointage.
-- =============================================================================

create table if not exists public.daily_team_assignments (
  id             uuid primary key default gen_random_uuid(),
  activity_date  date not null,
  employee_id    uuid not null references public.employees (id) on delete restrict,
  team_type      public.team_type not null,
  position       public.employee_position not null,
  chauffeur_id   uuid references public.employees (id) on delete set null,
  note           text not null default '',
  -- « manuel » : bouton « Ajouter un agent de Nettoiement » ; « pointage » : déduite d'une feuille enregistrée
  source         text not null default 'manuel' check (source in ('manuel', 'pointage')),
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  unique (activity_date, employee_id)
);
create index if not exists daily_team_assignments_date_idx on public.daily_team_assignments (activity_date);

drop trigger if exists daily_team_assignments_day_open on public.daily_team_assignments;
create trigger daily_team_assignments_day_open before insert or update or delete on public.daily_team_assignments
  for each row execute function public.assert_day_open();
drop trigger if exists daily_team_assignments_set_audit on public.daily_team_assignments;
create trigger daily_team_assignments_set_audit before insert or update on public.daily_team_assignments
  for each row execute function public.set_audit_columns();
drop trigger if exists daily_team_assignments_audit on public.daily_team_assignments;
create trigger daily_team_assignments_audit after insert or update or delete on public.daily_team_assignments
  for each row execute function public.audit_trigger();

alter table public.daily_team_assignments enable row level security;
drop policy if exists "daily_team_assignments_select" on public.daily_team_assignments;
create policy "daily_team_assignments_select" on public.daily_team_assignments for select to authenticated
  using (public.can_view('pointage') or public.can_view('rapport_journalier'));
drop policy if exists "daily_team_assignments_write" on public.daily_team_assignments;
create policy "daily_team_assignments_write" on public.daily_team_assignments for all to authenticated
  using (public.can_edit('pointage')) with check (public.can_edit('pointage'));
grant select, insert, update, delete on public.daily_team_assignments to authenticated;

-- ---------- Protection du pointage : une seule équipe par employé et par date -------------
create or replace function public.attendance_one_team_per_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned public.team_type;
  v_name text;
begin
  -- Déplacement en cours par set_day_assignment / cancel_day_assignment
  if coalesce(current_setting('esj.affectation_en_cours', true), '') = 'on' then
    return new;
  end if;
  select a.team_type into v_assigned from public.daily_team_assignments a
   where a.activity_date = new.activity_date and a.employee_id = new.employee_id;
  if v_assigned is not null and new.team_type <> v_assigned then
    select last_name || ' ' || first_name into v_name from public.employees where id = new.employee_id;
    raise exception 'AFFECTATION_DU_JOUR|%|%|%', coalesce(v_name, '?'), to_char(new.activity_date, 'DD/MM/YYYY'), v_assigned;
  end if;
  if exists (select 1 from public.attendance x
              where x.activity_date = new.activity_date and x.employee_id = new.employee_id
                and x.team_type <> new.team_type and x.id <> new.id) then
    select last_name || ' ' || first_name into v_name from public.employees where id = new.employee_id;
    raise exception 'POINTAGE_DEUX_EQUIPES|%|%', coalesce(v_name, '?'), to_char(new.activity_date, 'DD/MM/YYYY');
  end if;
  return new;
end;
$$;
drop trigger if exists attendance_one_team_per_day on public.attendance;
create trigger attendance_one_team_per_day before insert or update on public.attendance
  for each row execute function public.attendance_one_team_per_day();

-- Pointage enregistré dans une autre équipe que l'équipe permanente : affectation du jour créée
create or replace function public.attendance_record_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('esj.affectation_en_cours', true), '') = 'on' then
    return null;
  end if;
  if new.shift = 1 and new.team_type <> (select e.team_type from public.employees e where e.id = new.employee_id) then
    insert into public.daily_team_assignments (activity_date, employee_id, team_type, position, chauffeur_id, source, created_by)
    values (new.activity_date, new.employee_id, new.team_type, new.position, new.chauffeur_id, 'pointage', auth.uid())
    on conflict (activity_date, employee_id) do nothing;
  end if;
  return null;
end;
$$;
drop trigger if exists attendance_record_assignment on public.attendance;
create trigger attendance_record_assignment after insert or update of team_type on public.attendance
  for each row execute function public.attendance_record_assignment();

-- Ligne retirée de la feuille : une affectation déduite du pointage disparaît avec elle
create or replace function public.attendance_forget_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('esj.affectation_en_cours', true), '') = 'on' then
    return null;
  end if;
  delete from public.daily_team_assignments a
   where a.activity_date = old.activity_date and a.employee_id = old.employee_id and a.source = 'pointage'
     and not exists (select 1 from public.attendance x where x.activity_date = old.activity_date and x.employee_id = old.employee_id);
  return null;
end;
$$;
drop trigger if exists attendance_forget_assignment on public.attendance;
create trigger attendance_forget_assignment after delete on public.attendance
  for each row execute function public.attendance_forget_assignment();

-- ---------- Affecter / annuler ------------------------------------------------------------
create or replace function public.set_day_assignment(p_date date, p_employee uuid, p_team public.team_type, p_position public.employee_position, p_chauffeur uuid default null, p_note text default '')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.can_edit('pointage') then
    raise exception 'ACCES_REFUSE: modification du pointage non autorisée.';
  end if;
  if public.is_day_closed(p_date) then
    raise exception 'JOURNEE_CLOTUREE: la journée du % est clôturée, modification impossible.', to_char(p_date, 'DD/MM/YYYY');
  end if;
  if not exists (select 1 from public.employees where id = p_employee) then
    raise exception 'EMPLOYE_INCONNU';
  end if;
  insert into public.daily_team_assignments (activity_date, employee_id, team_type, position, chauffeur_id, note, source, created_by)
  values (p_date, p_employee, p_team, p_position, case when p_team = 'collecte' then p_chauffeur end, coalesce(p_note, ''), 'manuel', auth.uid())
  on conflict (activity_date, employee_id) do update
    set team_type = excluded.team_type, position = excluded.position, chauffeur_id = excluded.chauffeur_id, note = excluded.note, source = 'manuel';

  -- Pointage déjà saisi pour cette date dans l'autre équipe : déplacé (statut, heures, HS, observation conservés)
  perform set_config('esj.affectation_en_cours', 'on', true);
  update public.attendance a
     set team_type = p_team,
         position = p_position,
         chauffeur_id = case when p_team = 'collecte' and p_position::text <> 'chauffeur' then p_chauffeur end,
         truck_id = case when p_position::text in ('chauffeur', 'chauffeur_remplacant') then a.truck_id end,
         replacing_employee_id = null
   where a.activity_date = p_date and a.employee_id = p_employee and a.team_type <> p_team;
  get diagnostics n = row_count;
  perform set_config('esj.affectation_en_cours', 'off', true);
  return n;
end;
$$;
revoke all on function public.set_day_assignment(date, uuid, public.team_type, public.employee_position, uuid, text) from public;
grant execute on function public.set_day_assignment(date, uuid, public.team_type, public.employee_position, uuid, text) to authenticated;

create or replace function public.cancel_day_assignment(p_date date, p_employee uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employees;
  n integer;
begin
  if not public.can_edit('pointage') then
    raise exception 'ACCES_REFUSE: modification du pointage non autorisée.';
  end if;
  if public.is_day_closed(p_date) then
    raise exception 'JOURNEE_CLOTUREE: la journée du % est clôturée, modification impossible.', to_char(p_date, 'DD/MM/YYYY');
  end if;
  select * into e from public.employees where id = p_employee;
  delete from public.daily_team_assignments where activity_date = p_date and employee_id = p_employee;

  -- Pointage de la date : retour dans l'équipe et au poste habituels (rien n'est supprimé)
  perform set_config('esj.affectation_en_cours', 'on', true);
  update public.attendance a
     set team_type = e.team_type,
         position = e.position,
         chauffeur_id = case when e.position::text in ('rippeur', 'rippeur_remplacant') then e.chauffeur_id end,
         truck_id = case when e.position::text = 'chauffeur' then e.truck_id end,
         replacing_employee_id = null
   where a.activity_date = p_date and a.employee_id = p_employee and a.team_type <> e.team_type;
  get diagnostics n = row_count;
  perform set_config('esj.affectation_en_cours', 'off', true);
  return n;
end;
$$;
revoke all on function public.cancel_day_assignment(date, uuid) from public;
grant execute on function public.cancel_day_assignment(date, uuid) to authenticated;

-- ===== supabase/migrations/036_rapport_absents.sql =====
-- =============================================================================
-- 036 — Rapport des absents : absences par employé, certificats médicaux, politique d'absences
--
--  Source : le pointage. Un jour d'absence = un employé et une date où au moins une ligne est
--  « Absent » ou « Absent maladie » et aucune ligne n'est travaillée (Présent, Jour de repos
--  travaillé). Compté une seule fois par jour, quelle que soit l'équipe (Nettoiement / Collecte)
--  ou le service. Repos, Congé payé, Récupération, Jour férié ne sont jamais des absences.
--  Classement d'un jour :
--   * par défaut : « Absent » → non justifiée ; « Absent maladie » → maladie ;
--   * certificat médical refusé (vérification par un utilisateur autorisé) → non justifiée ;
--   * révision explicite (absence_reviews) : non justifiée / maladie / justifiée (autre motif).
--  Un certificat téléversé ne justifie rien automatiquement : il passe « Reçu », la vérification
--  reste à faire. Les dates d'absence et le pointage ne sont jamais modifiés.
--  Politique (absences non justifiées, cumul) :
--   * 2e : engagement écrit relatif aux absences requis (À préparer → En attente de signature → Signé) ;
--   * plus de 4 (5e et suivantes) : décision du responsable requise (jamais de désactivation automatique).
--  Rappels partagés dans « Rappels et alertes » (reminders.system_key, sans doublon).
--  Droits : consultation = module Pointage ; saisies, certificats et documents = Pointage en
--  modification (documents médicaux privés : non visibles en simple consultation).
-- =============================================================================

-- ---------- Révision du classement d'un jour d'absence ----------------------------------
create table if not exists public.absence_reviews (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees (id) on delete restrict,
  activity_date   date not null,
  classification  text not null check (classification in ('non_justifiee', 'maladie', 'justifiee')),
  comment         text not null default '',
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id),
  unique (employee_id, activity_date)
);

-- ---------- Certificats médicaux (un épisode de maladie, un ou plusieurs jours) -----------
create table if not exists public.medical_certificates (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees (id) on delete restrict,
  start_date    date not null,
  end_date      date not null,
  submitted_on  date,                                   -- date de remise (distincte des dates d'absence)
  status        text not null default 'en_attente' check (status in ('en_attente', 'recu', 'a_verifier')),
  verification  text not null default 'non_verifiee' check (verification in ('non_verifiee', 'acceptee', 'refusee')),
  comment       text not null default '',
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  constraint medical_certificates_dates_chk check (end_date >= start_date)
);
create index if not exists medical_certificates_employee_idx on public.medical_certificates (employee_id, start_date);

-- ---------- Engagement écrit et décisions du responsable --------------------------------
create table if not exists public.absence_actions (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.employees (id) on delete restrict,
  kind              text not null check (kind in ('engagement', 'decision')),
  unjustified_count integer not null default 0,         -- absences non justifiées au moment de l'action
  status            text check (status in ('a_preparer', 'en_attente_signature', 'signe')),
  signed_on         date,
  decision          text not null default '',
  decision_date     date,
  comment           text not null default '',
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id),
  constraint absence_actions_kind_chk check (
    (kind = 'engagement' and status is not null) or
    (kind = 'decision' and length(trim(decision)) > 0 and decision_date is not null))
);
create index if not exists absence_actions_employee_idx on public.absence_actions (employee_id, kind, created_at);

do $$
declare t text;
begin
  foreach t in array array['absence_reviews', 'medical_certificates', 'absence_actions'] loop
    execute format('drop trigger if exists %I_set_audit on public.%I', t, t);
    execute format('create trigger %I_set_audit before insert or update on public.%I for each row execute function public.set_audit_columns()', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_view(''pointage''))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.can_edit(''pointage'')) with check (public.can_edit(''pointage''))', t || '_write', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- Pièces jointes : certificats médicaux et engagements signés (privés) ----------
create or replace function public.photo_can_view(p_entity text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_entity = 'material_purchase' then public.can_view_module('achats')
    when p_entity in ('medical_certificate', 'absence_action') then public.can_edit('pointage')
    else public.can_view(public.photo_module(p_entity))
  end;
$$;
create or replace function public.photo_can_edit(p_entity text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_entity = 'material_purchase' then public.can_edit_module('achats')
    when p_entity in ('medical_certificate', 'absence_action') then public.can_edit('pointage')
    else public.can_edit(public.photo_module(p_entity))
  end;
$$;

-- Document ajouté à un certificat « En attente » : « Reçu » (date de remise = aujourd'hui si vide).
-- Jamais justifié automatiquement : la vérification reste à faire.
create or replace function public.medical_certificate_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entity_type = 'medical_certificate' then
    update public.medical_certificates
       set status = case when status = 'en_attente' then 'recu' else status end,
           submitted_on = coalesce(submitted_on, (now() at time zone 'Africa/Casablanca')::date)
     where id = new.entity_id;
  end if;
  return null;
end;
$$;
drop trigger if exists photos_medical_certificate_received on public.photos;
create trigger photos_medical_certificate_received after insert on public.photos
  for each row execute function public.medical_certificate_received();

-- ---------- Jours d'absence (dérivés du pointage) ---------------------------------------
create or replace function public.absence_days(p_from date default null, p_to date default null, p_employee uuid default null)
returns table (
  employee_id      uuid,
  activity_date    date,
  attendance_status text,
  classification   text,
  observation      text,
  review_comment   text,
  reviewed         boolean,
  certificate_id   uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view('pointage') then
    raise exception 'ACCES_REFUSE: consultation du pointage non autorisée.';
  end if;
  return query
  with att as (
    select a.employee_id, a.activity_date,
           bool_or(a.status::text in ('present', 'repos_travaille')) as worked,
           bool_or(a.status::text = 'absent_maladie') as sick,
           bool_or(a.status::text = 'absent') as unjust,
           string_agg(nullif(trim(a.observation), ''), ' ; ' order by a.shift) as obs
      from public.attendance a
     where (p_from is null or a.activity_date >= p_from)
       and (p_to is null or a.activity_date <= p_to)
       and (p_employee is null or a.employee_id = p_employee)
     group by a.employee_id, a.activity_date
  )
  select att.employee_id, att.activity_date,
         case when att.sick then 'absent_maladie' else 'absent' end,
         coalesce(r.classification,
                  case when att.sick and c.verification = 'refusee' then 'non_justifiee'
                       when att.sick then 'maladie'
                       else 'non_justifiee' end),
         coalesce(att.obs, ''), coalesce(r.comment, ''), r.id is not null, c.id
    from att
    left join public.absence_reviews r on r.employee_id = att.employee_id and r.activity_date = att.activity_date
    left join lateral (
      select mc.id, mc.verification from public.medical_certificates mc
       where mc.employee_id = att.employee_id and att.activity_date between mc.start_date and mc.end_date
       order by mc.created_at desc limit 1
    ) c on true
   where not att.worked and (att.sick or att.unjust);
end;
$$;
grant execute on function public.absence_days(date, date, uuid) to authenticated;

-- ---------- Synthèse par employé et statut d'alerte ---------------------------------------
create or replace function public.absence_summary(p_from date default null, p_to date default null)
returns table (
  employee_id          uuid,
  total                integer,
  non_justifiee        integer,
  maladie              integer,
  justifiee            integer,
  unjustified_all      integer,
  certificates         integer,
  certificates_pending integer,
  engagement_status    text,
  engagement_id        uuid,
  decision_count       integer,
  alert                text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view('pointage') then
    raise exception 'ACCES_REFUSE: consultation du pointage non autorisée.';
  end if;
  return query
  with per as (
    select d.employee_id,
           count(*)::int as total,
           count(*) filter (where d.classification = 'non_justifiee')::int as nj,
           count(*) filter (where d.classification = 'maladie')::int as ml,
           count(*) filter (where d.classification = 'justifiee')::int as js
      from public.absence_days(p_from, p_to) d group by d.employee_id
  ),
  alltime as (
    select d.employee_id, count(*) filter (where d.classification = 'non_justifiee')::int as nj
      from public.absence_days(null, null) d group by d.employee_id
  ),
  certs as (
    select mc.employee_id,
           count(*) filter (where mc.status in ('recu', 'a_verifier'))::int as submitted,
           count(*) filter (where mc.status in ('en_attente', 'a_verifier') or (mc.status = 'recu' and mc.verification = 'non_verifiee'))::int as pending
      from public.medical_certificates mc
     where (p_to is null or mc.start_date <= p_to) and (p_from is null or mc.end_date >= p_from)
     group by mc.employee_id
  ),
  eng as (
    select distinct on (x.employee_id) x.employee_id, x.status, x.id
      from public.absence_actions x where x.kind = 'engagement'
     order by x.employee_id, x.created_at desc
  ),
  dec as (
    select x.employee_id, max(x.unjustified_count)::int as cnt
      from public.absence_actions x where x.kind = 'decision' group by x.employee_id
  )
  select e.id,
         coalesce(per.total, 0), coalesce(per.nj, 0), coalesce(per.ml, 0), coalesce(per.js, 0),
         coalesce(alltime.nj, 0),
         coalesce(certs.submitted, 0), coalesce(certs.pending, 0),
         eng.status, eng.id, dec.cnt,
         case
           when coalesce(alltime.nj, 0) > 4 and coalesce(dec.cnt, 0) < coalesce(alltime.nj, 0) then 'decision_requise'
           when coalesce(alltime.nj, 0) >= 2 and coalesce(eng.status, '') <> 'signe' then 'engagement_requis'
           when coalesce(alltime.nj, 0) > 4 then 'decision_enregistree'
           when coalesce(alltime.nj, 0) >= 2 then 'engagement_signe'
           else 'aucune'
         end
    from public.employees e
    left join per on per.employee_id = e.id
    left join alltime on alltime.employee_id = e.id
    left join certs on certs.employee_id = e.id
    left join eng on eng.employee_id = e.id
    left join dec on dec.employee_id = e.id;
end;
$$;
grant execute on function public.absence_summary(date, date) to authenticated;

-- ---------- Rappels partagés (sans doublon) ------------------------------------------------
--  absence:engagement:<employé>            engagement écrit requis (2e absence non justifiée)
--  absence:decision:<employé>:<nombre>     décision requise (5e absence non justifiée ou plus)
--  Un rappel dont la situation est réglée (engagement signé, décision enregistrée, pointage
--  corrigé) est retiré s'il n'a pas été marqué terminé.
create or replace function public.sync_absence_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(auth.uid(), (select p.id from public.profiles p where p.role = 'admin' order by p.created_at limit 1));
  v_today date := (now() at time zone 'Africa/Casablanca')::date;
  v_keys text[] := '{}';
  s record;
  v_key text;
  v_name text;
begin
  if auth.uid() is not null and not public.can_view('pointage') then
    raise exception 'ACCES_REFUSE: consultation du pointage non autorisée.';
  end if;
  if v_uid is null then
    return 0;
  end if;
  for s in select * from public.absence_summary(null, null) x where x.alert in ('engagement_requis', 'decision_requise') loop
    select last_name || ' ' || first_name into v_name from public.employees where id = s.employee_id;
    if s.alert = 'decision_requise' then
      v_key := 'absence:decision:' || s.employee_id || ':' || s.unjustified_all;
      insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
      values ('Absences — ' || v_name || ' : plus de quatre absences non justifiées : décision du responsable requise',
              s.unjustified_all || ' absences non justifiées enregistrées. Consultez l''historique dans Pointage › Rapport des absents et enregistrez la décision.',
              v_today, 0, true, 'once', 'urgent', v_uid, v_key)
      on conflict (system_key) where system_key is not null do nothing;
    else
      v_key := 'absence:engagement:' || s.employee_id;
      insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
      values ('Absences — ' || v_name || ' : deuxième absence non justifiée : engagement écrit requis',
              'Préparez l''engagement écrit relatif aux absences (Pointage › Rapport des absents), faites-le signer et enregistrez le document signé.',
              v_today, 0, true, 'once', 'important', v_uid, v_key)
      on conflict (system_key) where system_key is not null do nothing;
    end if;
    v_keys := v_keys || v_key;
  end loop;
  delete from public.reminders r
   where r.system_key like 'absence:%' and not (r.system_key = any (v_keys))
     and r.done_at is null
     and not exists (select 1 from public.reminder_completions c where c.reminder_id = r.id);
  return cardinality(v_keys);
end;
$$;
revoke all on function public.sync_absence_alerts() from public;
grant execute on function public.sync_absence_alerts() to authenticated;

-- ---------- Historique des modifications (journal d'audit) d'un employé ----------------------
create or replace function public.absence_audit(p_employee uuid)
returns table (at timestamptz, tbl text, action text, user_email text, old_data jsonb, new_data jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view('pointage') then
    raise exception 'ACCES_REFUSE: consultation du pointage non autorisée.';
  end if;
  return query
  select l.created_at, l.table_name, l.action, l.user_email, l.old_data, l.new_data
    from public.audit_log l
   where l.table_name in ('absence_reviews', 'medical_certificates', 'absence_actions')
     and coalesce(l.new_data, l.old_data) ->> 'employee_id' = p_employee::text
   order by l.created_at desc
   limit 200;
end;
$$;
grant execute on function public.absence_audit(uuid) to authenticated;

-- ===== supabase/migrations/037_conges_avant_systeme.sql =====
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

-- ===== supabase/migrations/038_contrats_societe.sql =====
-- =============================================================================
-- 038 — Contrats de la société : création, clôture, archives, export, suppression définitive
--
--  * company_contracts : contrats successifs de la société (un seul profil de société).
--    Statuts : brouillon, actif, termine, archive. Période d'un contrat = date de début →
--    date de clôture effective (sinon date de fin).
--  * Rattachement aux enregistrements PAR LES DATES : un rapport, un pointage, un achat… appartient
--    au contrat dont la période contient sa date. Aucun enregistrement existant n'est modifié.
--  * Contrat clôturé (terminé / archivé) : les enregistrements datés de sa période (pointage,
--    rapports, photos…) sont protégés comme une journée clôturée, sauf si un contrat actif ou en
--    brouillon couvre aussi la date. Consultation et export restent possibles.
--  * Rappels « Rappels et alertes » par contrat actif : n jours avant la fin (alert_days), le jour
--    de la fin, puis après l'échéance s'il n'est ni clôturé ni renouvelé (sans doublon).
--  * Suppression définitive (administrateur, contrat terminé ou archivé, période ne chevauchant
--    aucun autre contrat, référence retapée) : supprime le contrat et toutes les données
--    d'exploitation datées de sa période (liste exacte : contract_deletion_preview). Les fiches
--    employés et camions, les demandes de congés / récupération, les corrections de solde, les
--    jours fériés et les engagements / décisions d'absence ne sont pas supprimés. Les fichiers
--    du stockage sont retirés par l'application (chemins renvoyés). L'événement est journalisé.
-- =============================================================================

create table if not exists public.company_contracts (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null check (length(trim(reference)) > 0),
  description   text not null default '',
  start_date    date not null,
  end_date      date not null,
  status        text not null default 'actif' check (status in ('brouillon', 'actif', 'termine', 'archive')),
  closed_on     date,
  closure_note  text not null default '',
  alert_days    text not null default '90,60,30',
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  constraint company_contracts_dates_chk check (end_date >= start_date),
  constraint company_contracts_closed_chk check (closed_on is null or closed_on >= start_date)
);
create index if not exists company_contracts_dates_idx on public.company_contracts (start_date, end_date);

drop trigger if exists company_contracts_set_audit on public.company_contracts;
create trigger company_contracts_set_audit before insert or update on public.company_contracts
  for each row execute function public.set_audit_columns();
drop trigger if exists company_contracts_audit on public.company_contracts;
create trigger company_contracts_audit after insert or update or delete on public.company_contracts
  for each row execute function public.audit_trigger();

alter table public.company_contracts enable row level security;
drop policy if exists "company_contracts_select" on public.company_contracts;
create policy "company_contracts_select" on public.company_contracts for select to authenticated using (public.can_view('parametres'));
drop policy if exists "company_contracts_write" on public.company_contracts;
create policy "company_contracts_insert" on public.company_contracts for insert to authenticated with check (public.can_edit('parametres'));
drop policy if exists "company_contracts_update" on public.company_contracts;
create policy "company_contracts_update" on public.company_contracts for update to authenticated using (public.can_edit('parametres')) with check (public.can_edit('parametres'));
-- Pas de suppression directe : uniquement par delete_contract_permanently (administrateur)
grant select, insert, update on public.company_contracts to authenticated;

-- Reprise du contrat saisi dans le profil de l'entreprise (migration 033)
insert into public.company_contracts (reference, start_date, end_date, status, alert_days)
select coalesce(nullif(trim(r.value #>> '{}'), ''), 'Contrat ' || to_char((e.value #>> '{}')::date, 'YYYY')),
       coalesce(nullif(trim(s.value #>> '{}'), '')::date, least((e.value #>> '{}')::date, current_date)),
       (e.value #>> '{}')::date,
       'actif',
       coalesce(nullif(trim(a.value #>> '{}'), ''), '90,60,30')
  from public.settings e
  left join public.settings s on s.key = 'company_contract_start'
  left join public.settings r on r.key = 'company_contract_ref'
  left join public.settings a on a.key = 'contract_alert_days'
 where e.key = 'company_contract_end' and coalesce(e.value #>> '{}', '') ~ '^\d{4}-\d{2}-\d{2}$'
   and not exists (select 1 from public.company_contracts);

-- ---------- Pièces jointes du contrat (contrat signé…) ------------------------------------
create or replace function public.photo_can_view(p_entity text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_entity = 'material_purchase' then public.can_view_module('achats')
    when p_entity in ('medical_certificate', 'absence_action') then public.can_edit('pointage')
    when p_entity = 'company_contract' then public.can_view('parametres')
    else public.can_view(public.photo_module(p_entity))
  end;
$$;
create or replace function public.photo_can_edit(p_entity text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_entity = 'material_purchase' then public.can_edit_module('achats')
    when p_entity in ('medical_certificate', 'absence_action') then public.can_edit('pointage')
    when p_entity = 'company_contract' then public.can_edit('parametres')
    else public.can_edit(public.photo_module(p_entity))
  end;
$$;

-- ---------- Période et protection des contrats clôturés -------------------------------------
create or replace function public.contract_period_end(c public.company_contracts)
returns date
language sql
immutable
as $$
  select coalesce(c.closed_on, c.end_date);
$$;

-- Contrat clôturé couvrant la date (et aucun contrat actif / en brouillon ne la couvre)
create or replace function public.locked_contract_for(p_date date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.reference from public.company_contracts c
   where c.status in ('termine', 'archive') and p_date between c.start_date and coalesce(c.closed_on, c.end_date)
     and not exists (select 1 from public.company_contracts o
                      where o.status in ('brouillon', 'actif') and p_date between o.start_date and coalesce(o.closed_on, o.end_date))
   limit 1;
$$;

create or replace function public.assert_day_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old date;
  v_new date;
  v_ref text;
begin
  -- Suppression définitive d'un contrat (delete_contract_permanently) : contrôles levés
  if coalesce(current_setting('esj.suppression_contrat', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := (to_jsonb(old) ->> 'activity_date')::date;
    if v_old is not null and public.is_day_closed(v_old) then
      raise exception 'JOURNEE_CLOTUREE: la journée du % est clôturée, modification impossible.', to_char(v_old, 'DD/MM/YYYY');
    end if;
    v_ref := case when v_old is not null then public.locked_contract_for(v_old) end;
    if v_ref is not null then
      raise exception 'CONTRAT_CLOTURE|%|%', v_ref, to_char(v_old, 'DD/MM/YYYY');
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := (to_jsonb(new) ->> 'activity_date')::date;
    if v_new is not null and public.is_day_closed(v_new) then
      raise exception 'JOURNEE_CLOTUREE: la journée du % est clôturée, modification impossible.', to_char(v_new, 'DD/MM/YYYY');
    end if;
    v_ref := case when v_new is not null then public.locked_contract_for(v_new) end;
    if v_ref is not null then
      raise exception 'CONTRAT_CLOTURE|%|%', v_ref, to_char(v_new, 'DD/MM/YYYY');
    end if;
    return new;
  end if;
  return old;
end;
$$;

-- Congé approuvé : protection levée uniquement pendant la suppression définitive d'un contrat
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
  if coalesce(current_setting('esj.suppression_contrat', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_row := case when tg_op = 'DELETE' then old else new end;
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

-- ---------- Rappels par contrat ---------------------------------------------------------
--  contrat:<id>:<n>       n jours avant la fin (seuil dépassé : le plus proche, daté d'aujourd'hui)
--  contrat:<id>:fin       le jour de la fin
--  contrat:<id>:expire    le lendemain de la fin (contrat ni clôturé ni renouvelé)
-- Les rappels non terminés des contrats clôturés, archivés ou modifiés (et ceux de l'ancien
-- format « contrat:<date>:… ») sont retirés.
create or replace function public.sync_contract_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Casablanca')::date;
  v_uid uuid := coalesce(auth.uid(), (select p.id from public.profiles p where p.role = 'admin' order by p.created_at limit 1));
  v_keys text[] := '{}';
  c record;
  v_days int[];
  v_passed int;
  v_fin text;
  v_lbl text;
  n int;
begin
  if auth.uid() is not null and not public.can_view('parametres') then
    raise exception 'ACCES_REFUSE: consultation des paramètres non autorisée.';
  end if;
  if v_uid is not null then
    for c in select * from public.company_contracts where status = 'actif' loop
      v_fin := to_char(c.end_date, 'DD/MM/YYYY');
      v_lbl := 'Contrat ' || c.reference;
      select coalesce(array_agg(distinct trim(x)::int order by trim(x)::int desc), '{}') into v_days
        from unnest(string_to_array(coalesce(c.alert_days, ''), ',')) x
       where trim(x) ~ '^[0-9]{1,3}$' and trim(x)::int between 1 and 730;
      v_passed := null;
      foreach n in array v_days loop
        if c.end_date - n >= v_today then
          v_keys := v_keys || ('contrat:' || c.id || ':' || n);
          insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
          values (v_lbl || ' : fin le ' || v_fin || ' (dans ' || n || ' jours)',
                  'Le contrat ' || c.reference || ' se termine le ' || v_fin || '. Préparez le renouvellement ou la clôture (Profil › Contrats).',
                  c.end_date - n, 0, true, 'once', case when n <= 30 then 'urgent' else 'important' end, v_uid, 'contrat:' || c.id || ':' || n)
          on conflict (system_key) where system_key is not null do nothing;
        elsif c.end_date >= v_today then
          v_passed := n;
        end if;
      end loop;
      if v_passed is not null then
        v_keys := v_keys || ('contrat:' || c.id || ':' || v_passed);
        insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
        values (v_lbl || ' : fin le ' || v_fin || ' (moins de ' || v_passed || ' jours)',
                'Le contrat ' || c.reference || ' se termine le ' || v_fin || '. Préparez le renouvellement ou la clôture (Profil › Contrats).',
                v_today, 0, true, 'once', case when v_passed <= 30 then 'urgent' else 'important' end, v_uid, 'contrat:' || c.id || ':' || v_passed)
        on conflict (system_key) where system_key is not null do nothing;
      end if;
      if c.end_date >= v_today then
        v_keys := v_keys || ('contrat:' || c.id || ':fin');
        insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
        values (v_lbl || ' : dernier jour du contrat (' || v_fin || ')',
                'Le contrat ' || c.reference || ' prend fin aujourd''hui. Clôturez-le ou ouvrez le nouveau contrat (Profil › Contrats).',
                c.end_date, 0, true, 'once', 'urgent', v_uid, 'contrat:' || c.id || ':fin')
        on conflict (system_key) where system_key is not null do nothing;
      end if;
      v_keys := v_keys || ('contrat:' || c.id || ':expire');
      insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
      values (v_lbl || ' expiré (fin le ' || v_fin || ')',
              'Le contrat ' || c.reference || ' est arrivé à échéance le ' || v_fin || ' sans être clôturé ni renouvelé. Clôturez-le ou ouvrez le nouveau contrat (Profil › Contrats).',
              c.end_date + 1, 0, true, 'once', 'urgent', v_uid, 'contrat:' || c.id || ':expire')
      on conflict (system_key) where system_key is not null do nothing;
    end loop;
  end if;
  delete from public.reminders r
   where r.system_key like 'contrat:%' and not (r.system_key = any (v_keys))
     and r.done_at is null
     and not exists (select 1 from public.reminder_completions rc where rc.reminder_id = r.id);
  return cardinality(v_keys);
end;
$$;
revoke all on function public.sync_contract_reminders() from public;
grant execute on function public.sync_contract_reminders() to authenticated;

-- ---------- Synthèse du contrat (PDF « rapport du contrat », archives) ----------------------
create or replace function public.contract_report_summary(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.company_contracts;
  f date;
  t date;
  r jsonb;
begin
  if not public.can_view('parametres') then
    raise exception 'ACCES_REFUSE: consultation des paramètres non autorisée.';
  end if;
  select * into c from public.company_contracts where id = p_id;
  if not found then
    return null;
  end if;
  f := c.start_date;
  t := coalesce(c.closed_on, c.end_date);
  select jsonb_build_object(
    'from', f, 'to', t,
    'pointage_jours', (select count(distinct activity_date) from public.attendance where activity_date between f and t),
    'pointage_lignes', (select count(*) from public.attendance where activity_date between f and t),
    'pointage_premier', (select min(activity_date) from public.attendance where activity_date between f and t),
    'pointage_dernier', (select max(activity_date) from public.attendance where activity_date between f and t),
    'heures_sup', (select coalesce(sum(overtime_hours), 0) from public.attendance where activity_date between f and t),
    'absences', (select count(*) from (select distinct employee_id, activity_date from public.attendance where activity_date between f and t and status::text in ('absent', 'absent_maladie')) x),
    'journees_cloturees', (select count(*) from public.work_days where activity_date between f and t and status = 'closed'),
    'rapports_nettoiement', (select count(*) from public.cleaning_reports where activity_date between f and t),
    'rapports_collecte', (select count(*) from public.collection_reports where activity_date between f and t),
    'rapports_camions', (select count(*) from public.truck_daily_reports where activity_date between f and t),
    'tonnage', (select coalesce(sum(coalesce(tonnage_total, coalesce(tonnage1, 0) + coalesce(tonnage2, 0))), 0) from public.truck_daily_reports where activity_date between f and t),
    'vidages', (select coalesce(sum(dumps_count), 0) from public.truck_daily_reports where activity_date between f and t),
    'pleins', (select count(*) from public.fuel_entries where activity_date between f and t),
    'carburant_litres', (select coalesce(sum(liters), 0) from public.fuel_entries where activity_date between f and t),
    'carburant_cout', (select coalesce(sum(cost), 0) from public.fuel_entries where activity_date between f and t),
    'reparations', (select count(*) from public.truck_repairs where reported_date between f and t),
    'reparations_cout', (select coalesce(sum(cost), 0) from public.truck_repairs where reported_date between f and t),
    'achats', (select count(*) from public.material_purchases where purchase_date between f and t and not cancelled),
    'achats_total', (select coalesce(sum(total_amount), 0) from public.material_purchases where purchase_date between f and t and not cancelled),
    'dechet_vert', (select count(*) from public.green_waste_entries where activity_date between f and t),
    'taches', (select count(*) from public.work_tasks where planned_date between f and t),
    'avertissements', (select count(*) from public.warnings where incident_date between f and t),
    'conges_acceptes', (select count(*) from public.leave_requests where status::text = 'acceptee' and start_date <= t and end_date >= f),
    'certificats', (select count(*) from public.medical_certificates where start_date between f and t),
    'photos', (select count(*) from public.photos where activity_date between f and t)
  ) into r;
  return r;
end;
$$;
grant execute on function public.contract_report_summary(uuid) to authenticated;

-- ---------- Suppression définitive -----------------------------------------------------------
-- Enregistrements supprimés (catégorie, table, nombre) — lecture seule, avant confirmation
create or replace function public.contract_deletion_preview(p_id uuid)
returns table (category text, items bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.company_contracts;
  f date;
  t date;
begin
  if not public.is_admin() then
    raise exception 'ACCES_REFUSE: suppression définitive réservée à l''administrateur.';
  end if;
  select * into c from public.company_contracts where id = p_id;
  if not found then
    return;
  end if;
  f := c.start_date;
  t := coalesce(c.closed_on, c.end_date);
  return query
  select x.cat, x.n from (values
    ('Pointage (lignes)', (select count(*) from public.attendance where activity_date between f and t)),
    ('Journées (ouverture / clôture)', (select count(*) from public.work_days where activity_date between f and t)),
    ('Chefs d''équipe des feuilles', (select count(*) from public.attendance_sheet_meta where activity_date between f and t)),
    ('Affectations du jour', (select count(*) from public.daily_team_assignments where activity_date between f and t)),
    ('Autorisations sur congé approuvé', (select count(*) from public.attendance_leave_overrides where activity_date between f and t)),
    ('Rapports mensuels finalisés', (select count(*) from public.attendance_period_snapshots where period_start >= f and period_end <= t)),
    ('Classements d''absence corrigés', (select count(*) from public.absence_reviews where activity_date between f and t)),
    ('Certificats médicaux', (select count(*) from public.medical_certificates where start_date between f and t)),
    ('Rapports de nettoiement', (select count(*) from public.cleaning_reports where activity_date between f and t)),
    ('Récapitulatif nettoiement', (select count(*) from public.cleaning_daily_summary where activity_date between f and t)),
    ('Rapports de collecte', (select count(*) from public.collection_reports where activity_date between f and t)),
    ('Rapport camions (lignes)', (select count(*) from public.truck_daily_reports where activity_date between f and t)),
    ('Pleins de carburant', (select count(*) from public.fuel_entries where activity_date between f and t)),
    ('Réparations de camions', (select count(*) from public.truck_repairs where reported_date between f and t)),
    ('Achats', (select count(*) from public.material_purchases where purchase_date between f and t)),
    ('Déchet vert', (select count(*) from public.green_waste_entries where activity_date between f and t)),
    ('Programme de travail', (select count(*) from public.work_tasks where planned_date between f and t)),
    ('Avertissements', (select count(*) from public.warnings where incident_date between f and t)),
    ('Photos et pièces jointes', (select count(*) from public.photos p where p.activity_date between f and t
        or (p.entity_type = 'company_contract' and p.entity_id = p_id)
        or (p.entity_type = 'material_purchase' and p.entity_id in (select id from public.material_purchases where purchase_date between f and t))
        or (p.entity_type = 'truck_repair' and p.entity_id in (select id from public.truck_repairs where reported_date between f and t))
        or (p.entity_type = 'warning' and p.entity_id in (select id from public.warnings where incident_date between f and t))
        or (p.entity_type = 'work_task' and p.entity_id in (select id from public.work_tasks where planned_date between f and t))
        or (p.entity_type = 'medical_certificate' and p.entity_id in (select id from public.medical_certificates where start_date between f and t))))
  ) x(cat, n)
  where x.n > 0;
end;
$$;
grant execute on function public.contract_deletion_preview(uuid) to authenticated;

-- Raison du blocage de la suppression définitive (null = possible)
create or replace function public.contract_deletion_blocker(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.company_contracts;
  o text;
begin
  select * into c from public.company_contracts where id = p_id;
  if not found then
    return 'Contrat introuvable.';
  end if;
  if c.status not in ('termine', 'archive') then
    return 'Clôturez ou archivez d''abord le contrat.';
  end if;
  select string_agg(x.reference, ', ') into o from public.company_contracts x
   where x.id <> p_id and x.start_date <= coalesce(c.closed_on, c.end_date) and coalesce(x.closed_on, x.end_date) >= c.start_date;
  if o is not null then
    return 'La période chevauche un autre contrat (' || o || ') : les enregistrements ne sont pas séparables.';
  end if;
  return null;
end;
$$;
grant execute on function public.contract_deletion_blocker(uuid) to authenticated;

create or replace function public.delete_contract_permanently(p_id uuid, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.company_contracts;
  f date;
  t date;
  v_block text;
  v_paths text[];
  v_counts jsonb;
begin
  if not public.is_admin() then
    raise exception 'ACCES_REFUSE: suppression définitive réservée à l''administrateur.';
  end if;
  select * into c from public.company_contracts where id = p_id for update;
  if not found then
    raise exception 'CONTRAT_INTROUVABLE';
  end if;
  if coalesce(trim(p_confirm), '') <> c.reference then
    raise exception 'CONFIRMATION_INVALIDE: retapez exactement la référence du contrat.';
  end if;
  v_block := public.contract_deletion_blocker(p_id);
  if v_block is not null then
    raise exception 'SUPPRESSION_BLOQUEE: %', v_block;
  end if;
  f := c.start_date;
  t := coalesce(c.closed_on, c.end_date);
  select coalesce(jsonb_object_agg(category, items), '{}'::jsonb) into v_counts from public.contract_deletion_preview(p_id);

  perform set_config('esj.suppression_contrat', 'on', true);
  perform set_config('esj.affectation_en_cours', 'on', true);

  -- Photos et pièces jointes (chemins renvoyés pour suppression des fichiers du stockage)
  with gone as (
    delete from public.photos p
     where p.activity_date between f and t
        or (p.entity_type = 'company_contract' and p.entity_id = p_id)
        or (p.entity_type = 'material_purchase' and p.entity_id in (select id from public.material_purchases where purchase_date between f and t))
        or (p.entity_type = 'truck_repair' and p.entity_id in (select id from public.truck_repairs where reported_date between f and t))
        or (p.entity_type = 'warning' and p.entity_id in (select id from public.warnings where incident_date between f and t))
        or (p.entity_type = 'work_task' and p.entity_id in (select id from public.work_tasks where planned_date between f and t))
        or (p.entity_type = 'medical_certificate' and p.entity_id in (select id from public.medical_certificates where start_date between f and t))
        or (p.entity_type in ('cleaning_report_agent') and p.entity_id in (select id from public.cleaning_report_agents where activity_date between f and t))
        or (p.entity_type in ('collection_report') and p.entity_id in (select id from public.collection_reports where activity_date between f and t))
        or (p.entity_type in ('green_waste') and p.entity_id in (select id from public.green_waste_entries where activity_date between f and t))
        or (p.entity_type in ('fuel_entry') and p.entity_id in (select id from public.fuel_entries where activity_date between f and t))
        or (p.entity_type in ('truck_report') and p.entity_id in (select id from public.truck_daily_reports where activity_date between f and t))
    returning p.storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_paths from gone;

  delete from public.attendance_leave_overrides where activity_date between f and t;
  delete from public.attendance where activity_date between f and t;
  delete from public.attendance_sheet_meta where activity_date between f and t;
  delete from public.daily_team_assignments where activity_date between f and t;
  delete from public.attendance_period_snapshots where period_start >= f and period_end <= t;
  delete from public.absence_reviews where activity_date between f and t;
  delete from public.medical_certificates where start_date between f and t;
  delete from public.cleaning_reports where activity_date between f and t;          -- agents en cascade
  delete from public.cleaning_report_agents where activity_date between f and t;
  delete from public.cleaning_daily_summary where activity_date between f and t;
  delete from public.collection_reports where activity_date between f and t;        -- équipiers en cascade
  delete from public.truck_daily_reports where activity_date between f and t;
  delete from public.fuel_entries where activity_date between f and t;
  delete from public.truck_repairs where reported_date between f and t;
  delete from public.material_purchase_payments where purchase_id in (select id from public.material_purchases where purchase_date between f and t);
  delete from public.material_purchases where purchase_date between f and t;
  delete from public.green_waste_entries where activity_date between f and t;
  delete from public.work_tasks where planned_date between f and t;                 -- agents en cascade
  delete from public.warnings where incident_date between f and t;
  delete from public.work_days where activity_date between f and t;
  delete from public.reminders r where r.system_key like 'contrat:' || p_id || ':%'
     and not exists (select 1 from public.reminder_completions rc where rc.reminder_id = r.id);
  delete from public.company_contracts where id = p_id;

  insert into public.audit_log (table_name, record_id, action, new_data, user_id, user_email)
  values ('company_contracts', p_id::text, 'DELETE',
          jsonb_build_object('suppression_definitive', true, 'reference', c.reference, 'du', f, 'au', t, 'supprime', v_counts, 'fichiers', cardinality(v_paths)),
          auth.uid(), (select email from public.profiles where id = auth.uid()));

  perform set_config('esj.suppression_contrat', 'off', true);
  perform set_config('esj.affectation_en_cours', 'off', true);
  return jsonb_build_object('counts', v_counts, 'paths', to_jsonb(v_paths));
end;
$$;
revoke all on function public.delete_contract_permanently(uuid, text) from public;
grant execute on function public.delete_contract_permanently(uuid, text) to authenticated;

-- ===== supabase/migrations/039_conges_depuis_entree.sql =====
-- =============================================================================
-- 039 — Congés calculés depuis la date d'entrée en service (méthode par défaut)
--
--  Règle de l'entreprise : Solde congé = 1,5 j par mois complet de service depuis la date
--  d'entrée en service réelle (jusqu'à aujourd'hui) ; Solde pris = congés pris avant le système
--  (saisis) + congés approuvés et déjà pris dans l'application ; Solde restant = Solde congé −
--  Solde pris. Date d'entrée inconnue : aucun calcul (à compléter).
--  * Méthode par défaut : « congés pris avant le système » (pris_avant), pour les nouveaux
--    employés et pour les employés existants SANS solde initial saisi (registres papier).
--  * Les employés dont un solde initial confirmé a été saisi gardent la méthode « solde initial »
--    (leurs chiffres confirmés ne sont pas remplacés) ; l'administrateur peut changer la méthode.
--  Aucune donnée n'est supprimée ; les demandes de congés et l'historique sont conservés.
-- =============================================================================

alter table public.employees alter column leave_start_method set default 'pris_avant';

update public.employees e
   set leave_start_method = 'pris_avant'
 where e.leave_start_method = 'solde_initial'
   and not exists (select 1 from public.leave_adjustments la where la.employee_id = e.id and la.kind = 'conge' and la.category = 'solde_initial');

-- Données de reprise : administrateur uniquement (création : méthode par défaut seulement)
create or replace function public.employees_leave_fields_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.leave_tracking_start is distinct from (case when tg_op = 'UPDATE' then old.leave_tracking_start end)
          or new.leave_taken_before is distinct from (case when tg_op = 'UPDATE' then old.leave_taken_before end)
          or (tg_op = 'UPDATE' and new.leave_start_method is distinct from old.leave_start_method)
          or (tg_op = 'INSERT' and new.leave_start_method <> 'pris_avant')) then
    raise exception 'REPRISE_CONGES_ADMIN: seul un administrateur peut modifier les données de reprise des congés.';
  end if;
  return new;
end;
$$;

-- ===== supabase/migrations/040_conges_deux_champs.sql =====
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

-- ===== supabase/migrations/041_periode_de_travail.sql =====
-- =============================================================================
-- 041 — Période de travail et horaires par défaut ; fonctions de bureau sans heures sup.
--
--  * employees.work_period : Matin, Après-midi, Milieu de journée, Nuit (facultatif). Sert à
--    préremplir l'heure d'entrée et de sortie dans le pointage (valeurs modifiables chaque jour,
--    jamais imposées ; les pointages enregistrés ne sont pas modifiés) :
--      - mécanicien, chef d'équipe : 06:00 – 14:00 (toujours) ;
--      - gardien : Matin 06:00 – 14:00, Milieu de journée 14:00 – 22:00, Nuit 22:00 – 06:00 (lendemain) ;
--      - autres : Matin 06:00 – 14:00, Après-midi 16:00 – 00:00 (lendemain).
--    Une sortie plus « petite » que l'entrée est le lendemain (calcul des heures et des heures sup.
--    existant, migration 028) : 16:00 – 00:00 = 8 h, 22:00 – 06:00 = 8 h.
--  * Directeur, Secrétaire, Responsable : repos le dimanche (jour de repos défini s'il était vide),
--    jours fériés non travaillés (statut « Jour férié » proposé, comme pour tous) et AUCUNE heure
--    supplémentaire (automatique et manuelle remises à 0, y compris en cas de travail exceptionnel).
--  Aucun pointage existant n'est modifié.
-- =============================================================================

alter table public.employees add column if not exists work_period text;
alter table public.employees drop constraint if exists employees_work_period_chk;
alter table public.employees add constraint employees_work_period_chk check (work_period is null or work_period in ('matin', 'apres_midi', 'milieu', 'nuit'));

update public.employees set rest_day = 0
 where position::text in ('directeur', 'secretaire', 'responsable') and rest_day is null;

-- Fonctions de bureau : jamais d'heures supplémentaires (après le calcul automatique)
create or replace function public.attendance_office_no_overtime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.position::text in ('directeur', 'secretaire', 'responsable')
     or exists (select 1 from public.employees e where e.id = new.employee_id and e.position::text in ('directeur', 'secretaire', 'responsable')) then
    new.overtime_auto := 0;
    new.overtime_manual := 0;
  end if;
  return new;
end;
$$;
drop trigger if exists attendance_zzz_office_no_overtime on public.attendance;
create trigger attendance_zzz_office_no_overtime before insert or update on public.attendance
  for each row execute function public.attendance_office_no_overtime();

-- ===== supabase/migrations/042_conges_hors_repos.sql =====
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

-- ===== supabase/migrations/043_historique_pointage.sql =====
-- =============================================================================
-- 043 — Historique du pointage : journal des modifications d'une feuille
--
--  Le pointage est déjà conservé ligne par ligne et par date (table attendance, jamais écrasée
--  par une autre date) et chaque création / modification / suppression est journalisée
--  (audit_log : utilisateur, date, anciennes et nouvelles valeurs). Cette fonction lit ce journal
--  pour une date et une équipe, pour l'afficher sous la feuille de présence.
-- =============================================================================

create or replace function public.attendance_day_audit(p_date date, p_team text)
returns table (at timestamptz, action text, user_email text, employee_id uuid, old_data jsonb, new_data jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view('pointage') then
    raise exception 'ACCES_REFUSE: consultation du pointage non autorisée.';
  end if;
  return query
  select l.created_at, l.action, l.user_email,
         (coalesce(l.new_data, l.old_data) ->> 'employee_id')::uuid, l.old_data, l.new_data
    from public.audit_log l
   where l.table_name = 'attendance'
     and coalesce(l.new_data, l.old_data) ->> 'activity_date' = p_date::text
     and (coalesce(l.new_data ->> 'team_type', '') = p_team or coalesce(l.old_data ->> 'team_type', '') = p_team)
   order by l.created_at desc
   limit 500;
end;
$$;
grant execute on function public.attendance_day_audit(date, text) to authenticated;

-- ===== supabase/migrations/044_historique_modifiable.sql =====
-- =============================================================================
-- 044 — Historique modifiable : feuilles et rapports par date, journal des modifications
--
--  Aucune donnée n'est modifiée : les feuilles de présence et les rapports sont déjà enregistrés
--  ligne par ligne et par date (jamais remplacés par une autre date), et chaque création /
--  modification / suppression est déjà journalisée dans audit_log (utilisateur, date, valeurs
--  avant / après). Cette migration ajoute seulement des fonctions de lecture :
--   - attendance_sheets_summary  : feuilles de présence par date et par équipe (historique) ;
--   - daily_reports_summary      : rapports journaliers par date (historique) ;
--   - record_changes             : journal détaillé d'un rapport (champ, avant, après, qui, quand) ;
--   - record_change_summary      : indicateur « modifié » + dernière modification par enregistrement.
--  Un enregistrement sans changement réel (même valeurs) n'est pas compté comme une modification.
-- =============================================================================

-- Recherche du journal par date d'activité (feuilles et rapports d'une date)
create index if not exists audit_log_activity_date_idx
  on public.audit_log (table_name, (coalesce(new_data, old_data) ->> 'activity_date'));

-- Vrai changement : suppression, ou modification d'au moins un champ métier
create or replace function public.audit_real_change(p_action text, p_old jsonb, p_new jsonb)
returns boolean
language sql
immutable
as $$
  select p_action = 'DELETE'
      or (p_action = 'UPDATE'
          and (coalesce(p_old, '{}'::jsonb) - array['updated_at', 'updated_by', 'created_at', 'created_by'])
              is distinct from
              (coalesce(p_new, '{}'::jsonb) - array['updated_at', 'updated_by', 'created_at', 'created_by']));
$$;

-- ---------- Feuilles de présence par date et par équipe ------------------------------------------
create or replace function public.attendance_sheets_summary(p_from date, p_to date)
returns table (
  activity_date date,
  team_type     text,
  rows_count    integer,
  worked_count  integer,
  last_at       timestamptz,
  last_user     text,
  modified      boolean,
  closed        boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view('pointage') then
    raise exception 'ACCES_REFUSE: consultation du pointage non autorisée.';
  end if;
  return query
  with s as (
    select a.activity_date d, a.team_type::text team, count(*)::int n,
           count(*) filter (where a.status::text in ('present', 'repos_travaille'))::int worked
      from public.attendance a
     where a.activity_date between p_from and p_to
     group by 1, 2
  ), l as (
    select (coalesce(x.new_data, x.old_data) ->> 'activity_date')::date d,
           coalesce(x.new_data ->> 'team_type', x.old_data ->> 'team_type') team,
           bool_or(public.audit_real_change(x.action, x.old_data, x.new_data)) modified,
           max(x.created_at) last_at,
           (array_agg(x.user_email order by x.created_at desc))[1] last_user
      from public.audit_log x
     where x.table_name = 'attendance'
       and coalesce(x.new_data, x.old_data) ->> 'activity_date' between p_from::text and p_to::text
     group by 1, 2
  )
  select coalesce(s.d, l.d), coalesce(s.team, l.team), coalesce(s.n, 0), coalesce(s.worked, 0),
         l.last_at, l.last_user, coalesce(l.modified, false),
         exists (select 1 from public.work_days w where w.activity_date = coalesce(s.d, l.d) and w.status::text = 'closed')
    from s full join l on l.d = s.d and l.team = s.team
   order by 1 desc, 2;
end;
$$;
grant execute on function public.attendance_sheets_summary(date, date) to authenticated;

-- ---------- Rapports journaliers par date -----------------------------------------------------
create or replace function public.daily_reports_summary(p_from date, p_to date)
returns table (
  activity_date     date,
  cleaning_agents   integer,
  collection_count  integer,
  truck_lines       integer,
  tonnage           numeric,
  summary_rows      integer,
  last_at           timestamptz,
  last_user         text,
  modified          boolean,
  closed            boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.can_view('rapport_journalier') or public.can_view('rapport_camions')) then
    raise exception 'ACCES_REFUSE: consultation des rapports non autorisée.';
  end if;
  return query
  with d as (
    select r.activity_date d from public.cleaning_reports r where r.activity_date between p_from and p_to
    union select c.activity_date from public.collection_reports c where c.activity_date between p_from and p_to
    union select t.activity_date from public.truck_daily_reports t where t.activity_date between p_from and p_to
    union select g.activity_date from public.cleaning_daily_summary g where g.activity_date between p_from and p_to
  ), l as (
    select (coalesce(x.new_data, x.old_data) ->> 'activity_date')::date d,
           bool_or(public.audit_real_change(x.action, x.old_data, x.new_data)) modified,
           max(x.created_at) last_at,
           (array_agg(x.user_email order by x.created_at desc))[1] last_user
      from public.audit_log x
     where x.table_name in ('cleaning_reports', 'cleaning_report_agents', 'collection_reports', 'truck_daily_reports', 'cleaning_daily_summary')
       and coalesce(x.new_data, x.old_data) ->> 'activity_date' between p_from::text and p_to::text
     group by 1
  )
  select d.d,
         (select count(*)::int from public.cleaning_report_agents a where a.activity_date = d.d and not a.excluded),
         (select count(*)::int from public.collection_reports c where c.activity_date = d.d),
         (select count(*)::int from public.truck_daily_reports t where t.activity_date = d.d),
         (select coalesce(sum(t.tonnage_total), 0) from public.truck_daily_reports t where t.activity_date = d.d),
         (select count(*)::int from public.cleaning_daily_summary g where g.activity_date = d.d),
         l.last_at, l.last_user, coalesce(l.modified, false),
         exists (select 1 from public.work_days w where w.activity_date = d.d and w.status::text = 'closed')
    from d left join l on l.d = d.d
   order by 1 desc;
end;
$$;
grant execute on function public.daily_reports_summary(date, date) to authenticated;

-- ---------- Journal détaillé d'un rapport ------------------------------------------------------
create or replace function public.audit_table_module(p_table text)
returns text
language sql
immutable
as $$
  select case p_table
    when 'attendance' then 'pointage'
    when 'cleaning_reports' then 'rapport_journalier'
    when 'cleaning_report_agents' then 'rapport_journalier'
    when 'collection_reports' then 'rapport_journalier'
    when 'collection_report_rippers' then 'rapport_journalier'
    when 'cleaning_daily_summary' then 'rapport_journalier'
    when 'truck_daily_reports' then 'rapport_camions'
  end;
$$;

-- Équipiers d'un rapport de collecte : ajouts et retraits journalisés (journal du rapport)
drop trigger if exists collection_report_rippers_audit on public.collection_report_rippers;
create trigger collection_report_rippers_audit after insert or delete on public.collection_report_rippers
  for each row execute function public.audit_trigger();

-- Par identifiants (p_ids, ou rapport parent : report_id) et / ou par date d'activité (p_date) ; les enregistrements sans
-- changement réel sont omis. Du plus récent au plus ancien.
create or replace function public.record_changes(p_table text, p_ids uuid[] default null, p_date date default null)
returns table (record_id text, at timestamptz, action text, user_email text, old_data jsonb, new_data jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_module text := public.audit_table_module(p_table);
begin
  if v_module is null then
    raise exception 'TABLE_INCONNUE: %', p_table;
  end if;
  if not public.can_view(v_module::public.app_module) then
    raise exception 'ACCES_REFUSE: historique non autorisé.';
  end if;
  return query
  select l.record_id, l.created_at, l.action, l.user_email, l.old_data, l.new_data
    from public.audit_log l
   where l.table_name = p_table
     and ((p_ids is not null and (l.record_id = any (p_ids::text[]) or coalesce(l.new_data, l.old_data) ->> 'report_id' = any (p_ids::text[])))
       or (p_date is not null and coalesce(l.new_data, l.old_data) ->> 'activity_date' = p_date::text))
     and (l.action in ('INSERT', 'DELETE') or public.audit_real_change(l.action, l.old_data, l.new_data))
   order by l.created_at desc
   limit 500;
end;
$$;
grant execute on function public.record_changes(text, uuid[], date) to authenticated;

-- Indicateur « modifié » et dernière modification réelle, par enregistrement
create or replace function public.record_change_summary(p_table text, p_ids uuid[])
returns table (record_id text, modified boolean, last_at timestamptz, last_user text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_module text := public.audit_table_module(p_table);
begin
  if v_module is null then
    raise exception 'TABLE_INCONNUE: %', p_table;
  end if;
  if not public.can_view(v_module::public.app_module) then
    raise exception 'ACCES_REFUSE: historique non autorisé.';
  end if;
  return query
  select l.record_id,
         bool_or(public.audit_real_change(l.action, l.old_data, l.new_data)),
         max(l.created_at) filter (where l.action = 'INSERT' or public.audit_real_change(l.action, l.old_data, l.new_data)),
         (array_agg(l.user_email order by l.created_at desc) filter (where l.action = 'INSERT' or public.audit_real_change(l.action, l.old_data, l.new_data)))[1]
    from public.audit_log l
   where l.table_name = p_table and l.record_id = any (p_ids::text[])
   group by l.record_id;
end;
$$;
grant execute on function public.record_change_summary(text, uuid[]) to authenticated;

-- ===== supabase/migrations/045_certificats_medicaux.sql =====
-- =============================================================================
-- 045 — Certificats médicaux : PDF, entrée créée depuis le pointage « Absent maladie »
--
--  Réutilise le module existant (migration 036) : table medical_certificates (employé, période
--  de maladie, date de remise, statut, vérification) et documents dans le bucket privé « photos »
--  (entity_type = 'medical_certificate', accès réservé : pointage en modification, liens signés
--  temporaires, jamais d'URL publique). Aucune donnée existante n'est modifiée ou supprimée.
--
--  1. Le stockage accepte aussi les PDF (certificat scanné), 10 Mo maximum par fichier.
--  2. Pointage « Absent maladie » → entrée « En attente de certificat » créée automatiquement pour
--     la période de maladie (jours consécutifs, jours de repos / non pointés entre deux compris),
--     ou prolongée ; jamais de doublon (un jour déjà couvert par un certificat ne crée rien).
--     Pointage corrigé (plus « Absent maladie ») : l'entrée automatique encore vide (aucun document,
--     toujours « En attente ») est réduite ou retirée. Une entrée avec document n'est jamais touchée.
--  3. Reprise : les jours « Absent maladie » déjà pointés sans certificat reçoivent leur entrée.
-- =============================================================================

-- ---------- 1. PDF acceptés dans le bucket privé ----------------------------------------------
update storage.buckets
   set allowed_mime_types = (select array_agg(distinct m) from unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) m),
       file_size_limit = greatest(coalesce(file_size_limit, 0), 10485760)
 where id = 'photos';

-- ---------- 2. Entrée créée automatiquement depuis le pointage ------------------------------
alter table public.medical_certificates add column if not exists auto_created boolean not null default false;

-- Jour de maladie : au moins une ligne « Absent maladie » et aucune ligne travaillée ce jour
create or replace function public.is_sick_day(p_employee uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select bool_or(a.status::text = 'absent_maladie') and not bool_or(a.status::text in ('present', 'repos_travaille'))
    from public.attendance a
   where a.employee_id = p_employee and a.activity_date = p_date;
$$;

-- Aucun jour travaillé entre deux dates (exclues) : même épisode de maladie
create or replace function public.no_work_between(p_employee uuid, p_after date, p_before date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.attendance a
     where a.employee_id = p_employee and a.activity_date > p_after and a.activity_date < p_before
       and a.status::text in ('present', 'repos_travaille', 'absent'));
$$;

-- Entrée « En attente de certificat » encore vide (créée automatiquement, aucun document)
create or replace function public.certificate_is_empty_auto(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.medical_certificates c
     where c.id = p_id and c.auto_created and c.status = 'en_attente' and c.verification = 'non_verifiee'
       and not exists (select 1 from public.photos p where p.entity_type = 'medical_certificate' and p.entity_id = c.id));
$$;

create or replace function public.sync_sick_certificate(p_employee uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_start date;
  v_end date;
  v_min date;
  v_max date;
begin
  if p_employee is null or p_date is null then
    return;
  end if;
  if coalesce(public.is_sick_day(p_employee, p_date), false) then
    -- Déjà couvert par un certificat (automatique ou saisi) : rien à créer
    if exists (select 1 from public.medical_certificates c where c.employee_id = p_employee and p_date between c.start_date and c.end_date) then
      return;
    end if;
    -- Même épisode : entrée automatique vide juste avant (prolongée) ou juste après (avancée)
    select c.id into v_id from public.medical_certificates c
     where c.employee_id = p_employee and c.end_date < p_date and p_date - c.end_date <= 7
       and public.certificate_is_empty_auto(c.id) and public.no_work_between(p_employee, c.end_date, p_date)
     order by c.end_date desc limit 1;
    if v_id is not null then
      update public.medical_certificates set end_date = p_date where id = v_id;
      return;
    end if;
    select c.id into v_id from public.medical_certificates c
     where c.employee_id = p_employee and c.start_date > p_date and c.start_date - p_date <= 7
       and public.certificate_is_empty_auto(c.id) and public.no_work_between(p_employee, p_date, c.start_date)
     order by c.start_date limit 1;
    if v_id is not null then
      update public.medical_certificates set start_date = p_date where id = v_id;
      return;
    end if;
    insert into public.medical_certificates (employee_id, start_date, end_date, status, verification, auto_created, comment)
    values (p_employee, p_date, p_date, 'en_attente', 'non_verifiee', true, '');
  else
    -- Plus « Absent maladie » ce jour : l'entrée automatique encore vide suit le pointage
    for v_id, v_start, v_end in
      select c.id, c.start_date, c.end_date from public.medical_certificates c
       where c.employee_id = p_employee and p_date between c.start_date and c.end_date and public.certificate_is_empty_auto(c.id)
    loop
      select min(g.d::date), max(g.d::date) into v_min, v_max
        from generate_series(v_start::timestamp, v_end::timestamp, interval '1 day') g(d)
       where g.d::date <> p_date and coalesce(public.is_sick_day(p_employee, g.d::date), false);
      if v_min is null then
        delete from public.medical_certificates where id = v_id;
      elsif v_min <> v_start or v_max <> v_end then
        update public.medical_certificates set start_date = v_min, end_date = v_max where id = v_id;
      end if;
    end loop;
  end if;
end;
$$;
revoke all on function public.sync_sick_certificate(uuid, date) from public;

create or replace function public.attendance_sick_certificate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.sync_sick_certificate(old.employee_id, old.activity_date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.employee_id is distinct from old.employee_id or new.activity_date is distinct from old.activity_date or new.status is distinct from old.status) then
    perform public.sync_sick_certificate(new.employee_id, new.activity_date);
  end if;
  return null;
end;
$$;
drop trigger if exists attendance_sick_certificate on public.attendance;
create trigger attendance_sick_certificate after insert or update of status, employee_id, activity_date or delete on public.attendance
  for each row execute function public.attendance_sick_certificate();

-- Certificat saisi à la main (ou dates corrigées) : il remplace les entrées automatiques encore vides
-- qui le chevauchent (pas de doublon) ; les jours de maladie hors de sa période gardent leur entrée.
create or replace function public.medical_certificate_absorb_auto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  d date;
begin
  if new.auto_created and tg_op = 'INSERT' then
    return null;
  end if;
  for a in
    select c.id, c.start_date, c.end_date from public.medical_certificates c
     where c.employee_id = new.employee_id and c.id <> new.id
       and c.start_date <= new.end_date and c.end_date >= new.start_date
       and public.certificate_is_empty_auto(c.id)
  loop
    delete from public.medical_certificates where id = a.id;
    for d in select g::date from generate_series(a.start_date::timestamp, a.end_date::timestamp, interval '1 day') g loop
      if d < new.start_date or d > new.end_date then
        perform public.sync_sick_certificate(new.employee_id, d);
      end if;
    end loop;
  end loop;
  return null;
end;
$$;
drop trigger if exists medical_certificates_absorb_auto on public.medical_certificates;
create trigger medical_certificates_absorb_auto after insert or update of start_date, end_date, employee_id on public.medical_certificates
  for each row execute function public.medical_certificate_absorb_auto();

-- ---------- 3. Reprise des jours « Absent maladie » déjà pointés ------------------------------
do $$
declare r record;
begin
  for r in
    select distinct a.employee_id, a.activity_date
      from public.attendance a
     where a.status::text = 'absent_maladie'
     order by a.employee_id, a.activity_date
  loop
    perform public.sync_sick_certificate(r.employee_id, r.activity_date);
  end loop;
end $$;

-- ===== supabase/migrations/046_equipes_par_poste.sql =====
-- =============================================================================
-- 046 — Rapport camions : équipe propre à chaque poste (Matin / Soir)
--
--  Un même camion peut travailler le matin et le soir avec des équipes différentes. Jusqu'ici,
--  l'équipe affichée pour chaque ligne camion venait du rapport de collecte du jour (une seule
--  équipe par camion et par jour) : la ligne du Soir montrait l'équipe du Matin.
--
--  Désormais chaque ligne camion (Matin ou Soir, truck_daily_reports) a :
--   - son chauffeur (colonne existante chauffeur_id) ;
--   - ses équipiers (nouvelle table truck_report_crew : employés de la base, sans doublon,
--     fonction au moment de l'affectation conservée) ;
--   - son tonnage, ses vidages, ses km (colonnes existantes).
--  La ligne du Soir n'hérite jamais de l'équipe du Matin.
--  La ligne Matin n° 1 suit le rapport de collecte / le pointage tant que son équipe n'a pas été
--  corrigée dans le rapport camions (crew_manual).
--  Reprise : l'équipe actuelle de chaque rapport de collecte est copiée sur la ligne Matin n° 1
--  du même camion et du même jour (aucune équipe inventée pour le Soir). Aucune donnée supprimée.
-- =============================================================================

alter table public.truck_daily_reports add column if not exists crew_manual boolean not null default false;

create table if not exists public.truck_report_crew (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references public.truck_daily_reports (id) on delete cascade,
  activity_date  date not null,
  employee_id    uuid not null references public.employees (id) on delete restrict,
  -- fonction de l'employé au moment de l'affectation (historique conservé)
  position       text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  unique (report_id, employee_id)
);
create index if not exists truck_report_crew_employee_idx on public.truck_report_crew (employee_id, activity_date);

-- ---------- Reprise de l'équipe du Matin (avant les contrôles de journée clôturée) --------------
insert into public.truck_report_crew (report_id, activity_date, employee_id, position)
select t.id, t.activity_date, r.employee_id,
       coalesce((select a.position::text from public.attendance a
                  where a.employee_id = r.employee_id and a.activity_date = t.activity_date and a.shift = 1 limit 1), e.position::text)
  from public.truck_daily_reports t
  join public.collection_reports c on c.activity_date = t.activity_date and c.truck_id = t.truck_id
  join public.collection_report_rippers r on r.report_id = c.id
  join public.employees e on e.id = r.employee_id
 where t.shift = 'matin' and t.line_no = 1 and r.employee_id is distinct from t.chauffeur_id
on conflict (report_id, employee_id) do nothing;

-- ---------- Date et fonction reprises de la ligne et de la fiche ----------------------------
create or replace function public.truck_report_crew_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select t.activity_date into new.activity_date from public.truck_daily_reports t where t.id = new.report_id;
  if coalesce(new.position, '') = '' then
    select coalesce((select a.position::text from public.attendance a where a.employee_id = new.employee_id and a.activity_date = new.activity_date and a.shift = 1 limit 1), e.position::text)
      into new.position from public.employees e where e.id = new.employee_id;
  end if;
  return new;
end;
$$;

-- Nombre de rippeurs de la ligne = nombre d'équipiers nommés
create or replace function public.truck_report_crew_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid := coalesce(new.report_id, old.report_id);
begin
  update public.truck_daily_reports t
     set rippers_count = (select count(*) from public.truck_report_crew c where c.report_id = v_id)
   where t.id = v_id and t.rippers_count is distinct from (select count(*) from public.truck_report_crew c where c.report_id = v_id);
  return null;
end;
$$;

-- Déclencheurs avant : ordre alphabétique (date d'abord, puis contrôle de journée clôturée)
drop trigger if exists truck_report_crew_a_defaults on public.truck_report_crew;
create trigger truck_report_crew_a_defaults before insert or update on public.truck_report_crew
  for each row execute function public.truck_report_crew_defaults();
drop trigger if exists truck_report_crew_day_open on public.truck_report_crew;
create trigger truck_report_crew_day_open before insert or update or delete on public.truck_report_crew
  for each row execute function public.assert_day_open();
drop trigger if exists truck_report_crew_set_audit on public.truck_report_crew;
create trigger truck_report_crew_set_audit before insert or update on public.truck_report_crew
  for each row execute function public.set_audit_columns();
drop trigger if exists truck_report_crew_audit on public.truck_report_crew;
create trigger truck_report_crew_audit after insert or update or delete on public.truck_report_crew
  for each row execute function public.audit_trigger();
drop trigger if exists truck_report_crew_zz_count on public.truck_report_crew;
create trigger truck_report_crew_zz_count after insert or delete on public.truck_report_crew
  for each row execute function public.truck_report_crew_count();

alter table public.truck_report_crew enable row level security;
drop policy if exists "truck_report_crew_select" on public.truck_report_crew;
create policy "truck_report_crew_select" on public.truck_report_crew for select to authenticated using (public.can_view('rapport_camions'));
drop policy if exists "truck_report_crew_write" on public.truck_report_crew;
create policy "truck_report_crew_write" on public.truck_report_crew for all to authenticated
  using (public.can_edit('rapport_camions') or public.can_edit('rapport_journalier'))
  with check (public.can_edit('rapport_camions') or public.can_edit('rapport_journalier'));
grant select, insert, update, delete on public.truck_report_crew to authenticated;

-- ---------- Journal des modifications (migration 044) : équipe de la ligne -------------------
create or replace function public.audit_table_module(p_table text)
returns text
language sql
immutable
as $$
  select case p_table
    when 'attendance' then 'pointage'
    when 'cleaning_reports' then 'rapport_journalier'
    when 'cleaning_report_agents' then 'rapport_journalier'
    when 'collection_reports' then 'rapport_journalier'
    when 'collection_report_rippers' then 'rapport_journalier'
    when 'cleaning_daily_summary' then 'rapport_journalier'
    when 'truck_daily_reports' then 'rapport_camions'
    when 'truck_report_crew' then 'rapport_camions'
  end;
$$;

-- ===== supabase/migrations/047_conge_depuis_pointage.sql =====
-- =============================================================================
-- 047 — Congé saisi directement au pointage : demande créée automatiquement
--
--  Un employé mis en « Congé » au pointage sans demande préalable reçoit une demande
--  « Approuvée automatiquement – depuis Pointage » (une date, source = pointage, liée à la ligne
--  de pointage d'origine). Le jour n'est déduit qu'une fois : le solde compte les jours par employé
--  et par date (days_taken), que le jour vienne du pointage, de la demande, ou des deux.
--   * Une demande acceptée ou en attente couvre déjà la date : aucune demande créée.
--   * Pointage changé (« Congé » → autre statut) ou ligne retirée : la demande automatique passe
--     « Annulée » (conservée dans l'historique) ; remise en « Congé » : la même demande est réactivée.
--   * Une demande saisie à la main n'est jamais modifiée par le pointage et garde sa protection
--     (CONGE_APPROUVE). La demande automatique ne verrouille pas le pointage : c'est lui qui la pilote.
--   * Demande saisie à la main acceptée sur la même date : elle remplace la demande automatique.
--  Reprise : les jours déjà pointés « Congé » sans demande reçoivent leur demande. Le pointage
--  existant n'est pas modifié (ni statut, ni date de saisie) et le solde ne change pas.
-- =============================================================================

alter table public.leave_requests add column if not exists source text not null default 'manuel';
alter table public.leave_requests drop constraint if exists leave_requests_source_chk;
alter table public.leave_requests add constraint leave_requests_source_chk check (source in ('manuel', 'pointage'));
-- Ligne de pointage d'origine (la demande reste si la ligne est retirée)
alter table public.leave_requests add column if not exists source_attendance_id uuid references public.attendance (id) on delete set null;
create index if not exists leave_requests_source_idx on public.leave_requests (employee_id, start_date) where source = 'pointage';

-- Ces colonnes de liaison ne sont pas des modifications de la feuille (indicateur « Modifié », migration 044)
create or replace function public.audit_real_change(p_action text, p_old jsonb, p_new jsonb)
returns boolean
language sql
immutable
as $$
  select p_action = 'DELETE'
      or (p_action = 'UPDATE'
          and (coalesce(p_old, '{}'::jsonb) - array['updated_at', 'updated_by', 'created_at', 'created_by', 'leave_request_id', 'pre_leave_status'])
              is distinct from
              (coalesce(p_new, '{}'::jsonb) - array['updated_at', 'updated_by', 'created_at', 'created_by', 'leave_request_id', 'pre_leave_status']));
$$;

-- ---------- Seule une demande saisie à la main verrouille le pointage ------------------------
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
  if coalesce(current_setting('esj.suppression_contrat', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_row := case when tg_op = 'DELETE' then old else new end;
  if tg_op <> 'DELETE' and new.status::text = 'conge' then
    if new.leave_request_id is null then
      new.leave_request_id := public.approved_leave_for(new.employee_id, new.activity_date);
    end if;
    return new;
  end if;
  if exists (select 1 from public.leave_requests lr
              where lr.employee_id = v_row.employee_id and lr.status::text = 'acceptee' and lr.source = 'manuel'
                and v_row.activity_date between lr.start_date and lr.end_date
                and not public.is_rest_day(v_row.employee_id, v_row.activity_date))
     and not public.has_leave_override(v_row.employee_id, v_row.activity_date) then
    select last_name || ' ' || first_name into v_name from public.employees where id = v_row.employee_id;
    raise exception 'CONGE_APPROUVE|%|%', coalesce(v_name, '?'), to_char(v_row.activity_date, 'DD/MM/YYYY');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ---------- Demande → pointage : sauf quand c'est le pointage qui pilote la demande ------------
create or replace function public.leave_requests_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('esj.conge_depuis_pointage', true), '') = 'on' then
    return new;
  end if;
  if new.status::text = 'acceptee' and new.source = 'manuel' then
    -- Demande saisie à la main acceptée : elle remplace les demandes automatiques des mêmes dates
    perform set_config('esj.conge_depuis_pointage', 'on', true);
    update public.leave_requests a
       set status = 'annulee', decision_note = 'Remplacée par une demande saisie', decided_at = now()
     where a.source = 'pointage' and a.status::text = 'acceptee' and a.employee_id = new.employee_id
       and a.start_date between new.start_date and new.end_date;
    perform set_config('esj.conge_depuis_pointage', '', true);
  elsif new.source = 'pointage' and new.status::text <> 'acceptee' then
    -- Demande automatique refusée ou annulée depuis Congés : ses lignes de pointage la suivent
    update public.attendance a
       set leave_request_id = new.id
     where a.employee_id = new.employee_id and a.activity_date between new.start_date and new.end_date
       and a.status::text = 'conge' and a.leave_request_id is null and not public.is_day_closed(a.activity_date);
  end if;
  perform public.sync_leave_attendance(new.id);
  return new;
end;
$$;

-- ---------- Pointage → demande automatique ------------------------------------------------------
create or replace function public.attendance_auto_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Suppression définitive d'un contrat : pas de suivi des demandes
  if coalesce(current_setting('esj.suppression_contrat', true), '') = 'on' then
    return null;
  end if;
  -- Le statut quitte « Congé », ou la ligne est retirée : demande automatique annulée (jamais une demande manuelle)
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.status::text = 'conge' and new.status::text <> 'conge') then
    if not exists (select 1 from public.attendance a where a.employee_id = old.employee_id and a.activity_date = old.activity_date and a.status::text = 'conge') then
      perform set_config('esj.conge_depuis_pointage', 'on', true);
      update public.leave_requests lr
         set status = 'annulee', decision_note = 'Statut du pointage modifié', decided_at = now(), decided_by = auth.uid()
       where lr.source = 'pointage' and lr.status::text = 'acceptee' and lr.employee_id = old.employee_id
         and lr.start_date = old.activity_date and lr.end_date = old.activity_date;
      perform set_config('esj.conge_depuis_pointage', '', true);
    end if;
    return null;
  end if;

  if new.status::text <> 'conge' or (tg_op = 'UPDATE' and old.status::text = 'conge') then
    return null;
  end if;
  -- Une demande acceptée ou en attente couvre déjà cette date : pas de doublon
  if exists (select 1 from public.leave_requests lr
              where lr.employee_id = new.employee_id and new.activity_date between lr.start_date and lr.end_date
                and lr.status::text in ('acceptee', 'en_attente')) then
    return null;
  end if;
  perform set_config('esj.conge_depuis_pointage', 'on', true);
  -- Déjà créée puis annulée pour cette date : la même demande est réactivée
  select lr.id into v_id from public.leave_requests lr
   where lr.source = 'pointage' and lr.employee_id = new.employee_id
     and lr.start_date = new.activity_date and lr.end_date = new.activity_date
   order by lr.created_at limit 1;
  if v_id is not null then
    update public.leave_requests
       set status = 'acceptee', decision_note = '', decided_at = now(), decided_by = auth.uid(), source_attendance_id = new.id
     where id = v_id;
  else
    insert into public.leave_requests (employee_id, request_date, start_date, end_date, requested_days, reason, status, source, source_attendance_id, decided_by, decided_at)
    values (new.employee_id, new.activity_date, new.activity_date, new.activity_date, 1, '', 'acceptee', 'pointage', new.id, auth.uid(), now());
  end if;
  perform set_config('esj.conge_depuis_pointage', '', true);
  return null;
end;
$$;
drop trigger if exists attendance_auto_leave on public.attendance;
create trigger attendance_auto_leave after insert or update of status or delete on public.attendance
  for each row execute function public.attendance_auto_leave();

-- ---------- Reprise : jours déjà pointés « Congé » sans demande ----------------------------------
do $$
declare
  r record;
begin
  perform set_config('esj.conge_depuis_pointage', 'on', true);
  for r in
    select distinct on (a.employee_id, a.activity_date) a.id, a.employee_id, a.activity_date
      from public.attendance a
     where a.status::text = 'conge' and a.leave_request_id is null
       and not exists (select 1 from public.leave_requests lr
                        where lr.employee_id = a.employee_id and a.activity_date between lr.start_date and lr.end_date
                          and lr.status::text in ('acceptee', 'en_attente'))
     order by a.employee_id, a.activity_date, a.shift
  loop
    insert into public.leave_requests (employee_id, request_date, start_date, end_date, requested_days, reason, status, source, source_attendance_id, decided_at)
    values (r.employee_id, r.activity_date, r.activity_date, r.activity_date, 1, '', 'acceptee', 'pointage', r.id, now());
  end loop;
  perform set_config('esj.conge_depuis_pointage', '', true);
end $$;

-- ===== supabase/migrations/048_suppression_demande_conge.sql =====
-- =============================================================================
-- 048 — Suppression d'une demande de congé (archivage)
--
--  Les demandes n'ont jamais été effacées physiquement (aucun droit DELETE) : une demande
--  « supprimée » est archivée (deleted_at, deleted_by, deletion_reason) et passe « Annulée », ce qui
--  la retire du solde et des calculs. Elle disparaît des écrans, reste dans la base et dans le journal
--  d'audit (qui, quand, motif, valeurs). L'employé et les autres demandes ne sont pas touchés.
--   * Demande saisie, acceptée : le congé est retiré du pointage (comme une annulation : statut
--     d'origine restauré, lignes créées par la demande retirées) ; solde recalculé.
--   * En attente, refusée, annulée : aucun effet sur le solde ni le pointage.
--   * Demande automatique (depuis le pointage) : l'utilisateur choisit le sort de la ligne de pointage :
--     garder « Congé » (le jour reste déduit, car le pointage fait foi) ou un autre statut (jour rendu).
--     La ligne n'est jamais supprimée, et la demande n'est pas recréée tant que l'employé n'est pas
--     de nouveau mis en « Congé » au pointage (dans ce cas, c'est une nouvelle demande).
--   * Journée clôturée : pointage non modifié, signalé à l'utilisateur.
-- =============================================================================

alter table public.leave_requests add column if not exists deleted_at timestamptz;
alter table public.leave_requests add column if not exists deleted_by uuid references auth.users (id);
alter table public.leave_requests add column if not exists deletion_reason text not null default '';

-- Une demande automatique archivée n'est jamais réactivée par le pointage
create or replace function public.attendance_auto_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Suppression définitive d'un contrat : pas de suivi des demandes
  if coalesce(current_setting('esj.suppression_contrat', true), '') = 'on' then
    return null;
  end if;
  -- Le statut quitte « Congé », ou la ligne est retirée : demande automatique annulée (jamais une demande manuelle)
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.status::text = 'conge' and new.status::text <> 'conge') then
    if not exists (select 1 from public.attendance a where a.employee_id = old.employee_id and a.activity_date = old.activity_date and a.status::text = 'conge') then
      perform set_config('esj.conge_depuis_pointage', 'on', true);
      update public.leave_requests lr
         set status = 'annulee', decision_note = 'Statut du pointage modifié', decided_at = now(), decided_by = auth.uid()
       where lr.source = 'pointage' and lr.status::text = 'acceptee' and lr.employee_id = old.employee_id
         and lr.start_date = old.activity_date and lr.end_date = old.activity_date;
      perform set_config('esj.conge_depuis_pointage', '', true);
    end if;
    return null;
  end if;

  if new.status::text <> 'conge' or (tg_op = 'UPDATE' and old.status::text = 'conge') then
    return null;
  end if;
  -- Une demande acceptée ou en attente couvre déjà cette date : pas de doublon
  if exists (select 1 from public.leave_requests lr
              where lr.employee_id = new.employee_id and new.activity_date between lr.start_date and lr.end_date
                and lr.status::text in ('acceptee', 'en_attente')) then
    return null;
  end if;
  perform set_config('esj.conge_depuis_pointage', 'on', true);
  -- Déjà créée puis annulée pour cette date (non supprimée) : la même demande est réactivée
  select lr.id into v_id from public.leave_requests lr
   where lr.source = 'pointage' and lr.deleted_at is null and lr.employee_id = new.employee_id
     and lr.start_date = new.activity_date and lr.end_date = new.activity_date
   order by lr.created_at limit 1;
  if v_id is not null then
    update public.leave_requests
       set status = 'acceptee', decision_note = '', decided_at = now(), decided_by = auth.uid(), source_attendance_id = new.id
     where id = v_id;
  else
    insert into public.leave_requests (employee_id, request_date, start_date, end_date, requested_days, reason, status, source, source_attendance_id, decided_by, decided_at)
    values (new.employee_id, new.activity_date, new.activity_date, new.activity_date, 1, '', 'acceptee', 'pointage', new.id, auth.uid(), now());
  end if;
  perform set_config('esj.conge_depuis_pointage', '', true);
  return null;
end;
$$;

-- p_attendance_status (demande automatique) : null = garder « Congé » au pointage ; sinon nouveau statut
create or replace function public.delete_leave_request(p_id uuid, p_reason text default '', p_attendance_status text default null)
returns table (kept_conge integer, changed integer, closed integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.leave_requests;
  a record;
  v_kept int := 0;
  v_changed int := 0;
  v_closed int := 0;
begin
  if not public.can_edit('conges') then
    raise exception 'ACCES_REFUSE: suppression non autorisée.';
  end if;
  select * into r from public.leave_requests where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'DEMANDE_INTROUVABLE: demande introuvable ou déjà supprimée.';
  end if;
  if p_attendance_status is not null and p_attendance_status not in ('present', 'absent', 'repos') then
    raise exception 'STATUT_INVALIDE: %', p_attendance_status;
  end if;

  if r.source = 'pointage' then
    -- Le pointage ne suit pas automatiquement : c'est le choix de l'utilisateur qui s'applique
    perform set_config('esj.conge_depuis_pointage', 'on', true);
    update public.leave_requests
       set status = 'annulee', deleted_at = now(), deleted_by = auth.uid(), deletion_reason = left(coalesce(p_reason, ''), 500), decision_note = 'Demande supprimée'
     where id = p_id;
    perform set_config('esj.conge_depuis_pointage', '', true);
    for a in
      select at.id, at.activity_date from public.attendance at
       where at.employee_id = r.employee_id and at.activity_date between r.start_date and r.end_date and at.status::text = 'conge'
    loop
      if public.is_day_closed(a.activity_date) then
        v_closed := v_closed + 1;
      elsif p_attendance_status is null then
        update public.attendance set leave_request_id = null where id = a.id;
        v_kept := v_kept + 1;
      else
        update public.attendance
           set status = p_attendance_status::public.attendance_status, leave_request_id = null, pre_leave_status = null
         where id = a.id;
        v_changed := v_changed + 1;
      end if;
    end loop;
  else
    -- Même effet qu'une annulation (déclencheur leave_requests_sync) ; sans effet si elle n'était pas acceptée
    update public.leave_requests
       set status = 'annulee', deleted_at = now(), deleted_by = auth.uid(), deletion_reason = left(coalesce(p_reason, ''), 500), decision_note = 'Demande supprimée'
     where id = p_id;
    select count(*)::int into v_closed from public.attendance at where at.leave_request_id = p_id and public.is_day_closed(at.activity_date);
  end if;
  return query select v_kept, v_changed, v_closed;
end;
$$;
revoke all on function public.delete_leave_request(uuid, text, text) from public;
grant execute on function public.delete_leave_request(uuid, text, text) to authenticated;

