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
