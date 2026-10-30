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
