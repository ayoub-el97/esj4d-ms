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
