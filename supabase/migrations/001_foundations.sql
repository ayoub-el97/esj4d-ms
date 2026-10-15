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
