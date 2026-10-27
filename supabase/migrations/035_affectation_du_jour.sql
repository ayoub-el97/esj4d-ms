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
