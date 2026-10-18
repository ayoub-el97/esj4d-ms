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
